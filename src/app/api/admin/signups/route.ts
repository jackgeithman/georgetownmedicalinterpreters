import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { notifyVolunteerSignup } from "@/lib/notifications";

async function getAdmin() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return null;
  const user = await prisma.user.findUnique({ where: { email: session.user.email } });
  if (!user || (user.role !== "ADMIN" && user.role !== "SUPER_ADMIN")) return null;
  return user;
}

export async function GET() {
  const admin = await getAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

  const signups = await prisma.subBlockSignup.findMany({
    where: { status: "ACTIVE" },
    orderBy: [{ slot: { date: "asc" } }, { subBlockHour: "asc" }],
    include: {
      slot: {
        include: { clinic: { select: { name: true } } },
      },
      volunteer: {
        include: { user: { select: { name: true, email: true } } },
      },
    },
  });

  return NextResponse.json(signups);
}

export async function POST(req: NextRequest) {
  const admin = await getAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

  const body = await req.json();
  const { slotId, subBlockHour, userId } = body;

  if (!slotId || subBlockHour == null || !userId) {
    return NextResponse.json({ error: "slotId, subBlockHour, and userId required" }, { status: 400 });
  }

  // Resolve target user and volunteer profile
  const targetUser = await prisma.user.findUnique({
    where: { id: userId },
    include: { volunteer: true },
  });
  if (!targetUser || targetUser.status !== "ACTIVE") {
    return NextResponse.json({ error: "User not found or inactive" }, { status: 404 });
  }

  // Create volunteer profile if this user doesn't have one yet
  let profile = targetUser.volunteer;
  if (!profile) {
    profile = await prisma.volunteerProfile.create({
      data: { userId: targetUser.id, languages: [] },
    });
  }

  const slot = await prisma.slot.findUnique({
    where: { id: slotId },
    include: { clinic: true },
  });
  if (!slot || slot.status !== "ACTIVE") {
    return NextResponse.json({ error: "Slot not found or inactive" }, { status: 404 });
  }

  const hour = Number(subBlockHour);
  if (hour < slot.startTime || hour >= slot.endTime) {
    return NextResponse.json({ error: "Invalid sub-block hour" }, { status: 400 });
  }

  const filledCount = await prisma.subBlockSignup.count({
    where: { slotId, subBlockHour: hour, status: "ACTIVE" },
  });
  if (filledCount >= slot.interpreterCount) {
    return NextResponse.json({ error: "Sub-block is full" }, { status: 409 });
  }

  const duplicate = await prisma.subBlockSignup.findFirst({
    where: { slotId, volunteerId: profile.id, subBlockHour: hour, status: "ACTIVE" },
  });
  if (duplicate) {
    return NextResponse.json({ error: "Volunteer is already signed up for this hour" }, { status: 409 });
  }

  const signup = await prisma.subBlockSignup.create({
    data: { slotId, volunteerId: profile.id, subBlockHour: hour },
  });

  // Send GCal invite to the assigned volunteer
  if (targetUser.email) {
    await notifyVolunteerSignup({
      signupId: signup.id,
      volunteerEmail: targetUser.email,
      clinicName: slot.clinic.name,
      clinicAddress: slot.clinic.address,
      language: slot.language,
      date: slot.date,
      subBlockHour: hour,
      notes: slot.notes,
    }).catch(console.error);
  }

  return NextResponse.json(signup, { status: 201 });
}
