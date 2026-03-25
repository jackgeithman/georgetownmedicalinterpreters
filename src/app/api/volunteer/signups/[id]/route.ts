import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  sendCancellationReceipt,
  sendClinicVolunteerCancelAlert,
  sendUnfilledSlotAlert,
} from "@/lib/email";

function langLabel(code: string) {
  const map: Record<string, string> = { ES: "Spanish", ZH: "Mandarin", KO: "Korean", AR: "Arabic" };
  return map[code] ?? code;
}

async function getActiveVolunteer() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return null;
  const user = await prisma.user.findUnique({
    where: { email: session.user.email },
    include: { volunteer: { include: { notifPrefs: true } } },
  });
  if (!user) return null;
  const isVolunteerRole = user.role === "VOLUNTEER" || user.role === "ADMIN" || user.role === "SUPER_ADMIN";
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
    include: {
      slot: { include: { clinic: { include: { notifPrefs: true } } } },
    },
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

  // Increment cancellation counters
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

  // ── Send cancellation receipt immediately ──
  if ((user.volunteer.notifPrefs?.cancellationReceipt ?? true) && user.email) {
    sendCancellationReceipt({
      to: user.email,
      volunteerName: user.name ?? "Volunteer",
      clinicName: clinic.name,
      date: slot.date,
      subBlockHour: signup.subBlockHour,
    }).catch(() => {/* non-fatal */});
  }

  // ── If within 24h of the slot, handle clinic alert + unfilled volunteer alerts ──
  if (hoursUntilSlot > 0 && hoursUntilSlot <= 24) {
    // Clinic volunteer-cancel alert (check their window preference)
    const clinicPrefs = clinic.notifPrefs;
    if (clinicPrefs?.volunteerCancelWindow != null && hoursUntilSlot <= clinicPrefs.volunteerCancelWindow) {
      const filledAfterCancel = await prisma.subBlockSignup.count({
        where: { slotId: slot.id, subBlockHour: signup.subBlockHour, status: "ACTIVE" },
      });
      sendClinicVolunteerCancelAlert({
        to: clinic.contactEmail,
        clinicName: clinic.name,
        volunteerName: user.name ?? user.email ?? "A volunteer",
        date: slot.date,
        subBlockHour: signup.subBlockHour,
        filledAfterCancel,
        needed: slot.interpreterCount,
      }).catch(() => {/* non-fatal */});
    }

    // Unfilled slot alert — check if sub-block is now underfilled
    const filledCount = await prisma.subBlockSignup.count({
      where: { slotId: slot.id, subBlockHour: signup.subBlockHour, status: "ACTIVE" },
    });
    if (filledCount < slot.interpreterCount) {
      // Find opted-in volunteers who qualify and aren't already signed up for this block
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

      for (const vol of candidates) {
        if (!vol.user.email) continue;
        // Deduplicate: don't email same volunteer for same slot+hour within 3h
        const recentLog = await prisma.notifLog.findFirst({
          where: {
            type: "UNFILLED_ALERT",
            recipientEmail: vol.user.email,
            slotId: slot.id,
            sentAt: { gte: new Date(Date.now() - 3 * 3_600_000) },
          },
        });
        if (recentLog) continue;

        sendUnfilledSlotAlert({
          to: vol.user.email,
          volunteerName: vol.user.name ?? "Volunteer",
          clinicName: clinic.name,
          clinicAddress: clinic.address,
          date: slot.date,
          subBlockHour: signup.subBlockHour,
          language: langLabel(slot.language),
        }).catch(() => {/* non-fatal */});

        prisma.notifLog.create({
          data: { type: "UNFILLED_ALERT", recipientEmail: vol.user.email, slotId: slot.id },
        }).catch(() => {/* non-fatal */});
      }
    }
  }

  return NextResponse.json({ ok: true });
}
