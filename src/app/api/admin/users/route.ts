import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { logActivity } from "@/lib/activity-log";

function primaryRole(roles: string[]): string {
  // DEV is a capability (can be added to ADMIN), not a primary role
  if (roles.includes("ADMIN")) return "ADMIN";
  if (roles.includes("INSTRUCTOR")) return "INSTRUCTOR";
  if (roles.includes("VOLUNTEER")) return "VOLUNTEER";
  return "PENDING";
}

async function getAdminUser() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return null;
  const user = await prisma.user.findUnique({ where: { email: session.user.email } });
  if (!user || (user.role !== "ADMIN" && user.role !== "INSTRUCTOR")) return null;
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

  const isAdmin = admin.role === "ADMIN";
  const isSuperAdmin = admin.roles?.includes("DEV");
  const isInstructor = admin.roles.includes("INSTRUCTOR");

  if (!isAdmin && !isInstructor) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

  const body = await req.json();
  const { userId, addRole, removeRole, confirmRemoveVolunteer, status, clinicId } = body;

  if (!userId) return NextResponse.json({ error: "userId required" }, { status: 400 });

  const target = await prisma.user.findUnique({
    where: { id: userId },
    include: { volunteer: { include: { signups: { include: { slot: true } } } } },
  });
  if (!target) return NextResponse.json({ error: "User not found" }, { status: 404 });

  // Handle status and clinicId (existing logic, kept for backwards compat)
  if (status !== undefined || clinicId !== undefined) {
    if (!isAdmin) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

    // ADMIN cannot modify other ADMINs (only DEV can)
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

  // Handle explicit language clearance actions: approve / deny / revoke / override
  const { approveLanguage, denyLanguage, revokeLanguage, overrideLanguage } = body;
  const langActionValue = approveLanguage ?? denyLanguage ?? revokeLanguage ?? overrideLanguage;
  if (langActionValue) {
    const langCode = (langActionValue as string).toUpperCase();
    const action: "approve" | "deny" | "revoke" | "override" =
      approveLanguage ? "approve" : denyLanguage ? "deny" : revokeLanguage ? "revoke" : "override";

    // Admins can act on any language. Instructors can only act on languages they are cleared for.
    if (!isAdmin) {
      const clearedForLang = admin.roles.includes(`LANG_${langCode}_CLEARED`);
      if (!clearedForLang) return NextResponse.json({ error: "You are not cleared for this language" }, { status: 403 });
    }

    // Note is required for deny, revoke, override
    if ((action === "deny" || action === "revoke" || action === "override") && !body.note?.trim()) {
      return NextResponse.json({ error: "A note is required for this action" }, { status: 400 });
    }

    const base = target.roles.filter(
      (r) => r !== `LANG_${langCode}` && r !== `LANG_${langCode}_CLEARED` && r !== `LANG_${langCode}_DENIED`,
    );
    let newRoles: string[];
    let nowCleared: boolean;
    let activityAction: string;

    switch (action) {
      case "approve":
        newRoles = [...base, `LANG_${langCode}_CLEARED`];
        nowCleared = true;
        activityAction = "LANG_CLEARANCE_GRANTED";
        break;
      case "deny":
        newRoles = [...base, `LANG_${langCode}_DENIED`];
        nowCleared = false;
        activityAction = "LANG_CLEARANCE_DENIED";
        break;
      case "revoke":
        newRoles = [...base, `LANG_${langCode}_DENIED`];
        nowCleared = false;
        activityAction = "LANG_CLEARANCE_REVOKED";
        break;
      case "override":
        newRoles = [...base, `LANG_${langCode}_CLEARED`];
        nowCleared = true;
        activityAction = "LANG_CLEARANCE_OVERRIDE";
        break;
    }

    // Look up language name for emails
    const langConfig = await prisma.languageConfig.findUnique({ where: { code: langCode } });
    const languageName = langConfig?.name ?? langCode;

    const vp = await prisma.volunteerProfile.findUnique({ where: { userId: target.id } });
    await prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id: userId }, data: { roles: newRoles } });
      if (vp) {
        await tx.clearanceLog.create({
          data: {
            volunteerId: vp.id,
            clearedById: admin.id,
            isCleared: nowCleared,
            note: body.note ?? null,
            languageCode: langCode,
          },
        });
      }
    });

    await logActivity({
      actorId: admin.id,
      actorEmail: admin.email ?? undefined,
      actorName: admin.name ?? undefined,
      action: activityAction,
      targetType: "User",
      targetId: userId,
      detail: `${activityAction.replace(/_/g, " ")} for ${langCode} on ${target.email}${body.note ? ` — note: ${body.note}` : ""}`,
    });

    if (target.email) {
      if (action === "approve" || action === "override") {
        const { notifyLanguageCleared } = await import("@/lib/notifications");
        await notifyLanguageCleared({
          volunteerEmail: target.email,
          volunteerName: target.name ?? target.email,
          languageName,
        }).catch(console.error);
      } else {
        const { notifyLanguageDenied } = await import("@/lib/notifications");
        await notifyLanguageDenied({
          volunteerEmail: target.email,
          volunteerName: target.name ?? target.email,
          languageName,
        }).catch(console.error);
      }
    }

    return NextResponse.json({ ok: true, roles: newRoles });
  }

  // Handle approveRole (per-role onboarding approval)
  if (body.approveRole) {
    if (!isAdmin) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    const roleToApprove = (body.approveRole as string).toUpperCase();
    const pendingKey = `${roleToApprove}_PENDING`;

    if (!target.roles.includes(pendingKey)) {
      return NextResponse.json({ error: "Role is not pending for this user" }, { status: 400 });
    }

    // Remove pending entry, add the approved role
    const withoutPending = target.roles.filter((r) => r !== pendingKey && r !== "PENDING");
    const newRoles = [...withoutPending, roleToApprove];

    // INSTRUCTOR implies VOLUNTEER
    if (roleToApprove === "INSTRUCTOR" && !newRoles.includes("VOLUNTEER")) {
      newRoles.push("VOLUNTEER");
    }

    const newPrimaryRole = primaryRole(newRoles);

    // Ensure volunteer profile exists when approving VOLUNTEER or INSTRUCTOR
    if (roleToApprove === "VOLUNTEER" || roleToApprove === "INSTRUCTOR") {
      const existingVp = await prisma.volunteerProfile.findUnique({ where: { userId: target.id } });
      if (!existingVp) {
        await prisma.volunteerProfile.create({ data: { userId: target.id, languages: [] } });
      }
    }

    // Grant access immediately on first approval
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await prisma.user.update({ where: { id: userId }, data: { roles: newRoles, role: newPrimaryRole as any, status: "ACTIVE" } });

    await logActivity({
      actorId: admin.id,
      actorEmail: admin.email ?? undefined,
      actorName: admin.name ?? undefined,
      action: "ROLE_ADDED",
      targetType: "User",
      targetId: userId,
      detail: `Approved role ${roleToApprove} for ${target.email} (onboarding)`,
    });

    const approvedRoles = newRoles.filter((r) => ["VOLUNTEER", "INSTRUCTOR", "ADMIN"].includes(r));
    if (target.email) {
      const { notifyRolesApproved } = await import("@/lib/notifications");
      await notifyRolesApproved({
        email: target.email,
        name: target.name ?? target.email,
        approvedRoles,
      }).catch(console.error);
    }

    return NextResponse.json({ ok: true, roles: newRoles });
  }

  // Handle rejectRole (per-role onboarding rejection)
  if (body.rejectRole) {
    if (!isAdmin) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    const roleToReject = (body.rejectRole as string).toUpperCase();
    const pendingKey = `${roleToReject}_PENDING`;

    if (!target.roles.includes(pendingKey)) {
      return NextResponse.json({ error: "Role is not pending for this user" }, { status: 400 });
    }

    const newRoles = target.roles.filter((r) => r !== pendingKey);
    const remainingApproved = newRoles.filter((r) => ["VOLUNTEER", "INSTRUCTOR", "ADMIN"].includes(r));
    const remainingPending = newRoles.filter((r) => r.endsWith("_PENDING"));

    // If no approved roles remain and no more pending: account fully rejected
    const allRejected = remainingApproved.length === 0 && remainingPending.length === 0;
    const finalRoles = allRejected
      ? [...newRoles.filter((r) => r.startsWith("LANG_")), "PENDING"]
      : newRoles;
    const newStatus = allRejected ? "SUSPENDED" : target.status;
    const newPrimaryRole = primaryRole(finalRoles);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await prisma.user.update({ where: { id: userId }, data: { roles: finalRoles, role: newPrimaryRole as any, status: newStatus } });

    await logActivity({
      actorId: admin.id,
      actorEmail: admin.email ?? undefined,
      actorName: admin.name ?? undefined,
      action: "ROLE_REMOVED",
      targetType: "User",
      targetId: userId,
      detail: `Rejected role ${roleToReject} for ${target.email} (onboarding)${allRejected ? " — all roles rejected, account suspended" : ""}`,
    });

    if (allRejected && target.email) {
      const { notifyRolesRejected } = await import("@/lib/notifications");
      await notifyRolesRejected({
        email: target.email,
        name: target.name ?? target.email,
        rejectedRoles: [roleToReject],
      }).catch(console.error);
    }

    return NextResponse.json({ ok: true, roles: finalRoles, allRejected });
  }

  // Handle addRole
  if (addRole) {
    if (!isAdmin && !isSuperAdmin) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
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
    if (!isAdmin && !isSuperAdmin) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
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
    if (!isAdmin && !isInstructor) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    const langCode = (body.addLanguage as string).toUpperCase();
    if (target.roles.includes(`LANG_${langCode}`) || target.roles.includes(`LANG_${langCode}_CLEARED`)) {
      return NextResponse.json({ error: "User already has this language" }, { status: 400 });
    }
    // If previously denied, reset to pending instead of erroring
    const newRoles = [
      ...target.roles.filter((r) => r !== `LANG_${langCode}_DENIED`),
      `LANG_${langCode}`,
    ];
    // Sync VolunteerProfile.languages so the volunteer's profile page reflects the change
    const vpAdd = await prisma.volunteerProfile.findUnique({ where: { userId: target.id } });
    await prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id: userId }, data: { roles: newRoles } });
      if (vpAdd) {
        if (!vpAdd.languages.includes(langCode)) {
          await tx.volunteerProfile.update({
            where: { id: vpAdd.id },
            data: { languages: [...vpAdd.languages, langCode] },
          });
        }
      } else {
        await tx.volunteerProfile.create({ data: { userId: target.id, languages: [langCode] } });
      }
    });
    return NextResponse.json({ ok: true, roles: newRoles });
  }

  // Handle removeLanguage
  if (body.removeLanguage) {
    if (!isAdmin && !isInstructor) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    const langCode = (body.removeLanguage as string).toUpperCase();
    const newRoles = target.roles.filter(
      (r) => r !== `LANG_${langCode}` && r !== `LANG_${langCode}_CLEARED` && r !== `LANG_${langCode}_DENIED`,
    );
    // Sync VolunteerProfile.languages so the language is removed from the volunteer's profile page
    const vpRemove = await prisma.volunteerProfile.findUnique({ where: { userId: target.id } });
    await prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id: userId }, data: { roles: newRoles } });
      if (vpRemove) {
        await tx.volunteerProfile.update({
          where: { id: vpRemove.id },
          data: { languages: vpRemove.languages.filter((l) => l !== langCode) },
        });
      }
    });
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

export async function DELETE(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const actor = await prisma.user.findUnique({ where: { email: session.user.email } });
  if (!actor || !actor.roles?.includes("DEV")) {
    return NextResponse.json({ error: "Only the developer account can delete users" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const userId = searchParams.get("userId");
  if (!userId) return NextResponse.json({ error: "userId required" }, { status: 400 });
  if (userId === actor.id) return NextResponse.json({ error: "You cannot delete your own account" }, { status: 400 });

  const target = await prisma.user.findUnique({
    where: { id: userId },
    include: { volunteer: { include: { signups: true, clearanceLogs: true, notifPrefs: true } } },
  });
  if (!target) return NextResponse.json({ error: "User not found" }, { status: 404 });

  const targetEmail = target.email;
  const targetName = target.name ?? target.email;

  await prisma.$transaction(async (tx) => {
    // Null out references this user created (preserve history without the link)
    await tx.trainingMaterial.updateMany({ where: { uploadedById: userId }, data: { uploadedById: null } });
    await tx.clearanceLog.updateMany({ where: { clearedById: userId }, data: { clearedById: null } });
    await tx.suggestion.updateMany({ where: { submittedById: userId }, data: { submittedById: null } });

    if (target.volunteer) {
      const vpId = target.volunteer.id;
      const signupIds = target.volunteer.signups.map((s) => s.id);

      // Delete feedback on this volunteer's signups
      if (signupIds.length > 0) {
        await tx.feedback.deleteMany({ where: { signupId: { in: signupIds } } });
      }
      await tx.subBlockSignup.deleteMany({ where: { volunteerId: vpId } });
      await tx.clearanceLog.deleteMany({ where: { volunteerId: vpId } });
      if (target.volunteer.notifPrefs) {
        await tx.volunteerNotifPrefs.delete({ where: { volunteerId: vpId } });
      }
      await tx.volunteerProfile.delete({ where: { id: vpId } });
    }

    // Account has onDelete: Cascade, but delete explicitly for clarity
    await tx.account.deleteMany({ where: { userId } });
    await tx.user.delete({ where: { id: userId } });
  });

  await logActivity({
    actorId: actor.id,
    actorEmail: actor.email ?? undefined,
    actorName: actor.name ?? undefined,
    action: "USER_STATUS_CHANGED",
    targetType: "User",
    targetId: userId,
    detail: `Permanently deleted user ${targetEmail} (${targetName})`,
  });

  return NextResponse.json({ ok: true });
}
