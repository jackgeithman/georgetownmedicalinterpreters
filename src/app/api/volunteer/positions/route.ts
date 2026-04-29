import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { notifyVolunteerAddedToShift } from "@/lib/notifications";
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

// GET /api/volunteer/positions — my current signups
export async function GET() {
  const user = await getActiveVolunteer();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  if (!user.volunteer) return NextResponse.json([]);

  const positions = await prisma.shiftPosition.findMany({
    where: {
      volunteerId: user.volunteer.id,
      status: { in: ["FILLED", "COMPLETED", "NO_SHOW"] },
    },
    include: {
      shift: {
        include: { clinic: { select: { id: true, name: true, address: true } } },
      },
    },
    orderBy: { shift: { date: "asc" } },
  });

  // Attach derived times to each shift
  return NextResponse.json(
    positions.map((pos) => ({
      ...pos,
      shift: {
        ...pos.shift,
        keyRetrievalTime: pos.shift.volunteerStart - pos.shift.travelMinutes - 30,
        driveStartTime: pos.shift.volunteerStart - pos.shift.travelMinutes,
        keyReturnTime: pos.shift.volunteerEnd + pos.shift.travelMinutes + 15,
      },
    })),
  );
}

// POST /api/volunteer/positions — sign up for a position
export async function POST(req: NextRequest) {
  const user = await getActiveVolunteer();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

  let profile = user.volunteer;
  if (!profile) {
    profile = await prisma.volunteerProfile.create({ data: { userId: user.id, languages: [] } });
  }

  const body = await req.json();
  const { positionId, languageCode } = body;
  // languageCode only required when signing up as driver (to choose which language to interpret)

  if (!positionId) return NextResponse.json({ error: "positionId required" }, { status: 400 });

  const position = await prisma.shiftPosition.findUnique({
    where: { id: positionId },
    include: {
      shift: { include: { clinic: true, positions: { orderBy: { positionNumber: "asc" } } } },
    },
  });

  if (!position) return NextResponse.json({ error: "Position not found" }, { status: 404 });
  if (position.status !== "OPEN") {
    return NextResponse.json({ error: "Position is not available" }, { status: 409 });
  }
  if (position.shift.status !== "ACTIVE") {
    return NextResponse.json({ error: "Shift is not active" }, { status: 409 });
  }

  // Check volunteer isn't already in this shift
  const alreadyIn = position.shift.positions.some((p) => p.volunteerId === profile!.id && p.status === "FILLED");
  if (alreadyIn) return NextResponse.json({ error: "You are already signed up for this shift" }, { status: 409 });

  let assignedLanguage: string;

  if (position.isDriver) {
    // Driver seat: need driver clearance + language clearance
    if (!profile.driverCleared) {
      return NextResponse.json({ error: "You do not have driver clearance" }, { status: 403 });
    }

    // Determine which language the driver will interpret
    const eligibleLanguages = position.shift.languagesNeeded.filter((lang) =>
      user.roles.includes(`LANG_${lang}_CLEARED`),
    );
    if (eligibleLanguages.length === 0) {
      return NextResponse.json({
        error: "You do not have language clearance for any language needed on this shift",
      }, { status: 403 });
    }

    if (eligibleLanguages.length === 1) {
      assignedLanguage = eligibleLanguages[0];
    } else {
      // Driver has multiple eligible languages — they must specify
      if (!languageCode || !eligibleLanguages.includes(languageCode)) {
        return NextResponse.json({
          error: "multiple_languages",
          eligibleLanguages,
          message: "You are cleared for multiple languages on this shift. Please choose one.",
        }, { status: 400 });
      }
      assignedLanguage = languageCode;
    }
  } else {
    // Interpreter seat: language already assigned, just verify clearance
    if (!position.languageCode) {
      return NextResponse.json({ error: "Position language not yet assigned — driver must sign up first" }, { status: 409 });
    }
    if (!user.roles.includes(`LANG_${position.languageCode}_CLEARED`)) {
      return NextResponse.json({
        error: `You do not have clearance for ${position.languageCode}`,
      }, { status: 403 });
    }
    assignedLanguage = position.languageCode;
  }

  // Transactionally fill the position and unlock remaining seats if this is the driver
  await prisma.$transaction(async (tx) => {
    // Fill the position
    await tx.shiftPosition.update({
      where: { id: positionId },
      data: {
        volunteerId: profile!.id,
        languageCode: assignedLanguage,
        status: "FILLED",
        signedUpAt: new Date(),
      },
    });

    if (position.isDriver) {
      // Assign remaining languages to positions 2+ and unlock them
      const remaining = position.shift.languagesNeeded.filter((l) => l !== assignedLanguage);
      // Re-add the driver's language at end if there are duplicates (e.g. 2 Spanish needed)
      const otherNeeded = [...position.shift.languagesNeeded];
      const driverLangIdx = otherNeeded.findIndex((l) => l === assignedLanguage);
      otherNeeded.splice(driverLangIdx !== -1 ? driverLangIdx : 0, 1);

      const otherPositions = position.shift.positions
        .filter((p) => !p.isDriver)
        .sort((a, b) => a.positionNumber - b.positionNumber);

      for (let i = 0; i < otherPositions.length; i++) {
        await tx.shiftPosition.update({
          where: { id: otherPositions[i].id },
          data: {
            languageCode: otherNeeded[i] ?? null,
            status: "OPEN",
          },
        });
      }
    }
  });

  // Send notification
  const notifPrefs = await prisma.volunteerNotifPrefs.findUnique({
    where: { volunteerId: profile.id },
  }).catch(() => null);

  if ((notifPrefs?.signupReceipt ?? true) && user.email) {
    const { shift } = position;
    await notifyVolunteerAddedToShift({
      shiftId: position.shiftId,
      volunteerEmail: user.email,
      volunteerName: user.name ?? user.email,
      byAdmin: false,
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
    actorId: user.id,
    actorEmail: user.email ?? undefined,
    actorName: user.name ?? undefined,
    action: "POSITION_FILLED",
    targetType: "ShiftPosition",
    targetId: positionId,
    detail: `Signed up for ${position.isDriver ? "driver + " : ""}${assignedLanguage} position at ${position.shift.clinic.name}`,
  });

  return NextResponse.json({ success: true }, { status: 201 });
}
