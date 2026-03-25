import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { notifyVolunteerSignup } from "@/lib/notifications";

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

export async function GET() {
  const user = await getActiveVolunteer();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  if (!user.volunteer) return NextResponse.json([]);

  const signups = await prisma.subBlockSignup.findMany({
    where: { volunteerId: user.volunteer.id, status: "ACTIVE" },
    include: {
      slot: {
        include: { clinic: { select: { name: true, address: true } } },
      },
    },
    orderBy: [{ slot: { date: "asc" } }, { subBlockHour: "asc" }],
  });

  return NextResponse.json(signups);
}

export async function POST(req: NextRequest) {
  const user = await getActiveVolunteer();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

  // Auto-create volunteer profile if needed
  let profile = user.volunteer;
  if (!profile) {
    profile = await prisma.volunteerProfile.create({
      data: { userId: user.id, languages: [] },
    });
  }

  const body = await req.json();
  const { slotId, subBlockHour } = body;

  if (!slotId || subBlockHour == null) {
    return NextResponse.json({ error: "slotId and subBlockHour required" }, { status: 400 });
  }

  const slot = await prisma.slot.findUnique({
    where: { id: slotId },
    include: { clinic: true },
  });
  if (!slot || slot.status !== "ACTIVE") {
    return NextResponse.json({ error: "Slot not found or inactive" }, { status: 404 });
  }

  // Enforce language match — profile.languages must include the slot's language
  if (!profile.languages.includes(slot.language)) {
    return NextResponse.json(
      { error: "Your language profile does not include this slot's language. Update your profile first." },
      { status: 403 }
    );
  }

  const hour = Number(subBlockHour);
  if (hour < slot.startTime || hour >= slot.endTime) {
    return NextResponse.json({ error: "Invalid sub-block hour" }, { status: 400 });
  }

  // Check capacity
  const filledCount = await prisma.subBlockSignup.count({
    where: { slotId, subBlockHour: hour, status: "ACTIVE" },
  });
  if (filledCount >= slot.interpreterCount) {
    return NextResponse.json({ error: "Sub-block is full" }, { status: 409 });
  }

  // Check duplicate
  const duplicate = await prisma.subBlockSignup.findFirst({
    where: { slotId, volunteerId: profile.id, subBlockHour: hour, status: "ACTIVE" },
  });
  if (duplicate) {
    return NextResponse.json({ error: "Already signed up for this hour" }, { status: 409 });
  }

  const signup = await prisma.subBlockSignup.create({
    data: { slotId, volunteerId: profile.id, subBlockHour: hour },
  });

  await notifyVolunteerSignup({
    signupId: signup.id,
    volunteerEmail: user.email,
    volunteerName: user.name ?? user.email,
    clinicName: slot.clinic.name,
    clinicAddress: slot.clinic.address,
    clinicContactEmail: slot.clinic.contactEmail,
    language: slot.language,
    date: slot.date,
    subBlockHour: hour,
    notes: slot.notes,
  }).catch(console.error);

  return NextResponse.json(signup, { status: 201 });
}
