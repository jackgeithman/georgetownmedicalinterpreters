/**
 * Cron: every hour
 * Sends 24h, 8h, and 2h reminders to volunteers.
 * Also fires clinic volunteer-cancel alerts if they fall within the clinic's chosen window.
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendReminder } from "@/lib/email";

function langLabel(code: string) {
  const map: Record<string, string> = { ES: "Spanish", ZH: "Mandarin", KO: "Korean", AR: "Arabic" };
  return map[code] ?? code;
}

// Windows to check: [hoursAhead, notifType, tolerance-minutes-before, tolerance-minutes-after]
const REMINDER_WINDOWS = [
  { hours: 24, type: "REMINDER_24H" as const, prefKey: "reminder24h" },
  { hours: 8, type: "REMINDER_8H" as const, prefKey: "reminder8h" },
  { hours: 2, type: "REMINDER_2H" as const, prefKey: "reminder2h" },
] as const;

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  let sent = 0;

  for (const window of REMINDER_WINDOWS) {
    const targetTime = new Date(Date.now() + window.hours * 3_600_000);
    // Fetch signups whose slot sub-block starts within ±35 min of targetTime
    const lower = new Date(targetTime.getTime() - 35 * 60_000);
    const upper = new Date(targetTime.getTime() + 35 * 60_000);

    // We need signups where the actual sub-block start time matches the window.
    // The slot date is stored at noon; startTime is the hour.
    // Strategy: find active slots whose date is close to targetTime's date and filter in JS.
    const dayStart = new Date(lower);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(upper);
    dayEnd.setHours(23, 59, 59, 999);

    const signups = await prisma.subBlockSignup.findMany({
      where: {
        status: "ACTIVE",
        slot: { status: "ACTIVE", date: { gte: dayStart, lte: dayEnd } },
      },
      include: {
        slot: { include: { clinic: true } },
        volunteer: { include: { user: true, notifPrefs: true } },
      },
    });

    for (const signup of signups) {
      const slotStart = new Date(signup.slot.date);
      slotStart.setHours(signup.subBlockHour, 0, 0, 0);
      if (slotStart < lower || slotStart > upper) continue;

      const prefs = signup.volunteer.notifPrefs;
      if (!prefs?.[window.prefKey]) continue;

      const email = signup.volunteer.user.email;
      if (!email) continue;

      // Deduplicate
      const already = await prisma.notifLog.findFirst({
        where: { type: window.type, recipientEmail: email, signupId: signup.id },
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
          hoursUntil: window.hours,
        });
        await prisma.notifLog.create({
          data: { type: window.type, recipientEmail: email, signupId: signup.id },
        });
        sent++;
      } catch (err) {
        console.error("Reminder failed", email, err);
      }
    }
  }

  return NextResponse.json({ sent });
}
