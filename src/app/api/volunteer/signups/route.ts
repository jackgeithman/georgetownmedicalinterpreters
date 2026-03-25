import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { sendSignupReceipt } from "@/lib/email";

function langLabel(code: string) {
  const map: Record<string, string> = { ES: "Spanish", ZH: "Mandarin", KO: "Korean", AR: "Arabic" };
  return map[code] ?? code;
}

async function getActiveVolunteer() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return null;
  const user = await prisma.user.findUnique({
    where: { email: session.user.email },
    include: { volunteer: true },
  });
  if (!user) return null;
  const isVolunteerRole = user.role === "VOLUNTEER" || user.role === "ADMIN" || user.role === "SUPER_ADMIN";
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

  // Auto-create volunteer profile if needed
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

  const slot = await prisma.slot.findUnique({ where: { id: slotId } });
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

  // Load notif prefs separately — keeps getActiveVolunteer simple and robust
  const notifPrefs = await prisma.volunteerNotifPrefs.findUnique({ where: { volunteerId: profile.id } }).catch(() => null);

  // Send signup receipt — must be awaited before returning (serverless functions
  // are killed immediately after response, so fire-and-forget never completes)
  if ((notifPrefs?.signupReceipt ?? true) && user.email) {
    const clinic = await prisma.clinic.findUnique({ where: { id: slot.clinicId } });
    if (clinic) {
      await sendSignupReceipt({
        to: user.email,
        volunteerName: user.name ?? "Volunteer",
        clinicName: clinic.name,
        date: slot.date,
        subBlockHour: hour,
        language: langLabel(slot.language),
      }).catch(() => {/* non-fatal — email failure never blocks signup */});
    }
  }

  return NextResponse.json(signup, { status: 201 });
}
