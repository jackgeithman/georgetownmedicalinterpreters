import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

async function getAuthorizedUser(minRole: "instructor" | "admin") {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return null;
  const user = await prisma.user.findUnique({ where: { email: session.user.email } });
  if (!user) return null;
  if (minRole === "instructor") {
    if (user.role !== "ADMIN" && user.role !== "SUPER_ADMIN" && user.role !== "INSTRUCTOR") return null;
  } else {
    if (user.role !== "ADMIN" && user.role !== "SUPER_ADMIN") return null;
  }
  return user;
}

export async function GET() {
  const user = await getAuthorizedUser("instructor");
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

  const languages = await prisma.languageConfig.findMany({
    orderBy: { name: "asc" },
  });

  return NextResponse.json(languages);
}

export async function POST(req: NextRequest) {
  const user = await getAuthorizedUser("admin");
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

  const body = await req.json();
  const { code, name } = body as { code: string; name: string };

  if (!code || !/^[A-Z]{2,4}$/.test(code)) {
    return NextResponse.json({ error: "Code must be 2–4 uppercase letters (e.g. ES, ZH, KOR)" }, { status: 400 });
  }
  if (!name || !name.trim()) {
    return NextResponse.json({ error: "Name is required" }, { status: 400 });
  }

  const existing = await prisma.languageConfig.findUnique({ where: { code } });
  if (existing) {
    return NextResponse.json({ error: "Language code already exists" }, { status: 409 });
  }

  const lang = await prisma.languageConfig.create({
    data: { code, name: name.trim() },
  });

  return NextResponse.json(lang, { status: 201 });
}
