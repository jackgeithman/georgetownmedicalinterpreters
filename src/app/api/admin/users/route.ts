import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

async function getAdmin() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return null;
  const user = await prisma.user.findUnique({ where: { email: session.user.email } });
  if (!user || user.role !== "ADMIN") return null;
  return user;
}

export async function GET() {
  const admin = await getAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

  const users = await prisma.user.findMany({
    orderBy: { createdAt: "desc" },
    include: { clinic: { select: { name: true } } },
  });

  return NextResponse.json(users);
}

export async function PATCH(req: NextRequest) {
  const admin = await getAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

  const body = await req.json();
  const { userId, ...data } = body;

  if (!userId) return NextResponse.json({ error: "userId required" }, { status: 400 });

  // Don't allow modifying other admins
  const target = await prisma.user.findUnique({ where: { id: userId } });
  if (!target) return NextResponse.json({ error: "User not found" }, { status: 404 });
  if (target.role === "ADMIN" && target.id !== admin.id) {
    return NextResponse.json({ error: "Cannot modify other admins" }, { status: 403 });
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
