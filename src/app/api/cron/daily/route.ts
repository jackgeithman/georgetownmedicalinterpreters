/**
 * Cron: daily at 8 AM ET
 * Sends:
 *  - Clinic daily summaries (to clinics with dailySummary=true)
 *  - Clinic unfilled-slot alerts (within 24h)
 *  - Admin pending-volunteer alert (volunteers waiting 24h+)
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
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

  // ── Clinic daily summaries ─────────────────────────────────────────────────
  const clinicsWithPrefs = await prisma.clinic.findMany({
    where: { notifPrefs: { dailySummary: true } },
    include: {
      notifPrefs: true,
      slots: {
        where: { status: "ACTIVE", date: { gte: now } },
        include: { signups: { where: { status: "ACTIVE" } } },
        orderBy: { date: "asc" },
      },
    },
  });

  for (const clinic of clinicsWithPrefs) {
    if (clinic.slots.length === 0) continue;
    if (!clinic.contactEmail) continue;

    const slotSummaries = clinic.slots.map((s) => {
      const hours = s.endTime - s.startTime;
      const totalNeeded = hours * s.interpreterCount;
      // count unique signed-up hours
      const signedUpHours = new Set(s.signups.map((su) => su.subBlockHour)).size;
      return {
        date: s.date,
        startTime: s.startTime,
        endTime: s.endTime,
        language: langLabel(s.language),
        interpreterCount: s.interpreterCount,
        signedUp: signedUpHours,
        notes: s.notes,
        totalNeeded,
      };
    });

    try {
      await sendClinicDailySummary({
        to: clinic.contactEmail,
        clinicName: clinic.name,
        slots: slotSummaries,
      });
      sent++;
    } catch (err) {
      console.error("Daily summary failed", clinic.contactEmail, err);
    }
  }

  // ── Clinic unfilled-slot alerts (within 24h) ───────────────────────────────
  const in24h = new Date(now.getTime() + 24 * 3_600_000);

  const clinicsWithUnfilledPref = await prisma.clinic.findMany({
    where: { notifPrefs: { unfilledAlert24h: true } },
    include: {
      slots: {
        where: { status: "ACTIVE", date: { gte: now, lte: in24h } },
        include: { signups: { where: { status: "ACTIVE" } } },
      },
    },
  });

  for (const clinic of clinicsWithUnfilledPref) {
    for (const slot of clinic.slots) {
      const unfilledHours: { hour: number; filled: number; needed: number }[] = [];
      for (let h = slot.startTime; h < slot.endTime; h++) {
        const filled = slot.signups.filter((s) => s.subBlockHour === h).length;
        if (filled < slot.interpreterCount) {
          unfilledHours.push({ hour: h, filled, needed: slot.interpreterCount });
        }
      }
      if (unfilledHours.length === 0) continue;

      // Deduplicate: only send once per slot per day
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
          data: { type: "CLINIC_UNFILLED_24H", recipientEmail: clinic.contactEmail, slotId: slot.id },
        });
        sent++;
      } catch (err) {
        console.error("Unfilled alert failed", clinic.contactEmail, err);
      }
    }
  }

  // ── Admin pending-volunteer alert ──────────────────────────────────────────
  const cutoff = new Date(now.getTime() - 24 * 3_600_000);
  const pendingVolunteers = await prisma.user.findMany({
    where: { status: "PENDING_APPROVAL", createdAt: { lte: cutoff } },
    orderBy: { createdAt: "asc" },
  });

  if (pendingVolunteers.length > 0) {
    const admins = await prisma.user.findMany({
      where: { role: { in: ["ADMIN", "SUPER_ADMIN"] }, status: "ACTIVE" },
    });

    const volList = pendingVolunteers.map((v) => ({
      name: v.name ?? v.email,
      email: v.email,
      waitingHours: (now.getTime() - v.createdAt.getTime()) / 3_600_000,
    }));

    for (const admin of admins) {
      if (!admin.email) continue;
      // Deduplicate: max once per 20h per admin
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

  return NextResponse.json({ sent });
}
