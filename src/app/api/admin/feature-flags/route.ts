import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

async function getSuperAdmin() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return null;
  const user = await prisma.user.findUnique({ where: { email: session.user.email } });
  if (!user || !user.roles?.includes("DEV")) return null;
  return user;
}

export async function GET() {
  const admin = await getSuperAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

  const flags = await prisma.featureFlag.findMany({
    orderBy: { key: "asc" },
  });

  return NextResponse.json(flags);
}

export async function PATCH(req: NextRequest) {
  const admin = await getSuperAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

  const body = await req.json();
  const { key, enabled } = body as { key: string; enabled: boolean };

  if (!key || typeof enabled !== "boolean") {
    return NextResponse.json({ error: "key and enabled are required" }, { status: 400 });
  }

  const flag = await prisma.featureFlag.upsert({
    where: { key },
    update: { enabled, updatedAt: new Date() },
    create: { key, label: key, enabled, updatedAt: new Date() },
  });

  return NextResponse.json(flag);
}
