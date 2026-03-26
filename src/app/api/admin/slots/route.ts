import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

async function getAdmin() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return null;
  const user = await prisma.user.findUnique({ where: { email: session.user.email } });
  if (!user || (user.role !== "ADMIN" && user.role !== "SUPER_ADMIN")) return null;
  return user;
}

export async function GET() {
  const admin = await getAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const slots = await prisma.slot.findMany({
    where: { status: "ACTIVE", date: { gte: thirtyDaysAgo } },
    orderBy: { date: "asc" },
    include: {
      clinic: { select: { name: true, address: true } },
      createdByAdmin: { select: { name: true, email: true } },
      signups: {
        where: { status: "ACTIVE" },
        include: {
          volunteer: {
            include: { user: { select: { name: true, email: true } } },
          },
        },
      },
    },
  });

  return NextResponse.json(slots);
}

export async function POST(req: NextRequest) {
  const admin = await getAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

  const body = await req.json();
  const { clinicId, language, date, startTime, endTime, interpreterCount, notes, isRecurring, recurrenceEndDate } = body;

  if (!clinicId || !language || !date || startTime == null || endTime == null || !interpreterCount) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }
  if (Number(endTime) <= Number(startTime)) {
    return NextResponse.json({ error: "End time must be after start time" }, { status: 400 });
  }

  // Date validation
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const slotDate = new Date(date + "T12:00:00");
  if (slotDate < today) {
    return NextResponse.json({ error: "Cannot create a slot in the past." }, { status: 400 });
  }
  const oneYearFromNow = new Date();
  oneYearFromNow.setFullYear(oneYearFromNow.getFullYear() + 1);
  if (slotDate > oneYearFromNow) {
    return NextResponse.json({ error: "Cannot create a slot more than 1 year in the future." }, { status: 400 });
  }

  // Verify clinic exists
  const clinic = await prisma.clinic.findUnique({ where: { id: clinicId } });
  if (!clinic) return NextResponse.json({ error: "Clinic not found" }, { status: 404 });

  // Enforce 100-slot limit per clinic
  const existingCount = await prisma.slot.count({
    where: { clinicId, status: "ACTIVE" },
  });

  const commonData = {
    clinicId,
    language,
    startTime: Number(startTime),
    endTime: Number(endTime),
    interpreterCount: Number(interpreterCount),
    notes: notes || null,
    createdByAdminId: admin.id,
  };

  if (isRecurring && recurrenceEndDate) {
    const endDate = new Date(recurrenceEndDate + "T12:00:00");
    const recurrenceGroupId = crypto.randomUUID();
    const dates: Date[] = [];
    const current = new Date(date + "T12:00:00");
    while (current <= endDate) {
      dates.push(new Date(current));
      current.setDate(current.getDate() + 7);
    }
    if (dates.length === 0) {
      return NextResponse.json({ error: "Recurrence end date must be on or after start date" }, { status: 400 });
    }
    if (existingCount + dates.length > 100) {
      return NextResponse.json(
        { error: `Adding ${dates.length} recurring slots would exceed the 100-slot limit. This clinic currently has ${existingCount} active slots.` },
        { status: 400 }
      );
    }
    await prisma.slot.createMany({
      data: dates.map((d) => ({ ...commonData, date: d, isRecurring: true, recurrenceGroupId })),
    });
    return NextResponse.json({ count: dates.length }, { status: 201 });
  }

  if (existingCount >= 100) {
    return NextResponse.json({ error: "This clinic has reached the maximum of 100 active slots." }, { status: 400 });
  }

  const slot = await prisma.slot.create({
    data: { ...commonData, date: new Date(date + "T12:00:00") },
  });
  return NextResponse.json(slot, { status: 201 });
}
