import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

async function getVolunteerUser() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return null;
  const user = await prisma.user.findUnique({
    where: { email: session.user.email },
    include: { volunteer: true },
  });
  if (!user || (user.role !== "VOLUNTEER" && user.role !== "ADMIN" && user.role !== "INSTRUCTOR")) return null;
  return user;
}

export async function GET() {
  const user = await getVolunteerUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

  if (!user.volunteer) {
    const profile = await prisma.volunteerProfile.create({
      data: { userId: user.id, languages: [] },
    });
    return NextResponse.json({ ...profile, phone: user.phone ?? null, clearanceStatus: null, clearanceDate: null, userCreatedAt: user.createdAt });
  }

  // Fetch clearance status
  const clearance = await prisma.clearanceLog.findFirst({
    where: { volunteerId: user.id },
    orderBy: { createdAt: "desc" },
    select: { isCleared: true, createdAt: true },
  });

  return NextResponse.json({
    ...user.volunteer,
    phone: user.phone ?? null,
    clearanceStatus: clearance?.isCleared ? "APPROVED" : clearance ? "PENDING" : null,
    clearanceDate: clearance?.createdAt ?? null,
    userCreatedAt: user.createdAt,
  });
}

export async function PATCH(req: NextRequest) {
  const user = await getVolunteerUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

  const body = await req.json();
  const { languages, backgroundInfo, phone } = body;

  // Update phone on User model if provided
  if (phone !== undefined) {
    await prisma.user.update({ where: { id: user.id }, data: { phone: phone?.trim() || null } });
  }

  if (!user.volunteer) {
    const profile = await prisma.volunteerProfile.create({
      data: { userId: user.id, languages: languages ?? [] },
    });
    return NextResponse.json({ ...profile, phone: phone?.trim() || null });
  }

  const updateData: Record<string, unknown> = {};
  if (languages !== undefined) updateData.languages = languages;
  if (backgroundInfo !== undefined) updateData.backgroundInfo = backgroundInfo || null;

  const profile = await prisma.volunteerProfile.update({
    where: { id: user.volunteer.id },
    data: updateData,
  });

  // Sync LANG_ roles on the User when languages change
  if (languages !== undefined) {
    const newLangs = languages as string[];
    const oldLangs = user.volunteer.languages ?? [];
    let currentRoles = [...(user.roles ?? [])];

    // Remove roles for languages removed from profile
    for (const lang of oldLangs) {
      if (!newLangs.includes(lang)) {
        currentRoles = currentRoles.filter(
          (r) => r !== `LANG_${lang}` && r !== `LANG_${lang}_CLEARED` && r !== `LANG_${lang}_DENIED`,
        );
      }
    }

    // For newly added languages, add LANG_XX (pending) unless already has a role for this lang
    for (const lang of newLangs) {
      if (!oldLangs.includes(lang)) {
        const hasDenied = currentRoles.includes(`LANG_${lang}_DENIED`);
        const hasCleared = currentRoles.includes(`LANG_${lang}_CLEARED`);
        const hasPending = currentRoles.includes(`LANG_${lang}`);
        if (hasDenied) {
          // Re-requesting after denial — reset to pending
          currentRoles = currentRoles.filter((r) => r !== `LANG_${lang}_DENIED`);
          currentRoles.push(`LANG_${lang}`);
        } else if (!hasCleared && !hasPending) {
          currentRoles.push(`LANG_${lang}`);
        }
      }
    }

    await prisma.user.update({ where: { id: user.id }, data: { roles: currentRoles } });
  }

  return NextResponse.json(profile);
}
