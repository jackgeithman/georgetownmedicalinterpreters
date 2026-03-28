import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { sendGmail } from "@/lib/notifications/gmail";
import { logActivity } from "@/lib/activity-log";

async function getAdminUser() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return null;
  const user = await prisma.user.findUnique({ where: { email: session.user.email } });
  if (!user || user.role !== "ADMIN") return null;
  return user;
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await getAdminUser();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

  const { id } = await params;
  const body = await req.json();
  const { isActive, force } = body as { isActive: boolean; force?: boolean };

  if (typeof isActive !== "boolean") {
    return NextResponse.json({ error: "isActive must be a boolean" }, { status: 400 });
  }

  const lang = await prisma.languageConfig.findUnique({ where: { id } });
  if (!lang) return NextResponse.json({ error: "Language not found" }, { status: 404 });

  // If deactivating, check for upcoming clinic slots
  if (!isActive) {
    const today = new Date().toISOString().slice(0, 10);
    const allSlots = await prisma.slot.findMany({
      where: {
        language: lang.code,
        date: { gte: today },
      },
      include: {
        clinic: { select: { id: true, name: true, contactEmail: true } },
        signups: { include: { volunteer: { include: { user: { select: { email: true, name: true } } } } } },
      },
    });

    // Separate filled and unfilled slots
    const filledSlots = allSlots.filter((s) => s.signups.length >= s.interpreterCount);
    const unfilledSlots = allSlots.filter((s) => s.signups.length < s.interpreterCount);

    if (allSlots.length > 0 && !force) {
      return NextResponse.json({
        conflicts: allSlots.map((s) => {
          const isFilled = s.signups.length >= s.interpreterCount;
          return {
            id: s.id,
            clinicName: s.clinic.name,
            clinicEmail: s.clinic.contactEmail,
            date: s.date,
            language: lang.name,
            isFilled,
            assignedVolunteers: s.signups.map((su) => ({ name: su.volunteer.user.name || "Unknown", email: su.volunteer.user.email })),
            interpreterCount: s.interpreterCount,
            signupCount: s.signups.length,
          };
        }),
      }, { status: 409 });
    }

    if (unfilledSlots.length > 0 && force) {
      // Only delete unfilled slots
      const unfilledSlotIds = unfilledSlots.map((s) => s.id);
      const signups = await prisma.subBlockSignup.findMany({
        where: { slotId: { in: unfilledSlotIds } },
        select: { id: true },
      });
      const signupIds = signups.map((s) => s.id);

      // Delete feedback for cancelled signups
      await prisma.feedback.deleteMany({ where: { signupId: { in: signupIds } } });
      // Delete signups for cancelled slots
      await prisma.subBlockSignup.deleteMany({ where: { slotId: { in: unfilledSlotIds } } });
      // Delete the slots
      await prisma.slot.deleteMany({ where: { id: { in: unfilledSlotIds } } });

      // Send emails to clinics about cancelled unfilled slots
      const clinicsToNotify = new Map<string, { name: string; email: string; slots: typeof unfilledSlots }>();
      for (const slot of unfilledSlots) {
        const key = slot.clinic.id;
        if (!clinicsToNotify.has(key)) {
          clinicsToNotify.set(key, { name: slot.clinic.name, email: slot.clinic.contactEmail, slots: [] });
        }
        clinicsToNotify.get(key)!.slots.push(slot);
      }

      for (const [, clinicInfo] of clinicsToNotify) {
        if (clinicInfo.email) {
          const slotList = clinicInfo.slots
            .map((s) => {
              const dateStr = s.date instanceof Date
                ? s.date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
                : new Date(String(s.date).slice(0, 10) + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
              return `${dateStr} (${lang.name})`;
            })
            .join(", ");

          const html = `<!DOCTYPE html><html><body style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px;color:#1a1a1a">
<div style="border-bottom:3px solid #002147;padding-bottom:12px;margin-bottom:24px">
  <h2 style="color:#002147;margin:0;font-size:20px">Georgetown Medical Interpreters</h2>
</div>
<h3 style="color:#002147;margin-top:0">Interpreter Slots Cancelled</h3>
<p style="font-size:0.9rem;color:#666">The following interpreter slots have been cancelled because the language is currently not supported:</p>
<p style="font-size:0.9rem;color:#333"><strong>${slotList}</strong></p>
<p style="font-size:0.9rem;color:#666">Please contact Georgetown Medical Interpreters if you have any questions.</p>
<div style="margin-top:32px;padding-top:16px;border-top:1px solid #e5e7eb;font-size:11px;color:#9ca3af">
  Georgetown Medical Interpreters &middot; georgetownmedicalinterpreters.org
</div>
</body></html>`;

          await sendGmail(clinicInfo.email, `Interpreter Slots Cancelled: ${lang.name} Language No Longer Supported`, html).catch(console.error);
        }
      }

      // Log activity
      await logActivity({
        actorId: admin.id,
        actorEmail: admin.email ?? undefined,
        actorName: admin.name ?? undefined,
        action: "LANGUAGE_DEACTIVATED",
        targetType: "Language",
        targetId: id,
        detail: `Deactivated ${lang.name} (${lang.code}), cancelled ${unfilledSlots.length} unfilled slots`,
      });
    }
  }

  const updated = await prisma.languageConfig.update({
    where: { id },
    data: { isActive },
  });

  const profiles = await prisma.volunteerProfile.findMany({ select: { languages: true } });
  const counts: Record<string, number> = {};
  for (const p of profiles) {
    for (const l of p.languages) { counts[l] = (counts[l] ?? 0) + 1; }
  }

  return NextResponse.json({ ...updated, volunteerCount: counts[updated.code] ?? 0 });
}
