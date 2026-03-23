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
  const { language, date, startTime, endTime, interpreterCount, notes, isRecurring, recurrenceEndDate } = body;

  if (!language || !date || startTime == null || endTime == null || !interpreterCount) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }
  if (Number(endTime) <= Number(startTime)) {
    return NextResponse.json({ error: "End time must be after start time" }, { status: 400 });
  }

  const commonData = {
    clinicId: user.clinicId!,
    language,
    startTime: Number(startTime),
    endTime: Number(endTime),
    interpreterCount: Number(interpreterCount),
    notes: notes || null,
  };

  if (isRecurring && recurrenceEndDate) {
    const endDate = new Date(recurrenceEndDate + "T12:00:00");
    const recurrenceGroupId = crypto.randomUUID();

    // Build weekly dates from start through end
    const dates: Date[] = [];
    const current = new Date(date + "T12:00:00");
    while (current <= endDate) {
      dates.push(new Date(current));
      current.setDate(current.getDate() + 7);
    }

    if (dates.length === 0) {
      return NextResponse.json({ error: "Recurrence end date must be on or after start date" }, { status: 400 });
    }

    await prisma.slot.createMany({
      data: dates.map((d) => ({
        ...commonData,
        date: d,
        isRecurring: true,
        recurrenceGroupId,
      })),
    });

    return NextResponse.json({ count: dates.length }, { status: 201 });
  }

  const slot = await prisma.slot.create({
    data: { ...commonData, date: new Date(date + "T12:00:00") },
  });

  return NextResponse.json(slot, { status: 201 });
}
