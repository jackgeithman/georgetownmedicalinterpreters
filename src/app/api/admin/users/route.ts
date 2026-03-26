import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { notifyUserApproved, notifyUserSuspended } from "@/lib/notifications";

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

  return NextResponse.json(users);
}

export async function PATCH(req: NextRequest) {
  const admin = await getAdminUser();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

  const body = await req.json();
  const { userId, ...data } = body;

  if (!userId) return NextResponse.json({ error: "userId required" }, { status: 400 });

  const target = await prisma.user.findUnique({ where: { id: userId } });
  if (!target) return NextResponse.json({ error: "User not found" }, { status: 404 });

  // Nobody can modify a SUPER_ADMIN (including other super admins via the UI)
  if (target.role === "SUPER_ADMIN") {
    return NextResponse.json({ error: "Cannot modify the super admin account" }, { status: 403 });
  }

  // Only SUPER_ADMIN can promote someone to ADMIN
  if (data.role === "ADMIN" && admin.role !== "SUPER_ADMIN") {
    return NextResponse.json({ error: "Only the super admin can promote users to Admin" }, { status: 403 });
  }

  // ADMIN cannot modify other ADMINs (only SUPER_ADMIN can)
  if (target.role === "ADMIN" && admin.role !== "SUPER_ADMIN") {
    return NextResponse.json({ error: "Only the super admin can modify Admin accounts" }, { status: 403 });
  }

  // Handle volunteer clearance separately (updates VolunteerProfile + creates audit log)
  if (typeof data.isCleared === "boolean") {
    const volunteerProfile = await prisma.volunteerProfile.findUnique({
      where: { userId: target.id },
    });
    if (!volunteerProfile) {
      return NextResponse.json({ error: "User has no volunteer profile" }, { status: 400 });
    }
    await prisma.$transaction([
      prisma.volunteerProfile.update({
        where: { userId: target.id },
        data: { isCleared: data.isCleared, clearedById: admin.id, clearedAt: new Date() },
      }),
      prisma.clearanceLog.create({
        data: {
          volunteerId: volunteerProfile.id,
          clearedById: admin.id,
          isCleared: data.isCleared,
          note: data.note ?? null,
        },
      }),
    ]);
    return NextResponse.json({ ok: true });
  }

  const updateData: Record<string, string | null> = {};
  if (data.status) updateData.status = data.status;
  if (data.role) updateData.role = data.role;
  if (data.clinicId !== undefined) updateData.clinicId = data.clinicId;

  const updated = await prisma.user.update({
    where: { id: userId },
    data: updateData,
  });

  // Send status-change notifications — only for Google-authenticated users (volunteers/admins)
  if (target.email && data.status) {
    const wasApproved =
      target.status === "PENDING_APPROVAL" &&
      data.status === "ACTIVE";
    const wasSuspended =
      target.status !== "SUSPENDED" &&
      data.status === "SUSPENDED";

    if (wasApproved) {
      await notifyUserApproved({
        email: target.email,
        name: target.name ?? target.email,
        role: updated.role,
      }).catch(console.error);
    } else if (wasSuspended) {
      await notifyUserSuspended({
        email: target.email,
        name: target.name ?? target.email,
      }).catch(console.error);
    }
  }

  return NextResponse.json(updated);
}
