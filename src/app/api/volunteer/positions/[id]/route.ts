import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { notifyVolunteerCancellation } from "@/lib/notifications";
import { logActivity } from "@/lib/activity-log";

async function getActiveVolunteer() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return null;
  const user = await prisma.user.findUnique({
    where: { email: session.user.email },
    include: { volunteer: true },
  });
  if (!user) return null;
  const isVolunteerRole = user.role === "VOLUNTEER" || user.role === "ADMIN" || user.role === "INSTRUCTOR";
  if (!isVolunteerRole || user.status !== "ACTIVE") return null;
  return user;
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getActiveVolunteer();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

  const { id } = await params;
  const profile = user.volunteer;
  if (!profile) return NextResponse.json({ error: "No volunteer profile" }, { status: 403 });

  const position = await prisma.shiftPosition.findUnique({
    where: { id },
    include: {
      shift: { include: { clinic: true } },
    },
  });

  if (!position) return NextResponse.json({ error: "Position not found" }, { status: 404 });
  if (position.volunteerId !== profile.id) return NextResponse.json({ error: "Not your position" }, { status: 403 });
  if (position.status !== "FILLED") return NextResponse.json({ error: "Position is not active" }, { status: 409 });

  const now = new Date();
  const shiftDate = position.shift.date;
  const volunteerStartMs = position.shift.volunteerStart * 60 * 1000; // minutes → ms
  const shiftStartTime = new Date(shiftDate.getTime() + volunteerStartMs - shiftDate.getTimezoneOffset() * 60000);
  const msUntilShift = shiftStartTime.getTime() - now.getTime();
  const hoursUntilShift = msUntilShift / (1000 * 60 * 60);

  // Cancellation penalty counters
  const updates: Record<string, number> = {};
  if (hoursUntilShift <= 2) updates.cancellationsWithin2h = profile.cancellationsWithin2h + 1;
  if (hoursUntilShift <= 24) updates.cancellationsWithin24h = profile.cancellationsWithin24h + 1;

  await prisma.$transaction(async (tx) => {
    // Cancel the position
    await tx.shiftPosition.update({
      where: { id },
      data: { status: "CANCELLED", volunteerId: null, cancelledAt: now, signedUpAt: null },
    });

    // If driver cancels: re-lock all other positions and clear their language assignments
    if (position.isDriver) {
      await tx.shiftPosition.updateMany({
        where: { shiftId: position.shiftId, isDriver: false },
        data: { status: "LOCKED", languageCode: null, volunteerId: null, cancelledAt: null, signedUpAt: null },
      });
      // Re-open driver seat
      await tx.shiftPosition.update({
        where: { id },
        data: { status: "OPEN", languageCode: null },
      });
    } else {
      // Non-driver cancels: just re-open that seat
      await tx.shiftPosition.update({
        where: { id },
        data: { status: "OPEN", languageCode: position.languageCode },
      });
    }

    // Update penalty counters
    if (Object.keys(updates).length > 0) {
      await tx.volunteerProfile.update({ where: { id: profile.id }, data: updates });
    }
  });

  // Send notification
  if (user.email) {
    await notifyVolunteerCancellation({
      positionId: id,
      volunteerEmail: user.email,
      clinicName: position.shift.clinic.name,
      date: position.shift.date,
      volunteerStart: position.shift.volunteerStart,
      volunteerEnd: position.shift.volunteerEnd,
      language: position.languageCode ?? "",
      isWithin24h: hoursUntilShift <= 24,
      clinicContactEmail: position.shift.clinic.contactEmail,
    }).catch(console.error);
  }

  await logActivity({
    actorId: user.id,
    actorEmail: user.email ?? undefined,
    actorName: user.name ?? undefined,
    action: "POSITION_CANCELLED",
    targetType: "ShiftPosition",
    targetId: id,
    detail: `Cancelled ${position.isDriver ? "driver " : ""}position at ${position.shift.clinic.name}`,
  });

  return NextResponse.json({ success: true });
}
