/**
 * Cron: every 15 minutes
 * Checks PendingNotif of type CLINIC_VOLUNTEER_CANCEL and sends them
 * if the clinic's volunteerCancelWindow preference puts the slot within alert range.
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendClinicVolunteerCancelAlert } from "@/lib/email";

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
    where: { processed: false, type: "CLINIC_VOLUNTEER_CANCEL", scheduledFor: { lte: now } },
    take: 100,
  });

  const ids = pending.map((p) => p.id);
  let sent = 0;

  for (const notif of pending) {
    if (!notif.signupId || !notif.slotId || notif.subBlockHour == null) continue;

    try {
      const signup = await prisma.subBlockSignup.findUnique({
        where: { id: notif.signupId },
        include: {
          slot: { include: { clinic: { include: { notifPrefs: true } } } },
          volunteer: { include: { user: true } },
        },
      });
      if (!signup) continue;

      const clinic = signup.slot.clinic;
      const prefs = clinic.notifPrefs;
      // If clinic has volunteerCancelWindow = null, they don't want these alerts
      if (!prefs || prefs.volunteerCancelWindow == null) continue;

      const slotStart = new Date(signup.slot.date);
      slotStart.setHours(notif.subBlockHour, 0, 0, 0);
      const hoursUntil = (slotStart.getTime() - now.getTime()) / 3_600_000;

      // Only alert if within the chosen window
      if (hoursUntil > prefs.volunteerCancelWindow || hoursUntil <= 0) continue;

      // Count how many are still filled after this cancellation
      const filledAfterCancel = await prisma.subBlockSignup.count({
        where: { slotId: notif.slotId, subBlockHour: notif.subBlockHour, status: "ACTIVE" },
      });

      await sendClinicVolunteerCancelAlert({
        to: clinic.contactEmail,
        clinicName: clinic.name,
        volunteerName: signup.volunteer.user.name ?? signup.volunteer.user.email ?? "A volunteer",
        date: signup.slot.date,
        subBlockHour: notif.subBlockHour,
        filledAfterCancel,
        needed: signup.slot.interpreterCount,
      });

      await prisma.notifLog.create({
        data: {
          type: "CLINIC_VOLUNTEER_CANCEL",
          recipientEmail: clinic.contactEmail,
          signupId: notif.signupId,
          slotId: notif.slotId,
        },
      });
      sent++;
    } catch (err) {
      console.error("Clinic cancel alert failed", notif.id, err);
    }
  }

  if (ids.length > 0) {
    await prisma.pendingNotif.updateMany({ where: { id: { in: ids } }, data: { processed: true } });
  }

  return NextResponse.json({ processed: ids.length, sent });
}
