import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { logActivity } from "@/lib/activity-log";
import { notifyShiftCancelled, notifyShiftUpdated } from "@/lib/notifications";
import { updateShiftCalEvent } from "@/lib/notifications/gcal";

async function getAdmin() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return null;
  const user = await prisma.user.findUnique({ where: { email: session.user.email } });
  if (!user || (user.role !== "ADMIN" && !user.roles.includes("DEV"))) return null;
  return user;
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await getAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

  const { id } = await params;
  const body = await req.json();
  const { date, volunteerStart, volunteerEnd, travelMinutes, keyRetrievalTime, keyReturnTime, languagesNeeded, notes } = body;

  const shift = await prisma.shift.findUnique({
    where: { id },
    include: {
      clinic: true,
      positions: {
        include: {
          volunteer: { include: { user: { select: { name: true, email: true } } } },
        },
      },
    },
  });
  if (!shift || shift.status !== "ACTIVE") {
    return NextResponse.json({ error: "Shift not found or inactive" }, { status: 404 });
  }

  const updateData: Record<string, unknown> = {};
  if (date != null) updateData.date = new Date(date + "T12:00:00");
  if (volunteerStart != null) updateData.volunteerStart = Number(volunteerStart);
  if (volunteerEnd != null) updateData.volunteerEnd = Number(volunteerEnd);
  if (travelMinutes != null) updateData.travelMinutes = Number(travelMinutes);
  if (keyRetrievalTime !== undefined) updateData.keyRetrievalTime = keyRetrievalTime != null ? Number(keyRetrievalTime) : null;
  if (keyReturnTime !== undefined) updateData.keyReturnTime = keyReturnTime != null ? Number(keyReturnTime) : null;
  if (notes !== undefined) updateData.notes = notes || null;

  // If languagesNeeded changed: rebuild positions, cancel filled ones
  let cancelledPositions: typeof shift.positions = [];
  if (languagesNeeded && Array.isArray(languagesNeeded)) {
    updateData.languagesNeeded = languagesNeeded;

    // Cancel any FILLED positions whose volunteers are displaced
    cancelledPositions = shift.positions.filter(
      (p) => p.status === "FILLED" && p.positionNumber > languagesNeeded.length,
    );

    await prisma.$transaction(async (tx) => {
      await tx.shift.update({ where: { id }, data: updateData });

      // Delete all existing positions and recreate
      await tx.shiftPosition.deleteMany({ where: { shiftId: id } });
      await tx.shiftPosition.createMany({
        data: languagesNeeded.map((_: string, i: number) => ({
          shiftId: id,
          positionNumber: i + 1,
          isDriver: i === 0,
          languageCode: null,
          status: i === 0 ? "OPEN" : "LOCKED",
        })),
      });
    });
  } else {
    await prisma.shift.update({ where: { id }, data: updateData });
  }

  // Notify displaced volunteers
  if (cancelledPositions.length > 0) {
    const emails = cancelledPositions
      .map((p) => p.volunteer?.user?.email)
      .filter(Boolean) as string[];
    if (emails.length > 0) {
      await notifyShiftUpdated({ shift, cancelledEmails: emails }).catch(console.error);
    }
  }

  // Fetch the updated shift to get current values for GCal
  const updatedShift = await prisma.shift.findUnique({ where: { id }, include: { clinic: true } });
  if (updatedShift) {
    await updateShiftCalEvent(id, {
      date: updatedShift.date,
      volunteerStart: updatedShift.volunteerStart,
      volunteerEnd: updatedShift.volunteerEnd,
      travelMinutes: updatedShift.travelMinutes,
      keyRetrievalTime: updatedShift.keyRetrievalTime,
      keyReturnTime: updatedShift.keyReturnTime,
      clinicName: updatedShift.clinic.name,
      clinicAddress: updatedShift.clinic.address,
      notes: updatedShift.notes,
    }).catch(console.error);
  }

  await logActivity({
    actorId: admin.id,
    actorEmail: admin.email ?? undefined,
    actorName: admin.name ?? undefined,
    action: "SHIFT_UPDATED",
    targetType: "Shift",
    targetId: id,
    detail: `Updated shift for ${shift.clinic.name} on ${shift.date.toISOString().split("T")[0]}`,
  });

  const updated = await prisma.shift.findUnique({
    where: { id },
    include: {
      clinic: { select: { id: true, name: true, address: true } },
      positions: {
        orderBy: { positionNumber: "asc" },
        include: {
          volunteer: { include: { user: { select: { name: true, email: true } } } },
        },
      },
    },
  });

  return NextResponse.json(updated);
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await getAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

  const { id } = await params;

  const shift = await prisma.shift.findUnique({
    where: { id },
    include: {
      clinic: true,
      positions: {
        where: { status: "FILLED" },
        include: {
          volunteer: { include: { user: { select: { name: true, email: true } } } },
        },
      },
    },
  });
  if (!shift || shift.status !== "ACTIVE") {
    return NextResponse.json({ error: "Shift not found or already cancelled" }, { status: 404 });
  }

  // Cancel all filled positions and the shift
  await prisma.$transaction([
    prisma.shiftPosition.updateMany({
      where: { shiftId: id, status: { in: ["OPEN", "FILLED", "LOCKED"] } },
      data: { status: "CANCELLED", cancelledAt: new Date() },
    }),
    prisma.shift.update({ where: { id }, data: { status: "CANCELLED" } }),
  ]);

  // Delete GCal event + notify all affected volunteers via Gmail
  const emails = shift.positions
    .map((p) => p.volunteer?.user?.email)
    .filter(Boolean) as string[];
  await notifyShiftCancelled({ shiftId: id, shift, volunteerEmails: emails }).catch(console.error);

  await logActivity({
    actorId: admin.id,
    actorEmail: admin.email ?? undefined,
    actorName: admin.name ?? undefined,
    action: "SHIFT_CANCELLED",
    targetType: "Shift",
    targetId: id,
    detail: `Cancelled shift for ${shift.clinic.name} on ${shift.date.toISOString().split("T")[0]}`,
  });

  return NextResponse.json({ success: true });
}
