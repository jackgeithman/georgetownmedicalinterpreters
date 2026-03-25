import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { notifyNoShow } from "@/lib/notifications";

async function getClinicUser() {
  const session = await getServerSession(authOptions);
  if (session?.user?.role !== "CLINIC" || !session.user.clinicId) return null;
  return { clinicId: session.user.clinicId };
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getClinicUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

  const { id: slotId } = await params;
  const slot = await prisma.slot.findUnique({
    where: { id: slotId },
    include: { clinic: true },
  });
  if (!slot || slot.clinicId !== user.clinicId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const body = await req.json();
  const { signupId } = body;
  if (!signupId) return NextResponse.json({ error: "signupId required" }, { status: 400 });

  const signup = await prisma.subBlockSignup.findUnique({
    where: { id: signupId },
    include: { volunteer: { include: { user: { select: { email: true, name: true } } } } },
  });
  if (!signup || signup.slotId !== slotId || signup.status !== "ACTIVE") {
    return NextResponse.json({ error: "Signup not found or not active" }, { status: 404 });
  }

  await prisma.subBlockSignup.update({
    where: { id: signupId },
    data: { status: "NO_SHOW" },
  });

  await prisma.volunteerProfile.update({
    where: { id: signup.volunteerId },
    data: { noShows: { increment: 1 } },
  });

  await notifyNoShow({
    volunteerEmail: signup.volunteer.user.email,
    volunteerName: signup.volunteer.user.name ?? signup.volunteer.user.email,
    clinicName: slot.clinic.name,
    language: slot.language,
    date: slot.date,
    subBlockHour: signup.subBlockHour,
  }).catch(console.error);

  return NextResponse.json({ ok: true });
}
