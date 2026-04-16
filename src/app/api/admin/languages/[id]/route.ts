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

  // If deactivating, check for upcoming shifts that need this language
  if (!isActive) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const upcomingShifts = await prisma.shift.findMany({
      where: {
        status: "ACTIVE",
        date: { gte: today },
        languagesNeeded: { has: lang.code },
      },
      include: {
        clinic: { select: { id: true, name: true, contactEmail: true } },
        positions: {
          where: { status: "FILLED" },
          include: { volunteer: { include: { user: { select: { email: true, name: true } } } } },
        },
      },
    });

    if (upcomingShifts.length > 0 && !force) {
      return NextResponse.json({
        conflicts: upcomingShifts.map((s) => ({
          id: s.id,
          clinicName: s.clinic.name,
          clinicEmail: s.clinic.contactEmail,
          date: s.date,
          language: lang.name,
          isFilled: s.positions.length > 0,
          assignedVolunteers: s.positions.map((p) => ({
            name: p.volunteer?.user.name || "Unknown",
            email: p.volunteer?.user.email,
          })),
        })),
      }, { status: 409 });
    }

    if (upcomingShifts.length > 0 && force) {
      // Cancel shifts that need this language and notify clinics
      const shiftIds = upcomingShifts.map((s) => s.id);

      // Delete feedback for affected positions
      const positionIds = upcomingShifts.flatMap((s) => s.positions.map((p) => p.id));
      if (positionIds.length > 0) {
        await prisma.feedback.deleteMany({ where: { positionId: { in: positionIds } } });
      }

      // Cancel positions then shifts
      await prisma.shiftPosition.updateMany({
        where: { shiftId: { in: shiftIds } },
        data: { status: "CANCELLED" },
      });
      await prisma.shift.updateMany({
        where: { id: { in: shiftIds } },
        data: { status: "CANCELLED" },
      });

      // Notify clinics
      const clinicsToNotify = new Map<string, { name: string; email: string; shifts: typeof upcomingShifts }>();
      for (const shift of upcomingShifts) {
        const key = shift.clinic.id;
        if (!clinicsToNotify.has(key)) {
          clinicsToNotify.set(key, { name: shift.clinic.name, email: shift.clinic.contactEmail, shifts: [] });
        }
        clinicsToNotify.get(key)!.shifts.push(shift);
      }

      for (const [, clinicInfo] of clinicsToNotify) {
        if (clinicInfo.email) {
          const shiftList = clinicInfo.shifts
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
<h3 style="color:#002147;margin-top:0">Interpreter Shifts Cancelled</h3>
<p style="font-size:0.9rem">The following interpreter shifts have been cancelled because the language is currently not supported:</p>
<p style="font-size:0.9rem"><strong>${shiftList}</strong></p>
<p style="font-size:0.9rem">Please contact Georgetown Medical Interpreters if you have any questions.</p>
<div style="margin-top:32px;padding-top:16px;border-top:1px solid #e5e7eb;font-size:11px;color:#9ca3af">
  Georgetown Medical Interpreters &middot; georgetownmedicalinterpreters.org
</div>
</body></html>`;

          await sendGmail(clinicInfo.email, `Interpreter Shifts Cancelled: ${lang.name} Language No Longer Supported`, html).catch(console.error);
        }
      }

      await logActivity({
        actorId: admin.id,
        actorEmail: admin.email ?? undefined,
        actorName: admin.name ?? undefined,
        action: "LANGUAGE_DEACTIVATED",
        targetType: "Language",
        targetId: id,
        detail: `Deactivated ${lang.name} (${lang.code}), cancelled ${upcomingShifts.length} upcoming shifts`,
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

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await getAdminUser();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

  const { id } = await params;
  const lang = await prisma.languageConfig.findUnique({ where: { id } });
  if (!lang) return NextResponse.json({ error: "Language not found" }, { status: 404 });

  // Block delete if any shifts (past or future) reference this language
  const shiftCount = await prisma.shift.count({ where: { languagesNeeded: { has: lang.code } } });
  if (shiftCount > 0) {
    return NextResponse.json(
      { error: `Cannot delete — ${shiftCount} shift${shiftCount !== 1 ? "s" : ""} reference this language. Deactivate it instead.` },
      { status: 409 }
    );
  }

  await prisma.languageConfig.delete({ where: { id } });

  await logActivity({
    actorId: admin.id,
    actorEmail: admin.email ?? undefined,
    actorName: admin.name ?? undefined,
    action: "LANGUAGE_DELETED",
    targetType: "Language",
    targetId: id,
    detail: `Deleted language ${lang.name} (${lang.code})`,
  });

  return NextResponse.json({ ok: true });
}
