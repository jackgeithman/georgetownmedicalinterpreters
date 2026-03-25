import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

async function getSuperAdmin() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return null;
  const user = await prisma.user.findUnique({ where: { email: session.user.email } });
  if (!user || user.role !== "SUPER_ADMIN") return null;
  return user;
}

// GET /api/admin/email-rules — list all rules
export async function GET() {
  const admin = await getSuperAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  const rules = await prisma.emailRule.findMany({ orderBy: { createdAt: "desc" } });
  return NextResponse.json(rules);
}

// POST /api/admin/email-rules — create a rule
export async function POST(req: NextRequest) {
  const admin = await getSuperAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

  const { email, type, note } = await req.json();
  if (!email || !["ALLOW", "BLOCK"].includes(type)) {
    return NextResponse.json({ error: "email and type (ALLOW|BLOCK) required" }, { status: 400 });
  }

  const rule = await prisma.emailRule.upsert({
    where: { email: email.trim().toLowerCase() },
    update: { type, note: note ?? null },
    create: { email: email.trim().toLowerCase(), type, note: note ?? null },
  });

  return NextResponse.json(rule, { status: 201 });
}
