import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { notifyVolunteerAddedToShift, notifyAdminRemovedFromPosition } from "@/lib/notifications";
import { logActivity } from "@/lib/activity-log";

async function getAdmin() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return null;
  const user = await prisma.user.findUnique({ where: { email: session.user.email } });
  if (!user || (user.role !== "ADMIN" && !user.roles.includes("DEV"))) return null;
  return user;
}

// PATCH /api/admin/positions/[id] — admin assigns a volunteer to a position
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await getAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

  const { id: positionId } = await params;
  const body = await req.json();
  const { userId, languageCode } = body as { userId: string; languageCode?: string };

  if (!userId) return NextResponse.json({ error: "userId required" }, { status: 400 });

  const position = await prisma.shiftPosition.findUnique({
    where: { id: positionId },
    include: {
      shift: {
        include: { clinic: true, positions: { orderBy: { positionNumber: "asc" } } },
      },
    },
  });
  if (!position) return NextResponse.json({ error: "Position not found" }, { status: 404 });
  if (position.status !== "OPEN") {
    return NextResponse.json({ error: "Position is not available" }, { status: 409 });
  }

  const targetUser = await prisma.user.findUnique({ where: { id: userId }, include: { volunteer: true } });
  if (!targetUser) return NextResponse.json({ error: "User not found" }, { status: 404 });

  let profile = targetUser.volunteer;
  if (!profile) {
    profile = await prisma.volunteerProfile.create({ data: { userId, languages: [] } });
  }

  // Determine language
  let assignedLanguage: string;
  if (position.isDriver) {
    if (!languageCode) {
      return NextResponse.json({ error: "languageCode required for driver position" }, { status: 400 });
    }
    assignedLanguage = languageCode;
  } else {
    if (!position.languageCode) {
      return NextResponse.json({ error: "Position language not yet assigned — driver must sign up first" }, { status: 409 });
    }
    assignedLanguage = position.languageCode;
  }

  await prisma.$transaction(async (tx) => {
    await tx.shiftPosition.update({
      where: { id: positionId },
      data: { volunteerId: profile!.id, languageCode: assignedLanguage, status: "FILLED", signedUpAt: new Date() },
    });

    if (position.isDriver) {
      const otherNeeded = [...position.shift.languagesNeeded];
      const driverLangIdx = otherNeeded.findIndex((l) => l === assignedLanguage);
      otherNeeded.splice(driverLangIdx !== -1 ? driverLangIdx : 0, 1);

      const otherPositions = position.shift.positions
        .filter((p) => !p.isDriver)
        .sort((a, b) => a.positionNumber - b.positionNumber);

      for (let i = 0; i < otherPositions.length; i++) {
        await tx.shiftPosition.update({
          where: { id: otherPositions[i].id },
          data: { languageCode: otherNeeded[i] ?? null, status: "OPEN" },
        });
      }
    }
  });

  // Notify
  if (targetUser.email) {
    const { shift } = position;
    await notifyVolunteerAddedToShift({
      shiftId: position.shiftId,
      volunteerEmail: targetUser.email,
      volunteerName: targetUser.name ?? targetUser.email,
      byAdmin: true,
      clinicName: shift.clinic.name,
      clinicAddress: shift.clinic.address,
      language: assignedLanguage,
      date: shift.date,
      volunteerStart: shift.volunteerStart,
      volunteerEnd: shift.volunteerEnd,
      travelMinutes: shift.travelMinutes,
      keyRetrievalTime: shift.keyRetrievalTime,
      keyReturnTime: shift.keyReturnTime,
      notes: shift.notes,
    }).catch(console.error);
  }

  await logActivity({
    actorId: admin.id,
    actorEmail: admin.email ?? undefined,
    actorName: admin.name ?? undefined,
    action: "POSITION_FILLED",
    targetType: "ShiftPosition",
    targetId: positionId,
    detail: `Admin assigned ${targetUser.email} to ${position.isDriver ? "driver + " : ""}${assignedLanguage} position at ${position.shift.clinic.name}`,
  });

  return NextResponse.json({ success: true });
}

// DELETE /api/admin/positions/[id] — admin removes a volunteer from a position
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await getAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

  const { id: positionId } = await params;
  const position = await prisma.shiftPosition.findUnique({
    where: { id: positionId },
    include: {
      shift: { include: { clinic: true, positions: { orderBy: { positionNumber: "asc" } } } },
      volunteer: { include: { user: true } },
    },
  });
  if (!position) return NextResponse.json({ error: "Position not found" }, { status: 404 });
  if (position.status !== "FILLED") return NextResponse.json({ error: "Position is not filled" }, { status: 409 });

  await prisma.$transaction(async (tx) => {
    await tx.shiftPosition.update({
      where: { id: positionId },
      data: { volunteerId: null, languageCode: position.isDriver ? null : position.languageCode, status: "OPEN", signedUpAt: null },
    });

    if (position.isDriver) {
      // Re-lock all other positions
      const otherPositions = position.shift.positions.filter((p) => !p.isDriver);
      for (const p of otherPositions) {
        await tx.shiftPosition.update({
          where: { id: p.id },
          data: { volunteerId: null, languageCode: null, status: "LOCKED", signedUpAt: null },
        });
      }
    }
  });

  // Remove from GCal and notify volunteer
  const volunteerEmail = position.volunteer?.user?.email;
  const volunteerName = position.volunteer?.user?.name ?? volunteerEmail ?? "Volunteer";
  if (volunteerEmail && position.languageCode) {
    await notifyAdminRemovedFromPosition({
      shiftId: position.shiftId,
      volunteerEmail,
      volunteerName,
      clinicName: position.shift.clinic.name,
      language: position.languageCode,
      date: position.shift.date,
      volunteerStart: position.shift.volunteerStart,
      volunteerEnd: position.shift.volunteerEnd,
    }).catch(console.error);
  }

  await logActivity({
    actorId: admin.id,
    actorEmail: admin.email ?? undefined,
    actorName: admin.name ?? undefined,
    action: "POSITION_CANCELLED",
    targetType: "ShiftPosition",
    targetId: positionId,
    detail: `Admin removed volunteer from position at ${position.shift.clinic.name}`,
  });

  return NextResponse.json({ success: true });
}
