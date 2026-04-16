import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

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

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Fetch upcoming active shifts
  const shifts = await prisma.shift.findMany({
    where: { status: "ACTIVE", date: { gte: today } },
    orderBy: { date: "asc" },
    include: {
      clinic: { select: { id: true, name: true, address: true } },
      positions: {
        orderBy: { positionNumber: "asc" },
        include: {
          volunteer: {
            include: { user: { select: { name: true, email: true } } },
          },
        },
      },
    },
  });

  // Attach volunteer's own signup info and eligibility per position
  const volunteerProfile = user.volunteer;
  const userRoles = user.roles;

  const enriched = shifts.map((shift) => {
    const positions = shift.positions.map((pos) => {
      const myPosition = volunteerProfile && pos.volunteerId === volunteerProfile.id;
      let canSignUp = false;

      if (pos.status === "OPEN" && volunteerProfile) {
        if (pos.isDriver) {
          // Driver seat: need driver clearance + at least one needed language clearance
          const hasDriverClearance = volunteerProfile.driverCleared;
          const hasAnyLanguage = shift.languagesNeeded.some((lang) =>
            userRoles.includes(`LANG_${lang}_CLEARED`),
          );
          canSignUp = hasDriverClearance && hasAnyLanguage;
        } else {
          // Interpreter seat: need clearance for this position's assigned language
          canSignUp = pos.languageCode != null && userRoles.includes(`LANG_${pos.languageCode}_CLEARED`);
        }
      }

      return { ...pos, isMyPosition: myPosition, canSignUp };
    });

    // Derived times
    const keyRetrievalTime = shift.volunteerStart - shift.travelMinutes - 30;
    const driveStartTime = shift.volunteerStart - shift.travelMinutes;
    const keyReturnTime = shift.volunteerEnd + shift.travelMinutes + 15;

    return {
      ...shift,
      positions,
      keyRetrievalTime,
      driveStartTime,
      keyReturnTime,
    };
  });

  return NextResponse.json(enriched);
}
