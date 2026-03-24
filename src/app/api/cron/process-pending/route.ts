/**
 * Cron: every 5 minutes
 * Processes:
 *  - SIGNUP_RECEIPT (delayed 2 min — so toggling doesn't flood)
 *  - CANCEL_RECEIPT (immediate)
 *  - UNFILLED_ALERT (delayed 5 min after cancellation — confirms slot still unfilled)
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  sendSignupReceipt,
  sendCancellationReceipt,
  sendUnfilledSlotAlert,
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

  const pending = await prisma.pendingNotif.findMany({
    where: { processed: false, scheduledFor: { lte: now } },
    take: 100,
    orderBy: { scheduledFor: "asc" },
  });

  let sent = 0;
  const ids: string[] = [];

  for (const notif of pending) {
    ids.push(notif.id);
    try {
      if (notif.type === "SIGNUP_RECEIPT" && notif.signupId) {
        await processSignupReceipt(notif.signupId);
        sent++;
      } else if (notif.type === "CANCEL_RECEIPT" && notif.signupId) {
        await processCancelReceipt(notif.signupId);
        sent++;
      } else if (notif.type === "UNFILLED_ALERT" && notif.slotId && notif.subBlockHour != null) {
        await processUnfilledAlert(notif.slotId, notif.subBlockHour, notif.volunteerId ?? null);
        sent++;
      }
    } catch (err) {
      console.error(`Failed to process notif ${notif.id}:`, err);
    }
  }

  if (ids.length > 0) {
    await prisma.pendingNotif.updateMany({ where: { id: { in: ids } }, data: { processed: true } });
  }

  return NextResponse.json({ processed: ids.length, sent });
}

async function processSignupReceipt(signupId: string) {
  const signup = await prisma.subBlockSignup.findUnique({
    where: { id: signupId },
    include: {
      slot: { include: { clinic: true } },
      volunteer: { include: { user: true, notifPrefs: true } },
    },
  });
  if (!signup || signup.status !== "ACTIVE") return;
  if (!signup.volunteer.notifPrefs?.signupReceipt) return;

  const email = signup.volunteer.user.email;
  if (!email) return;

  await sendSignupReceipt({
    to: email,
    volunteerName: signup.volunteer.user.name ?? "Volunteer",
    clinicName: signup.slot.clinic.name,
    date: signup.slot.date,
    subBlockHour: signup.subBlockHour,
    language: langLabel(signup.slot.language),
  });

  await prisma.notifLog.create({
    data: { type: "SIGNUP_RECEIPT", recipientEmail: email, signupId },
  });
}

async function processCancelReceipt(signupId: string) {
  // We stored the signupId at cancel time — look up even if cancelled
  const signup = await prisma.subBlockSignup.findUnique({
    where: { id: signupId },
    include: {
      slot: { include: { clinic: true } },
      volunteer: { include: { user: true, notifPrefs: true } },
    },
  });
  if (!signup) return;
  if (!signup.volunteer.notifPrefs?.cancellationReceipt) return;

  const email = signup.volunteer.user.email;
  if (!email) return;

  await sendCancellationReceipt({
    to: email,
    volunteerName: signup.volunteer.user.name ?? "Volunteer",
    clinicName: signup.slot.clinic.name,
    date: signup.slot.date,
    subBlockHour: signup.subBlockHour,
  });

  await prisma.notifLog.create({
    data: { type: "CANCEL_RECEIPT", recipientEmail: email, signupId },
  });
}

async function processUnfilledAlert(slotId: string, subBlockHour: number, cancelledVolunteerId: string | null) {
  const slot = await prisma.slot.findUnique({
    where: { id: slotId },
    include: { clinic: true },
  });
  if (!slot || slot.status !== "ACTIVE") return;

  // Only fire if slot is still within 24h
  const slotStart = new Date(slot.date);
  slotStart.setHours(subBlockHour, 0, 0, 0);
  const hoursUntil = (slotStart.getTime() - Date.now()) / 3_600_000;
  if (hoursUntil <= 0 || hoursUntil > 24) return;

  // Check sub-block is still underfilled
  const filled = await prisma.subBlockSignup.count({
    where: { slotId, subBlockHour, status: "ACTIVE" },
  });
  if (filled >= slot.interpreterCount) return; // filled since cancellation — skip

  // Find volunteers who qualify: active, speak the language, opted in, not already signed up for this block
  const signedUpVolunteerIds = (
    await prisma.subBlockSignup.findMany({
      where: { slotId, subBlockHour, status: "ACTIVE" },
      select: { volunteerId: true },
    })
  ).map((s) => s.volunteerId);

  const candidates = await prisma.volunteerProfile.findMany({
    where: {
      languages: { has: slot.language },
      id: { notIn: signedUpVolunteerIds },
      notifPrefs: { unfilledSlotAlert: true },
      user: { status: "ACTIVE" },
    },
    include: { user: true, notifPrefs: true },
  });

  for (const vol of candidates) {
    if (!vol.user.email) continue;
    // Don't email the person who just cancelled (they know)
    if (vol.id === cancelledVolunteerId) continue;

    // Deduplicate: don't email same volunteer+slot+hour if already notified recently
    const recentLog = await prisma.notifLog.findFirst({
      where: {
        type: "UNFILLED_ALERT",
        recipientEmail: vol.user.email,
        slotId,
        sentAt: { gte: new Date(Date.now() - 3 * 3_600_000) }, // within 3h
      },
    });
    if (recentLog) continue;

    try {
      await sendUnfilledSlotAlert({
        to: vol.user.email,
        volunteerName: vol.user.name ?? "Volunteer",
        clinicName: slot.clinic.name,
        clinicAddress: slot.clinic.address,
        date: slot.date,
        subBlockHour,
        language: langLabel(slot.language),
      });
      await prisma.notifLog.create({
        data: { type: "UNFILLED_ALERT", recipientEmail: vol.user.email, slotId },
      });
    } catch (err) {
      console.error("Failed unfilled alert to", vol.user.email, err);
    }
  }
}
