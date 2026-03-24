import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";

async function getActiveVolunteer() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return null;
  const user = await prisma.user.findUnique({
    where: { email: session.user.email },
    include: { volunteer: true },
  });
  const isVolunteerRole = user.role === "VOLUNTEER" || user.role === "ADMIN" || user.role === "SUPER_ADMIN";
  if (!user || !isVolunteerRole || user.status !== "ACTIVE") return null;
  return user;
}

export async function GET(req: NextRequest) {
  const user = await getActiveVolunteer();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

  const { searchParams } = req.nextUrl;
  const language = searchParams.get("language");
  const dateParam = searchParams.get("date");

  const today = new Date();
  today.setHours(0, 0, 0, 0); // local midnight — slots stored at noon so this correctly includes today

  const where: Prisma.SlotWhereInput = { status: "ACTIVE" };

  if (dateParam) {
    const d = new Date(dateParam);
    const next = new Date(d);
    next.setDate(next.getDate() + 1);
    where.date = { gte: d, lt: next };
  } else {
    where.date = { gte: today };
  }

  if (language && ["ES", "ZH", "KO", "AR"].includes(language)) {
    where.language = language as Prisma.EnumLanguageFilter["equals"];
  }

  const slots = await prisma.slot.findMany({
    where,
    orderBy: { date: "asc" },
    include: {
      clinic: { select: { name: true, address: true } },
      signups: {
        where: { status: "ACTIVE" },
        select: { subBlockHour: true, volunteerId: true },
      },
    },
  });

  return NextResponse.json(slots);
}
