import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { notifyVolunteerSignup } from "@/lib/notifications";
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

  let profile = user.volunteer;
  if (!profile) {
    profile = await prisma.volunteerProfile.create({
      data: { userId: user.id, languages: [] },
    });
  }
  if (!profile) return NextResponse.json({ error: "Profile error" }, { status: 500 });

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

  const langCode = slot.language;
  const isCleared = user.roles.includes(`LANG_${langCode}_CLEARED`);
  if (!isCleared) {
    const isDenied = user.roles.includes(`LANG_${langCode}_DENIED`);
    const isPending = user.roles.includes(`LANG_${langCode}`);
    if (isDenied) {
      return NextResponse.json(
        { error: "Your clearance request for this language was not approved. Please contact your coordinator." },
        { status: 403 },
      );
    }
    if (isPending) {
      return NextResponse.json(
        { error: "You are awaiting language clearance. You cannot sign up until you have been cleared." },
        { status: 403 },
      );
    }
    return NextResponse.json(
      { error: "Your language profile does not include this slot's language. Update your profile first." },
      { status: 403 },
    );
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
    return NextResponse.json({ error: "Already signed up for this hour" }, { status: 409 });
  }

  const signup = await prisma.subBlockSignup.create({
    data: { slotId, volunteerId: profile.id, subBlockHour: hour },
  });

  // Check notif prefs
  const notifPrefs = await prisma.volunteerNotifPrefs.findUnique({
    where: { volunteerId: profile.id },
  }).catch(() => null);

  if ((notifPrefs?.signupReceipt ?? true) && user.email) {
    await notifyVolunteerSignup({
      signupId: signup.id,
      volunteerEmail: user.email,
      clinicName: slot.clinic.name,
      clinicAddress: slot.clinic.address,
      language: slot.language,
      date: slot.date,
      subBlockHour: hour,
      notes: slot.notes,
    }).catch(console.error);
  }

  await logActivity({
    actorId: user.id,
    actorEmail: user.email ?? undefined,
    actorName: user.name ?? undefined,
    action: "SIGNUP_CREATED",
    targetType: "Signup",
    targetId: signup.id,
    detail: `Signed up for ${slot.language} slot at ${slot.clinic.name} hour ${hour}`,
  });

  return NextResponse.json(signup, { status: 201 });
}
