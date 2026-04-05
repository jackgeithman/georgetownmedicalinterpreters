import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

  const user = await prisma.user.findUnique({
    where: { email: session.user.email },
    include: { volunteer: true },
  });
  if (!user?.volunteer) return NextResponse.json([]);

  const events = await prisma.clearanceLog.findMany({
    where: {
      volunteerId: user.volunteer.id,
      languageCode: { not: null },
      notifiedAt: null,
    },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      languageCode: true,
      isCleared: true,
      createdAt: true,
    },
  });

  return NextResponse.json(events);
}

export async function PATCH(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

  const user = await prisma.user.findUnique({
    where: { email: session.user.email },
    include: { volunteer: true },
  });
  if (!user?.volunteer) return NextResponse.json({ error: "No volunteer profile" }, { status: 400 });

  const { ids } = await req.json() as { ids: string[] };
  if (!Array.isArray(ids) || ids.length === 0) return NextResponse.json({ ok: true });

  await prisma.clearanceLog.updateMany({
    where: { id: { in: ids }, volunteerId: user.volunteer.id },
    data: { notifiedAt: new Date() },
  });

  return NextResponse.json({ ok: true });
}
