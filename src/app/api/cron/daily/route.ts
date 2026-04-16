/**
 * Cron: once per day at 8 AM ET (13:00 UTC) — Vercel Hobby compatible.
 * Handles:
 *  1. 24-hour shift reminders for volunteers
 *  2. Clinic daily summary emails
 *  3. Clinic unfilled-shift alerts (shifts within 24h still have open positions)
 *  4. Admin pending-volunteer alerts (waiting 24h+ for approval)
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  sendReminder,
  sendClinicDailySummary,
  sendClinicUnfilledAlert,
  sendAdminPendingVolunteerAlert,
} from "@/lib/email";

function langLabel(code: string) {
  const map: Record<string, string> = { ES: "Spanish", ZH: "Mandarin", KO: "Korean", AR: "Arabic" };
  return map[code] ?? code;
}

function minutesToHour(minutes: number) {
  return Math.floor(minutes / 60);
}

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const now = new Date();
  let sent = 0;

  // ── 1. 24-hour reminders ───────────────────────────────────────────────────
  // Find all FILLED positions whose shift starts between now+22h and now+26h
  const reminderLow = new Date(now.getTime() + 22 * 3_600_000);
  const reminderHigh = new Date(now.getTime() + 26 * 3_600_000);

  const dayStart = new Date(reminderLow);
  dayStart.setHours(0, 0, 0, 0);
  const dayEnd = new Date(reminderHigh);
  dayEnd.setHours(23, 59, 59, 999);

  const upcomingPositions = await prisma.shiftPosition.findMany({
    where: {
      status: "FILLED",
      shift: { status: "ACTIVE", date: { gte: dayStart, lte: dayEnd } },
    },
    include: {
      shift: { include: { clinic: true } },
      volunteer: { include: { user: true, notifPrefs: true } },
    },
  });

  for (const position of upcomingPositions) {
    // Compute exact shift start datetime and check window
    const shiftDate = new Date(position.shift.date);
    shiftDate.setHours(0, 0, 0, 0);
    const shiftStart = new Date(shiftDate.getTime() + position.shift.volunteerStart * 60_000);
    if (shiftStart < reminderLow || shiftStart > reminderHigh) continue;

    if (!position.volunteer?.notifPrefs?.reminder24h) continue;
    const email = position.volunteer.user.email;
    if (!email) continue;

    // Deduplicate: don't send twice if cron fires twice in a day
    const already = await prisma.notifLog.findFirst({
      where: {
        type: "REMINDER_24H",
        recipientEmail: email,
        positionId: position.id,
        sentAt: { gte: new Date(now.getTime() - 20 * 3_600_000) },
      },
    });
    if (already) continue;

    try {
      await sendReminder({
        to: email,
        volunteerName: position.volunteer.user.name ?? "Volunteer",
        clinicName: position.shift.clinic.name,
        clinicAddress: position.shift.clinic.address,
        date: position.shift.date,
        subBlockHour: minutesToHour(position.shift.volunteerStart),
        language: langLabel(position.languageCode ?? ""),
        hoursUntil: 24,
      });
      await prisma.notifLog.create({
        data: { type: "REMINDER_24H", recipientEmail: email, positionId: position.id },
      });
      sent++;
    } catch (err) {
      console.error("24h reminder failed", email, err);
    }
  }

  // ── 2. Clinic daily summaries ──────────────────────────────────────────────
  const clinicsForSummary = await prisma.clinic.findMany({
    where: { notifPrefs: { dailySummary: true } },
    include: {
      shifts: {
        where: { status: "ACTIVE", date: { gte: now } },
        include: { positions: true },
        orderBy: { date: "asc" },
        take: 20,
      },
    },
  });

  for (const clinic of clinicsForSummary) {
    if (!clinic.contactEmail) continue;

    const slotSummaries = clinic.shifts.map((s) => ({
      date: s.date,
      startTime: minutesToHour(s.volunteerStart),
      endTime: minutesToHour(s.volunteerEnd),
      language: s.languagesNeeded.map(langLabel).join(", "),
      interpreterCount: s.positions.length,
      signedUp: s.positions.filter((p) => p.status === "FILLED").length,
      notes: s.notes,
    }));

    try {
      await sendClinicDailySummary({
        to: clinic.contactEmail,
        clinicName: clinic.name,
        slots: slotSummaries,
      });
      sent++;
    } catch (err) {
      console.error("Clinic daily summary failed", clinic.contactEmail, err);
    }
  }

  // ── 3. Clinic unfilled-shift alerts (shifts within 24h) ───────────────────
  const in24h = new Date(now.getTime() + 24 * 3_600_000);

  const clinicsForUnfilled = await prisma.clinic.findMany({
    where: { notifPrefs: { unfilledAlert24h: true } },
    include: {
      shifts: {
        where: { status: "ACTIVE", date: { gte: now, lte: in24h } },
        include: { positions: true },
      },
    },
  });

  for (const clinic of clinicsForUnfilled) {
    for (const shift of clinic.shifts) {
      const openPositions = shift.positions.filter(
        (p) => p.status === "OPEN" || p.status === "LOCKED",
      );
      if (openPositions.length === 0) continue;

      const alreadySent = await prisma.notifLog.findFirst({
        where: {
          type: "CLINIC_UNFILLED_24H",
          shiftId: shift.id,
          sentAt: { gte: new Date(now.getTime() - 20 * 3_600_000) },
        },
      });
      if (alreadySent) continue;

      const filledCount = shift.positions.filter((p) => p.status === "FILLED").length;
      const totalCount = shift.positions.length;
      const startHour = minutesToHour(shift.volunteerStart);

      try {
        await sendClinicUnfilledAlert({
          to: clinic.contactEmail,
          clinicName: clinic.name,
          date: shift.date,
          startTime: startHour,
          endTime: minutesToHour(shift.volunteerEnd),
          unfilledHours: [{ hour: startHour, filled: filledCount, needed: totalCount }],
        });
        await prisma.notifLog.create({
          data: {
            type: "CLINIC_UNFILLED_24H",
            recipientEmail: clinic.contactEmail,
            shiftId: shift.id,
          },
        });
        sent++;
      } catch (err) {
        console.error("Clinic unfilled alert failed", clinic.contactEmail, err);
      }
    }
  }

  // ── 4. Admin pending-volunteer alerts ──────────────────────────────────────
  const cutoff = new Date(now.getTime() - 24 * 3_600_000);
  const pendingVolunteers = await prisma.user.findMany({
    where: { status: "PENDING_APPROVAL", createdAt: { lte: cutoff } },
    orderBy: { createdAt: "asc" },
  });

  if (pendingVolunteers.length > 0) {
    const admins = await prisma.user.findMany({
      where: { role: "ADMIN", status: "ACTIVE" },
    });
    const volList = pendingVolunteers.map((v) => ({
      name: v.name ?? v.email,
      email: v.email,
      waitingHours: (now.getTime() - v.createdAt.getTime()) / 3_600_000,
    }));

    for (const admin of admins) {
      if (!admin.email) continue;
      const alreadySent = await prisma.notifLog.findFirst({
        where: {
          type: "ADMIN_PENDING_VOLUNTEER",
          recipientEmail: admin.email,
          sentAt: { gte: new Date(now.getTime() - 20 * 3_600_000) },
        },
      });
      if (alreadySent) continue;

      try {
        await sendAdminPendingVolunteerAlert({
          to: admin.email,
          pendingCount: pendingVolunteers.length,
          volunteers: volList,
        });
        await prisma.notifLog.create({
          data: { type: "ADMIN_PENDING_VOLUNTEER", recipientEmail: admin.email },
        });
        sent++;
      } catch (err) {
        console.error("Admin pending alert failed", admin.email, err);
      }
    }
  }

  return NextResponse.json({ sent, ts: now.toISOString() });
}
