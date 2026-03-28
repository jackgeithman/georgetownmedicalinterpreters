/**
 * Cron: once per day at 8 AM ET (13:00 UTC) — Vercel Hobby compatible.
 * Handles:
 *  1. 24-hour shift reminders for volunteers
 *  2. Clinic daily summary emails
 *  3. Clinic unfilled-slot alerts (slots within 24h still have open sub-blocks)
 *  4. Admin pending-volunteer alerts (waiting 24h+ for approval)
 *
 * Transactional emails (signup receipt, cancel receipt, slot edited/cancelled,
 * admin-removed, volunteer cancel alert, unfilled slot alert) are sent immediately
 * from their respective API routes — no queue needed.
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
  // Find all active signups whose sub-block starts between now+22h and now+26h
  // (wide window to account for Vercel's ±59 min scheduling variance on Hobby)
  const reminderLow = new Date(now.getTime() + 22 * 3_600_000);
  const reminderHigh = new Date(now.getTime() + 26 * 3_600_000);

  const dayStart = new Date(reminderLow);
  dayStart.setHours(0, 0, 0, 0);
  const dayEnd = new Date(reminderHigh);
  dayEnd.setHours(23, 59, 59, 999);

  const upcomingSignups = await prisma.subBlockSignup.findMany({
    where: {
      status: "ACTIVE",
      slot: { status: "ACTIVE", date: { gte: dayStart, lte: dayEnd } },
    },
    include: {
      slot: { include: { clinic: true } },
      volunteer: { include: { user: true, notifPrefs: true } },
    },
  });

  for (const signup of upcomingSignups) {
    const slotStart = new Date(signup.slot.date);
    slotStart.setHours(signup.subBlockHour, 0, 0, 0);
    if (slotStart < reminderLow || slotStart > reminderHigh) continue;

    if (!signup.volunteer.notifPrefs?.reminder24h) continue;
    const email = signup.volunteer.user.email;
    if (!email) continue;

    // Deduplicate: don't send twice if cron ever fires twice in a day
    const already = await prisma.notifLog.findFirst({
      where: {
        type: "REMINDER_24H",
        recipientEmail: email,
        signupId: signup.id,
        sentAt: { gte: new Date(now.getTime() - 20 * 3_600_000) },
      },
    });
    if (already) continue;

    try {
      await sendReminder({
        to: email,
        volunteerName: signup.volunteer.user.name ?? "Volunteer",
        clinicName: signup.slot.clinic.name,
        clinicAddress: signup.slot.clinic.address,
        date: signup.slot.date,
        subBlockHour: signup.subBlockHour,
        language: langLabel(signup.slot.language),
        hoursUntil: 24,
      });
      await prisma.notifLog.create({
        data: { type: "REMINDER_24H", recipientEmail: email, signupId: signup.id },
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
      slots: {
        where: { status: "ACTIVE", date: { gte: now } },
        include: { signups: { where: { status: "ACTIVE" } } },
        orderBy: { date: "asc" },
        take: 20, // cap at 20 upcoming slots in the email
      },
    },
  });

  for (const clinic of clinicsForSummary) {
    if (!clinic.contactEmail) continue;

    const slotSummaries = clinic.slots.map((s) => ({
      date: s.date,
      startTime: s.startTime,
      endTime: s.endTime,
      language: langLabel(s.language),
      interpreterCount: s.interpreterCount,
      signedUp: new Set(s.signups.map((su) => su.subBlockHour)).size,
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

  // ── 3. Clinic unfilled-slot alerts (slots within 24h) ─────────────────────
  const in24h = new Date(now.getTime() + 24 * 3_600_000);

  const clinicsForUnfilled = await prisma.clinic.findMany({
    where: { notifPrefs: { unfilledAlert24h: true } },
    include: {
      slots: {
        where: { status: "ACTIVE", date: { gte: now, lte: in24h } },
        include: { signups: { where: { status: "ACTIVE" } } },
      },
    },
  });

  for (const clinic of clinicsForUnfilled) {
    for (const slot of clinic.slots) {
      const unfilledHours: { hour: number; filled: number; needed: number }[] = [];
      for (let h = slot.startTime; h < slot.endTime; h++) {
        const filled = slot.signups.filter((s) => s.subBlockHour === h).length;
        if (filled < slot.interpreterCount) {
          unfilledHours.push({ hour: h, filled, needed: slot.interpreterCount });
        }
      }
      if (unfilledHours.length === 0) continue;

      // Deduplicate: max once per slot per day
      const alreadySent = await prisma.notifLog.findFirst({
        where: {
          type: "CLINIC_UNFILLED_24H",
          slotId: slot.id,
          sentAt: { gte: new Date(now.getTime() - 20 * 3_600_000) },
        },
      });
      if (alreadySent) continue;

      try {
        await sendClinicUnfilledAlert({
          to: clinic.contactEmail,
          clinicName: clinic.name,
          date: slot.date,
          startTime: slot.startTime,
          endTime: slot.endTime,
          unfilledHours,
        });
        await prisma.notifLog.create({
          data: {
            type: "CLINIC_UNFILLED_24H",
            recipientEmail: clinic.contactEmail,
            slotId: slot.id,
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
