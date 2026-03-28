import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { logActivity } from "@/lib/activity-log";

function primaryRole(roles: string[]): string {
  if (roles.includes("SUPER_ADMIN")) return "SUPER_ADMIN";
  if (roles.includes("ADMIN")) return "ADMIN";
  if (roles.includes("INSTRUCTOR")) return "INSTRUCTOR";
  if (roles.includes("VOLUNTEER")) return "VOLUNTEER";
  return "PENDING";
}

async function getAdminUser() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return null;
  const user = await prisma.user.findUnique({ where: { email: session.user.email } });
  if (!user || (user.role !== "ADMIN" && user.role !== "SUPER_ADMIN")) return null;
  return user;
}

export async function GET() {
  const admin = await getAdminUser();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

  const users = await prisma.user.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      clinic: { select: { name: true } },
      volunteer: {
        select: {
          languages: true,
          hoursVolunteered: true,
          cancellationsWithin24h: true,
          cancellationsWithin2h: true,
          noShows: true,
          isCleared: true,
          clearedAt: true,
          clearedById: true,
          clearanceLogs: {
            orderBy: { createdAt: "desc" },
            take: 1,
            include: { clearedBy: { select: { name: true, email: true } } },
          },
        },
      },
    },
  });

  // Include roles in the response (already part of user model)
  return NextResponse.json(users);
}

export async function PATCH(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

  const admin = await prisma.user.findUnique({ where: { email: session.user.email } });
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

  const isAdmin = admin.role === "ADMIN" || admin.role === "SUPER_ADMIN";
  const isSuperAdmin = admin.role === "SUPER_ADMIN";
  const isInstructor = admin.roles.includes("INSTRUCTOR");

  if (!isAdmin && !isInstructor) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

  const body = await req.json();
  const { userId, addRole, removeRole, toggleLanguageClearance, confirmRemoveVolunteer, status, clinicId } = body;

  if (!userId) return NextResponse.json({ error: "userId required" }, { status: 400 });

  const target = await prisma.user.findUnique({
    where: { id: userId },
    include: { volunteer: { include: { signups: { include: { slot: true } } } } },
  });
  if (!target) return NextResponse.json({ error: "User not found" }, { status: 404 });

  // Handle status and clinicId (existing logic, kept for backwards compat)
  if (status !== undefined || clinicId !== undefined) {
    if (!isAdmin) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

    // ADMIN cannot modify other ADMINs (only SUPER_ADMIN can)
    if (target.role === "ADMIN" && !isSuperAdmin) {
      return NextResponse.json({ error: "Only the super admin can modify Admin accounts" }, { status: 403 });
    }

    const updateData: Record<string, unknown> = {};
    if (status !== undefined) updateData.status = status;
    if (clinicId !== undefined) updateData.clinicId = clinicId;
    const updated = await prisma.user.update({ where: { id: userId }, data: updateData });

    if (target.email && status) {
      const wasApproved = target.status === "PENDING_APPROVAL" && status === "ACTIVE";
      const wasSuspended = target.status !== "SUSPENDED" && status === "SUSPENDED";
      if (wasApproved) {
        const { notifyUserApproved } = await import("@/lib/notifications");
        await notifyUserApproved({ email: target.email, name: target.name ?? target.email, role: updated.role }).catch(console.error);
      } else if (wasSuspended) {
        const { notifyUserSuspended } = await import("@/lib/notifications");
        await notifyUserSuspended({ email: target.email, name: target.name ?? target.email }).catch(console.error);
      }
    }
    await logActivity({
      actorId: admin.id,
      actorEmail: admin.email ?? undefined,
      actorName: admin.name ?? undefined,
      action: status ? "USER_STATUS_CHANGED" : "USER_CLINIC_CHANGED",
      targetType: "User",
      targetId: userId,
      detail: status
        ? `Changed status of ${target.email} to ${status}`
        : `Changed clinic of ${target.email} to ${clinicId ?? "none"}`,
    });
    return NextResponse.json(updated);
  }

  // Handle isCleared (backwards compat — legacy general clearance)
  if (typeof body.isCleared === "boolean") {
    if (!isAdmin) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    const volunteerProfile = await prisma.volunteerProfile.findUnique({ where: { userId: target.id } });
    if (!volunteerProfile) {
      return NextResponse.json({ error: "User has no volunteer profile" }, { status: 400 });
    }
    await prisma.$transaction([
      prisma.volunteerProfile.update({
        where: { userId: target.id },
        data: { isCleared: body.isCleared, clearedById: admin.id, clearedAt: new Date() },
      }),
      prisma.clearanceLog.create({
        data: {
          volunteerId: volunteerProfile.id,
          clearedById: admin.id,
          isCleared: body.isCleared,
          note: body.note ?? null,
        },
      }),
    ]);
    return NextResponse.json({ ok: true });
  }

  // Handle language clearance toggle
  if (toggleLanguageClearance) {
    const langCode = toggleLanguageClearance.toUpperCase();
    // Permission: must be admin or instructor cleared for this language
    if (!isAdmin) {
      const adminClearedForLang = admin.roles.includes(`LANG_${langCode}_CLEARED`);
      if (!adminClearedForLang) return NextResponse.json({ error: "You are not cleared for this language" }, { status: 403 });
    }
    const currentRoles = target.roles;
    const hasCleared = currentRoles.includes(`LANG_${langCode}_CLEARED`);
    const hasUncleared = currentRoles.includes(`LANG_${langCode}`);
    let newRoles: string[];
    let nowCleared: boolean;
    if (hasCleared) {
      // Remove clearance: LANG_XX_CLEARED → LANG_XX
      newRoles = currentRoles.filter((r) => r !== `LANG_${langCode}_CLEARED`).concat(`LANG_${langCode}`);
      nowCleared = false;
    } else if (hasUncleared) {
      // Grant clearance: LANG_XX → LANG_XX_CLEARED
      newRoles = currentRoles.filter((r) => r !== `LANG_${langCode}`).concat(`LANG_${langCode}_CLEARED`);
      nowCleared = true;
    } else {
      return NextResponse.json({ error: "User does not have this language" }, { status: 400 });
    }
    // Get volunteer profile for audit log
    const vp = await prisma.volunteerProfile.findUnique({ where: { userId: target.id } });
    await prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id: userId }, data: { roles: newRoles } });
      if (vp) {
        await tx.clearanceLog.create({
          data: { volunteerId: vp.id, clearedById: admin.id, isCleared: nowCleared, languageCode: langCode },
        });
      }
    });
    await logActivity({
      actorId: admin.id,
      actorEmail: admin.email ?? undefined,
      actorName: admin.name ?? undefined,
      action: nowCleared ? "LANG_CLEARANCE_GRANTED" : "LANG_CLEARANCE_REVOKED",
      targetType: "User",
      targetId: userId,
      detail: `${nowCleared ? "Granted" : "Revoked"} ${langCode} clearance for ${target.email}`,
    });
    return NextResponse.json({ ok: true, roles: newRoles });
  }

  // Handle addRole
  if (addRole) {
    if (!isAdmin) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    // Permission check
    if (target.roles.includes(addRole)) return NextResponse.json({ error: "User already has this role" }, { status: 400 });

    const newRoles = [...target.roles.filter((r) => r !== "PENDING"), addRole];
    // If adding INSTRUCTOR, also ensure VOLUNTEER is present
    if (addRole === "INSTRUCTOR" && !newRoles.includes("VOLUNTEER")) {
      newRoles.push("VOLUNTEER");
    }
    const newPrimaryRole = primaryRole(newRoles);

    // Ensure volunteer profile exists if adding VOLUNTEER or INSTRUCTOR
    if (addRole === "VOLUNTEER" || addRole === "INSTRUCTOR") {
      await prisma.volunteerProfile.upsert({
        where: { userId: target.id },
        create: { userId: target.id, languages: [] },
        update: {},
      });
    }

    await prisma.user.update({
      where: { id: userId },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      data: { roles: newRoles, role: newPrimaryRole as any },
    });
    await logActivity({
      actorId: admin.id,
      actorEmail: admin.email ?? undefined,
      actorName: admin.name ?? undefined,
      action: "ROLE_ADDED",
      targetType: "User",
      targetId: userId,
      detail: `Added role ${addRole} to ${target.email}`,
    });
    return NextResponse.json({ ok: true, roles: newRoles });
  }

  // Handle removeRole
  if (removeRole) {
    if (!isAdmin) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    // VOLUNTEER removal: check for upcoming signups
    if (removeRole === "VOLUNTEER" && !confirmRemoveVolunteer) {
      const now = new Date();
      const vp = await prisma.volunteerProfile.findUnique({ where: { userId: target.id } });
      if (vp) {
        const upcomingCount = await prisma.subBlockSignup.count({
          where: {
            volunteerId: vp.id,
            status: "ACTIVE",
            slot: { date: { gte: now }, status: "ACTIVE" },
          },
        });
        if (upcomingCount > 0) {
          return NextResponse.json({ needsConfirm: true, upcomingCount });
        }
      }
    }

    // If confirmed VOLUNTEER removal: cancel future signups
    if (removeRole === "VOLUNTEER" && confirmRemoveVolunteer) {
      const now = new Date();
      const vp = await prisma.volunteerProfile.findUnique({ where: { userId: target.id } });
      if (vp) {
        await prisma.subBlockSignup.updateMany({
          where: {
            volunteerId: vp.id,
            status: "ACTIVE",
            slot: { date: { gte: now }, status: "ACTIVE" },
          },
          data: { status: "CANCELLED", cancelledAt: now },
        });
      }
    }

    let newRoles = target.roles.filter((r) => r !== removeRole);
    // If roles is now empty or only has LANG_ entries, add PENDING
    if (newRoles.length === 0 || newRoles.every((r) => r.startsWith("LANG_"))) {
      newRoles = [...newRoles.filter((r) => r.startsWith("LANG_")), "PENDING"];
    }
    const newPrimaryRole = primaryRole(newRoles);

    await prisma.user.update({
      where: { id: userId },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      data: { roles: newRoles, role: newPrimaryRole as any },
    });
    await logActivity({
      actorId: admin.id,
      actorEmail: admin.email ?? undefined,
      actorName: admin.name ?? undefined,
      action: "ROLE_REMOVED",
      targetType: "User",
      targetId: userId,
      detail: `Removed role ${removeRole} from ${target.email}`,
    });
    return NextResponse.json({ ok: true, roles: newRoles });
  }

  // Handle addLanguage
  if (body.addLanguage) {
    if (!isAdmin) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    const langCode = (body.addLanguage as string).toUpperCase();
    if (target.roles.includes(`LANG_${langCode}`) || target.roles.includes(`LANG_${langCode}_CLEARED`)) {
      return NextResponse.json({ error: "User already has this language" }, { status: 400 });
    }
    const newRoles = [...target.roles, `LANG_${langCode}`];
    await prisma.user.update({ where: { id: userId }, data: { roles: newRoles } });
    return NextResponse.json({ ok: true, roles: newRoles });
  }

  // Handle removeLanguage
  if (body.removeLanguage) {
    if (!isAdmin) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    const langCode = (body.removeLanguage as string).toUpperCase();
    const newRoles = target.roles.filter((r) => r !== `LANG_${langCode}` && r !== `LANG_${langCode}_CLEARED`);
    await prisma.user.update({ where: { id: userId }, data: { roles: newRoles } });
    return NextResponse.json({ ok: true, roles: newRoles });
  }

  // Handle counter edits (cancellations / no-shows)
  if (body.updateCounters !== undefined) {
    if (!isAdmin) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    const { cancellationsWithin24h, cancellationsWithin2h, noShows } = body.updateCounters as Record<string, number>;
    const vp = await prisma.volunteerProfile.findUnique({ where: { userId: target.id } });
    if (!vp) return NextResponse.json({ error: "No volunteer profile" }, { status: 400 });
    const updateData: Record<string, number> = {};
    if (cancellationsWithin24h !== undefined) updateData.cancellationsWithin24h = cancellationsWithin24h;
    if (cancellationsWithin2h !== undefined) updateData.cancellationsWithin2h = cancellationsWithin2h;
    if (noShows !== undefined) updateData.noShows = noShows;
    await prisma.volunteerProfile.update({ where: { id: vp.id }, data: updateData });
    await logActivity({
      actorId: admin.id,
      actorEmail: admin.email ?? undefined,
      actorName: admin.name ?? undefined,
      action: "COUNTERS_EDITED",
      targetType: "User",
      targetId: userId,
      detail: `Edited counters for ${target.email}: ${JSON.stringify(updateData)}`,
    });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "No valid operation specified" }, { status: 400 });
}
