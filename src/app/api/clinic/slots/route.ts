import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

async function getClinicUser() {
  const session = await getServerSession(authOptions);
  if (session?.user?.role !== "CLINIC" || !session.user.clinicId) return null;
  return { clinicId: session.user.clinicId };
}

export async function GET() {
  const user = await getClinicUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

  const slots = await prisma.slot.findMany({
    where: { clinicId: user.clinicId! },
    orderBy: { date: "asc" },
    include: {
      signups: {
        where: { status: { in: ["ACTIVE", "NO_SHOW", "COMPLETED"] } },
        include: {
          volunteer: {
            include: { user: { select: { name: true, email: true } } },
          },
        },
        orderBy: { subBlockHour: "asc" },
      },
    },
  });

  return NextResponse.json(slots);
}

export async function POST(req: NextRequest) {
  const user = await getClinicUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

  const body = await req.json();
  const { language, date, startTime, endTime, interpreterCount, notes } = body;

  if (!language || !date || startTime == null || endTime == null || !interpreterCount) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }
  if (Number(endTime) <= Number(startTime)) {
    return NextResponse.json({ error: "End time must be after start time" }, { status: 400 });
  }

  const slot = await prisma.slot.create({
    data: {
      clinicId: user.clinicId!,
      language,
      date: new Date(date),
      startTime: Number(startTime),
      endTime: Number(endTime),
      interpreterCount: Number(interpreterCount),
      notes: notes || null,
    },
  });

  return NextResponse.json(slot, { status: 201 });
}
