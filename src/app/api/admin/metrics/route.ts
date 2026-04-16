import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

async function getAuthorizedUser() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return null;
  const user = await prisma.user.findUnique({ where: { email: session.user.email } });
  if (!user) return null;
  if (user.role !== "ADMIN" && user.role !== "INSTRUCTOR") return null;
  return user;
}

export async function GET() {
  const user = await getAuthorizedUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

  const now = new Date();
  const oneMonthAgo = new Date(now.getTime() - 30 * 24 * 3_600_000);

  const [languages, volunteerProfiles, shifts, volunteerCount, activeVolunteerCount, upcomingShifts, feedbackRecords] = await Promise.all([
    prisma.languageConfig.findMany({ orderBy: { name: "asc" } }),
    prisma.volunteerProfile.findMany({
      select: { languages: true, hoursVolunteered: true, drivingHours: true },
    }),
    prisma.shift.findMany({
      where: { status: { not: "CANCELLED" } },
      select: {
        clinicId: true,
        clinic: { select: { name: true } },
        volunteerStart: true,
        volunteerEnd: true,
        status: true,
      },
    }),
    prisma.user.count({ where: { role: "VOLUNTEER", status: "ACTIVE" } }),
    // Active volunteers = filled at least one position in the last month
    prisma.volunteerProfile.count({
      where: {
        positions: {
          some: { createdAt: { gte: oneMonthAgo } },
        },
      },
    }),
    // Upcoming shifts (ACTIVE, future) with position fill status
    prisma.shift.findMany({
      where: { status: "ACTIVE", date: { gte: now } },
      select: {
        id: true,
        positions: { select: { status: true } },
      },
    }),
    prisma.feedback.findMany({ select: { authorRole: true, rating: true } }),
  ]);

  // Total hours
  const totalHours = volunteerProfiles.reduce((sum, vp) => sum + vp.hoursVolunteered, 0);

  // Hours by language
  const hoursByLanguage = languages.map((lang) => {
    const hours = volunteerProfiles
      .filter((vp) => vp.languages.includes(lang.code))
      .reduce((sum, vp) => sum + vp.hoursVolunteered, 0);
    return { code: lang.code, name: lang.name, hours };
  });

  // Hours by clinic — sum (volunteerEnd - volunteerStart) / 60 per shift (in hours)
  const clinicHoursMap = new Map<string, { clinicName: string; hours: number }>();
  for (const shift of shifts) {
    const hours = (shift.volunteerEnd - shift.volunteerStart) / 60;
    const existing = clinicHoursMap.get(shift.clinicId);
    if (existing) {
      existing.hours += hours;
    } else {
      clinicHoursMap.set(shift.clinicId, { clinicName: shift.clinic.name, hours });
    }
  }
  const hoursByClinic = Array.from(clinicHoursMap.entries()).map(([clinicId, data]) => ({
    clinicId,
    clinicName: data.clinicName,
    hours: Math.round(data.hours * 10) / 10,
  }));

  // Upcoming filled/unfilled positions
  let filledPositions = 0;
  let unfilledPositions = 0;
  for (const shift of upcomingShifts) {
    for (const pos of shift.positions) {
      if (pos.status === "FILLED") filledPositions++;
      else if (pos.status === "OPEN" || pos.status === "LOCKED") unfilledPositions++;
    }
  }

  // Feedback stats
  const feedbackCount = feedbackRecords.length;
  const clinicAuthoredRatings = feedbackRecords
    .filter((f) => f.authorRole === "CLINIC" && f.rating != null)
    .map((f) => f.rating as number);
  const volunteerAuthoredRatings = feedbackRecords
    .filter((f) => f.authorRole === "VOLUNTEER" && f.rating != null)
    .map((f) => f.rating as number);
  const avgVolunteerRating =
    clinicAuthoredRatings.length > 0
      ? Math.round((clinicAuthoredRatings.reduce((a, b) => a + b, 0) / clinicAuthoredRatings.length) * 10) / 10
      : null;
  const avgClinicRating =
    volunteerAuthoredRatings.length > 0
      ? Math.round((volunteerAuthoredRatings.reduce((a, b) => a + b, 0) / volunteerAuthoredRatings.length) * 10) / 10
      : null;

  return NextResponse.json({
    totalHours,
    hoursByLanguage,
    hoursByClinic,
    volunteerCount,
    activeVolunteerCount,
    filledPositions,
    unfilledPositions,
    feedbackCount,
    avgVolunteerRating,
    avgClinicRating,
  });
}
