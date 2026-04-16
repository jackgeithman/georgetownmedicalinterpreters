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

const BUCKETS = [
  { label: "Tomorrow",   minDays: 1,  maxDays: 1  },
  { label: "2 Days",     minDays: 2,  maxDays: 2  },
  { label: "3 Days",     minDays: 3,  maxDays: 3  },
  { label: "This Week",  minDays: 4,  maxDays: 7  },
  { label: "2 Weeks",    minDays: 8,  maxDays: 14 },
  { label: "This Month", minDays: 15, maxDays: 30 },
  { label: "Beyond",     minDays: 31, maxDays: Infinity },
];

export async function GET() {
  const user = await getAuthorizedUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

  const now = new Date();
  const todayMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const oneMonthAgo = new Date(now.getTime() - 30 * 24 * 3_600_000);

  const [languages, allShifts, upcomingShifts, volunteerCount, activeVolunteerCount, feedbackRecords] = await Promise.all([
    prisma.languageConfig.findMany({ orderBy: { name: "asc" } }),
    prisma.shift.findMany({
      where: { status: { not: "CANCELLED" } },
      select: {
        clinicId: true,
        clinic: { select: { name: true } },
        volunteerStart: true,
        volunteerEnd: true,
        positions: { select: { status: true, languageCode: true } },
      },
    }),
    prisma.shift.findMany({
      where: { status: "ACTIVE", date: { gte: now } },
      select: {
        date: true,
        languagesNeeded: true,
        positions: { select: { status: true, isDriver: true, languageCode: true } },
      },
    }),
    prisma.user.count({ where: { role: "VOLUNTEER", status: "ACTIVE" } }),
    prisma.volunteerProfile.count({
      where: { positions: { some: { createdAt: { gte: oneMonthAgo } } } },
    }),
    prisma.feedback.findMany({ select: { authorRole: true, rating: true } }),
  ]);

  // Interpreting hours (all non-cancelled shifts × filled positions)
  let totalInterpretingHours = 0;
  const clinicHoursMap = new Map<string, { clinicName: string; hours: number }>();
  const langHoursMap: Record<string, number> = {};

  for (const shift of allShifts) {
    const interpHrs = (shift.volunteerEnd - shift.volunteerStart) / 60;
    const filled = shift.positions.filter((p) => p.status === "FILLED");
    const shiftHours = interpHrs * filled.length;
    totalInterpretingHours += shiftHours;

    const existing = clinicHoursMap.get(shift.clinicId);
    if (existing) existing.hours += shiftHours;
    else clinicHoursMap.set(shift.clinicId, { clinicName: shift.clinic.name, hours: shiftHours });

    for (const pos of filled) {
      if (pos.languageCode) langHoursMap[pos.languageCode] = (langHoursMap[pos.languageCode] ?? 0) + interpHrs;
    }
  }

  const hoursByClinic = Array.from(clinicHoursMap.entries())
    .map(([clinicId, d]) => ({ clinicId, clinicName: d.clinicName, hours: Math.round(d.hours * 10) / 10 }))
    .sort((a, b) => b.hours - a.hours);

  const hoursByLanguage = languages
    .map((l) => ({ code: l.code, name: l.name, hours: Math.round((langHoursMap[l.code] ?? 0) * 10) / 10 }))
    .filter((l) => l.hours > 0);

  // Time-bucketed slot breakdown
  type BucketData = {
    label: string;
    shifts: number;
    driverFilled: number; driverTotal: number;
    interpFilled: number; interpTotal: number;
    byLanguage: Record<string, { filled: number; total: number }>;
  };

  const bucketMap: BucketData[] = BUCKETS.map((b) => ({
    label: b.label, shifts: 0,
    driverFilled: 0, driverTotal: 0,
    interpFilled: 0, interpTotal: 0,
    byLanguage: {},
  }));

  for (const shift of upcomingShifts) {
    const shiftDate = new Date(shift.date);
    const shiftMidnight = new Date(shiftDate.getFullYear(), shiftDate.getMonth(), shiftDate.getDate());
    const daysOut = Math.round((shiftMidnight.getTime() - todayMidnight.getTime()) / 86_400_000);

    const bucketIdx = BUCKETS.findIndex((b) => daysOut >= b.minDays && daysOut <= b.maxDays);
    if (bucketIdx === -1) continue;
    const bucket = bucketMap[bucketIdx];
    bucket.shifts++;

    for (const pos of shift.positions) {
      const filled = pos.status === "FILLED";
      const unfilled = pos.status === "OPEN" || pos.status === "LOCKED";
      if (pos.isDriver) {
        if (filled) bucket.driverFilled++;
        if (filled || unfilled) bucket.driverTotal++;
      } else {
        if (filled) bucket.interpFilled++;
        if (filled || unfilled) bucket.interpTotal++;
      }
    }

    for (const lang of shift.languagesNeeded) {
      bucket.byLanguage[lang] = bucket.byLanguage[lang] ?? { filled: 0, total: 0 };
      bucket.byLanguage[lang].total++;
    }
    for (const pos of shift.positions) {
      if (pos.languageCode && pos.status === "FILLED") {
        bucket.byLanguage[pos.languageCode] = bucket.byLanguage[pos.languageCode] ?? { filled: 0, total: 0 };
        bucket.byLanguage[pos.languageCode].filled++;
      }
    }
  }

  const slotBuckets = bucketMap
    .filter((b) => b.shifts > 0)
    .map((b) => ({
      label: b.label,
      shifts: b.shifts,
      driverFilled: b.driverFilled, driverTotal: b.driverTotal,
      interpFilled: b.interpFilled, interpTotal: b.interpTotal,
      byLanguage: languages
        .filter((l) => b.byLanguage[l.code])
        .map((l) => ({ code: l.code, name: l.name, filled: b.byLanguage[l.code].filled, total: b.byLanguage[l.code].total })),
    }));

  // Feedback
  const feedbackCount = feedbackRecords.length;
  const clinicRatings = feedbackRecords.filter((f) => f.authorRole === "CLINIC" && f.rating != null).map((f) => f.rating as number);
  const volunteerRatings = feedbackRecords.filter((f) => f.authorRole === "VOLUNTEER" && f.rating != null).map((f) => f.rating as number);
  const avgVolunteerRating = clinicRatings.length > 0
    ? Math.round((clinicRatings.reduce((a, b) => a + b, 0) / clinicRatings.length) * 10) / 10 : null;
  const avgClinicRating = volunteerRatings.length > 0
    ? Math.round((volunteerRatings.reduce((a, b) => a + b, 0) / volunteerRatings.length) * 10) / 10 : null;

  return NextResponse.json({
    totalInterpretingHours: Math.round(totalInterpretingHours * 10) / 10,
    hoursByLanguage,
    hoursByClinic,
    volunteerCount,
    activeVolunteerCount,
    slotBuckets,
    feedbackCount,
    avgVolunteerRating,
    avgClinicRating,
  });
}
