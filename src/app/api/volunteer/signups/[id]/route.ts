import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { notifyVolunteerCancellation, notifyNoShow } from "@/lib/notifications";
import { sendGmail } from "@/lib/notifications/gmail";
import { sendResendEmail } from "@/lib/notifications/resend";
import { logActivity } from "@/lib/activity-log";
import { langName } from "@/lib/languages";

function fmt12(h: number) {
  const period = h < 12 ? "AM" : "PM";
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${h12}:00 ${period}`;
}

function fmtDate(d: Date) {
  return d.toLocaleDateString("en-US", {
    weekday: "long", year: "numeric", month: "long", day: "numeric",
    timeZone: "America/New_York",
  });
}

function wrap(title: string, body: string) {
  return `<!DOCTYPE html><html><body style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px;color:#1a1a1a">
<div style="border-bottom:3px solid #002147;padding-bottom:12px;margin-bottom:24px">
  <h2 style="color:#002147;margin:0;font-size:20px">Georgetown Medical Interpreters</h2>
</div>
<h3 style="color:#002147;margin-top:0">${title}</h3>
${body}
<div style="margin-top:32px;padding-top:16px;border-top:1px solid #e5e7eb;font-size:11px;color:#9ca3af">
  Georgetown Medical Interpreters &middot; georgetownmedicalinterpreters.org
</div>
</body></html>`;
}

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

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getActiveVolunteer();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  if (!user.volunteer) return NextResponse.json({ error: "No volunteer profile" }, { status: 404 });

  const { id } = await params;
  const signup = await prisma.subBlockSignup.findUnique({
    where: { id },
    include: { slot: { include: { clinic: true } } },
  });
  if (!signup || signup.volunteerId !== user.volunteer.id || signup.status !== "ACTIVE") {
    return NextResponse.json({ error: "Signup not found" }, { status: 404 });
  }

  const slotDate = new Date(signup.slot.date);
  slotDate.setHours(signup.subBlockHour, 0, 0, 0);
  const hoursUntilSlot = (slotDate.getTime() - Date.now()) / 3_600_000;

  await prisma.subBlockSignup.update({
    where: { id },
    data: { status: "CANCELLED", cancelledAt: new Date() },
  });

  const counterUpdate: { cancellationsWithin24h?: { increment: number }; cancellationsWithin2h?: { increment: number } } = {};
  if (hoursUntilSlot < 24) {
    counterUpdate.cancellationsWithin24h = { increment: 1 };
    if (hoursUntilSlot < 2) counterUpdate.cancellationsWithin2h = { increment: 1 };
  }
  if (Object.keys(counterUpdate).length > 0) {
    await prisma.volunteerProfile.update({
      where: { id: user.volunteer.id },
      data: counterUpdate,
    });
  }

  const slot = signup.slot;
  const clinic = slot.clinic;

  // Check volunteer notif prefs
  const notifPrefs = await prisma.volunteerNotifPrefs.findUnique({
    where: { volunteerId: user.volunteer.id },
  }).catch(() => null);

  if ((notifPrefs?.cancellationReceipt ?? true) && user.email) {
    await notifyVolunteerCancellation({
      signupId: signup.id,
      volunteerEmail: user.email,
      volunteerName: user.name ?? user.email,
      clinicName: clinic.name,
      clinicAddress: clinic.address,
      clinicContactEmail: clinic.contactEmail,
      clinicUrgentAlerts: clinic.urgentCancellationAlerts,
      language: slot.language,
      date: slot.date,
      subBlockHour: signup.subBlockHour,
      hoursUntilSlot,
    }).catch(console.error);
  } else {
    // Even if receipt is off, still delete the calendar event
    const { deleteCalEvent } = await import("@/lib/notifications/gcal");
    await deleteCalEvent(signup.id).catch(() => {});
  }

  // If within 24h and slot is now underfilled, alert qualified volunteers
  if (hoursUntilSlot > 0 && hoursUntilSlot <= 24) {
    const filledCount = await prisma.subBlockSignup.count({
      where: { slotId: slot.id, subBlockHour: signup.subBlockHour, status: "ACTIVE" },
    });
    if (filledCount < slot.interpreterCount) {
      const alreadySignedUpIds = (
        await prisma.subBlockSignup.findMany({
          where: { slotId: slot.id, subBlockHour: signup.subBlockHour, status: "ACTIVE" },
          select: { volunteerId: true },
        })
      ).map((s) => s.volunteerId);

      const candidates = await prisma.volunteerProfile.findMany({
        where: {
          languages: { has: slot.language },
          id: { notIn: [...alreadySignedUpIds, user.volunteer.id] },
          notifPrefs: { unfilledSlotAlert: true },
          user: { status: "ACTIVE" },
        },
        include: { user: true },
      });

      const lang = langName(slot.language);

      for (const vol of candidates) {
        if (!vol.user.email) continue;
        const recentLog = await prisma.notifLog.findFirst({
          where: {
            type: "UNFILLED_ALERT",
            recipientEmail: vol.user.email,
            slotId: slot.id,
            sentAt: { gte: new Date(Date.now() - 3 * 3_600_000) },
          },
        });
        if (recentLog) continue;

        const html = wrap(
          "Open Interpreter Slot",
          `<p>Hi ${vol.user.name ?? "Volunteer"},</p>
<p>A <strong>${lang}</strong> interpreter slot has opened up and you match the requirements.</p>
<table style="margin:16px 0;border-collapse:collapse">
  <tr><td style="padding:4px 12px 4px 0;color:#6b7280;font-size:13px">Date</td><td style="font-size:13px;font-weight:600">${fmtDate(slot.date)}</td></tr>
  <tr><td style="padding:4px 12px 4px 0;color:#6b7280;font-size:13px">Time</td><td style="font-size:13px;font-weight:600">${fmt12(signup.subBlockHour)} – ${fmt12(signup.subBlockHour + 1)}</td></tr>
  <tr><td style="padding:4px 12px 4px 0;color:#6b7280;font-size:13px">Clinic</td><td style="font-size:13px;font-weight:600">${clinic.name}</td></tr>
</table>
<p style="font-size:13px;color:#6b7280">Sign in to Georgetown Medical Interpreters to claim this slot.</p>`
        );

        sendGmail(vol.user.email, `Open Slot: ${lang} at ${clinic.name} on ${fmtDate(slot.date)}`, html)
          .catch(() => {});

        prisma.notifLog.create({
          data: { type: "UNFILLED_ALERT", recipientEmail: vol.user.email, slotId: slot.id },
        }).catch(() => {});
      }
    }
  }

  await logActivity({
    actorId: user.id,
    actorEmail: user.email ?? undefined,
    actorName: user.name ?? undefined,
    action: "SIGNUP_CANCELLED",
    targetType: "Signup",
    targetId: id,
    detail: `Cancelled ${slot.language} slot at ${clinic.name} hour ${signup.subBlockHour}`,
  });

  return NextResponse.json({ ok: true });
}
