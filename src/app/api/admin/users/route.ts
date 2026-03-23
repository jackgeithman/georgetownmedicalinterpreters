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

  const updateData: Record<string, string | null> = {};
  if (data.status) updateData.status = data.status;
  if (data.role) updateData.role = data.role;
  if (data.clinicId !== undefined) updateData.clinicId = data.clinicId;

  const updated = await prisma.user.update({
    where: { id: userId },
    data: updateData,
  });

  return NextResponse.json(updated);
}
