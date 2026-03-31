import { NextResponse } from "next/server";
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

  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const events = await prisma.clearanceLog.findMany({
    where: {
      volunteerId: user.volunteer.id,
      createdAt: { gte: since },
      languageCode: { not: null },
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
