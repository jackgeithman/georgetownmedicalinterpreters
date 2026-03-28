import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

async function getAuthorizedUser() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return null;
  const user = await prisma.user.findUnique({ where: { email: session.user.email } });
  if (!user) return null;
  if (user.role !== "ADMIN" && user.role !== "SUPER_ADMIN" && user.role !== "INSTRUCTOR") return null;
  return user;
}

export async function GET() {
  const user = await getAuthorizedUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

  const now = new Date();
  const oneMonthAgo = new Date(now.getTime() - 30 * 24 * 3_600_000);

  const [languages, volunteerProfiles, slots, volunteerCount, activeVolunteerCount, upcomingSlots, feedbackRecords] = await Promise.all([
    prisma.languageConfig.findMany({ orderBy: { name: "asc" } }),
    prisma.volunteerProfile.findMany({
      select: { languages: true, hoursVolunteered: true },
    }),
    prisma.slot.findMany({
      where: { status: { not: "CANCELLED" } },
      select: {
        clinicId: true,
        clinic: { select: { name: true } },
        startTime: true,
        endTime: true,
        status: true,
      },
    }),
    prisma.user.count({ where: { role: "VOLUNTEER", status: "ACTIVE" } }),
    // Active volunteers = signed up for at least one slot in the last month
    prisma.volunteerProfile.count({
      where: {
        signups: {
          some: { createdAt: { gte: oneMonthAgo } },
        },
      },
    }),
    // Upcoming slots (ACTIVE, future date) with signup counts
    prisma.slot.findMany({
      where: { status: "ACTIVE", date: { gte: now } },
      select: {
        id: true,
        interpreterCount: true,
        startTime: true,
        endTime: true,
        signups: { where: { status: "ACTIVE" }, select: { subBlockHour: true } },
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

  // Hours by clinic — sum (endTime - startTime) per slot for non-cancelled slots
  const clinicHoursMap = new Map<string, { clinicName: string; hours: number }>();
  for (const slot of slots) {
    const hours = slot.endTime - slot.startTime;
    const existing = clinicHoursMap.get(slot.clinicId);
    if (existing) {
      existing.hours += hours;
    } else {
      clinicHoursMap.set(slot.clinicId, { clinicName: slot.clinic.name, hours });
    }
  }

  const hoursByClinic = Array.from(clinicHoursMap.entries()).map(([clinicId, data]) => ({
    clinicId,
    clinicName: data.clinicName,
    hours: data.hours,
  }));

  // Upcoming filled/unfilled slot-hours
  let filledSlotHours = 0;
  let unfilledSlotHours = 0;
  for (const slot of upcomingSlots) {
    for (let h = slot.startTime; h < slot.endTime; h++) {
      const filled = slot.signups.filter((s) => s.subBlockHour === h).length;
      if (filled >= slot.interpreterCount) {
        filledSlotHours++;
      } else {
        unfilledSlotHours++;
      }
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
    filledSlotHours,
    unfilledSlotHours,
    feedbackCount,
    avgVolunteerRating,
    avgClinicRating,
  });
}
