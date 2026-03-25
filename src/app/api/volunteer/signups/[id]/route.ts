import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { notifyVolunteerCancellation } from "@/lib/notifications";

async function getActiveVolunteer() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return null;
  const user = await prisma.user.findUnique({
    where: { email: session.user.email },
    include: { volunteer: true },
  });
  if (!user || user.role !== "VOLUNTEER" || user.status !== "ACTIVE") return null;
  return user;
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getActiveVolunteer();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  if (!user.volunteer) return NextResponse.json({ error: "No volunteer profile" }, { status: 404 });

  const { id } = await params;
  const signup = await prisma.subBlockSignup.findUnique({
    where: { id },
    include: { slot: { include: { clinic: true } } },
  });
  if (!signup || signup.volunteerId !== user.volunteer.id || signup.status !== "ACTIVE") {
    return NextResponse.json({ error: "Signup not found" }, { status: 404 });
  }

  // Compute actual slot start time: date stored at noon, startTime is the hour
  const slotDate = new Date(signup.slot.date);
  slotDate.setHours(signup.slot.startTime, 0, 0, 0);
  const hoursUntilSlot = (slotDate.getTime() - Date.now()) / (1000 * 60 * 60);

  await prisma.subBlockSignup.update({
    where: { id },
    data: { status: "CANCELLED", cancelledAt: new Date() },
  });

  // Increment cancellation counters based on how close to the slot it is
  const counterUpdate: { cancellationsWithin24h?: { increment: number }; cancellationsWithin2h?: { increment: number } } = {};
  if (hoursUntilSlot < 24) {
    counterUpdate.cancellationsWithin24h = { increment: 1 };
    if (hoursUntilSlot < 2) {
      counterUpdate.cancellationsWithin2h = { increment: 1 };
    }
  }

  if (Object.keys(counterUpdate).length > 0) {
    await prisma.volunteerProfile.update({
      where: { id: user.volunteer.id },
      data: counterUpdate,
    });
  }

  await notifyVolunteerCancellation({
    signupId: signup.id,
    volunteerEmail: user.email,
    volunteerName: user.name ?? user.email,
    clinicName: signup.slot.clinic.name,
    clinicContactEmail: signup.slot.clinic.contactEmail,
    clinicUrgentAlerts: signup.slot.clinic.urgentCancellationAlerts,
    language: signup.slot.language,
    date: signup.slot.date,
    subBlockHour: signup.subBlockHour,
    hoursUntilSlot,
  }).catch(console.error);

  return NextResponse.json({ ok: true });
}
