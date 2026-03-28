import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

async function getAdminUser() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return null;
  const user = await prisma.user.findUnique({ where: { email: session.user.email } });
  if (!user || (user.role !== "ADMIN" && user.role !== "SUPER_ADMIN")) return null;
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
    const conflictingSlots = await prisma.slot.findMany({
      where: {
        language: lang.code,
        date: { gte: today },
      },
      include: {
        clinic: { select: { name: true, contactEmail: true } },
        signups: { include: { volunteer: { include: { user: { select: { email: true, name: true } } } } } },
      },
    });

    if (conflictingSlots.length > 0 && !force) {
      return NextResponse.json({
        conflicts: conflictingSlots.map((s) => ({
          id: s.id,
          clinicName: s.clinic.name,
          date: s.date,
          language: lang.name,
        })),
      }, { status: 409 });
    }

    if (conflictingSlots.length > 0 && force) {
      const slotIds = conflictingSlots.map((s) => s.id);
      const signups = await prisma.subBlockSignup.findMany({
        where: { slotId: { in: slotIds } },
        select: { id: true },
      });
      const signupIds = signups.map((s) => s.id);
      await prisma.feedback.deleteMany({ where: { signupId: { in: signupIds } } });
      await prisma.subBlockSignup.deleteMany({ where: { slotId: { in: slotIds } } });
      await prisma.slot.deleteMany({ where: { id: { in: slotIds } } });
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
