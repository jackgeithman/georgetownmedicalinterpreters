import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

async function getAdminUser() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return null;
  const user = await prisma.user.findUnique({ where: { email: session.user.email } });
  if (!user || user.role !== "ADMIN") return null;
  return user;
}

const NOTE_KEY = "main";

export async function GET() {
  const admin = await getAdminUser();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

  const note = await prisma.adminNote.findUnique({ where: { key: NOTE_KEY } });
  return NextResponse.json({ content: note?.content ?? "", updatedBy: note?.updatedBy ?? null, updatedAt: note?.updatedAt ?? null });
}

export async function PATCH(req: NextRequest) {
  const admin = await getAdminUser();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

  const { content } = await req.json();
  if (typeof content !== "string") return NextResponse.json({ error: "content required" }, { status: 400 });

  const note = await prisma.adminNote.upsert({
    where: { key: NOTE_KEY },
    create: { key: NOTE_KEY, content, updatedBy: admin.email },
    update: { content, updatedBy: admin.email },
  });

  return NextResponse.json({ content: note.content, updatedBy: note.updatedBy, updatedAt: note.updatedAt });
}
