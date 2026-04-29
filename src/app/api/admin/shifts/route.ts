import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { logActivity } from "@/lib/activity-log";
import { createShiftCalEvent } from "@/lib/notifications/gcal";

async function getAdmin() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return null;
  const user = await prisma.user.findUnique({ where: { email: session.user.email } });
  if (!user || (user.role !== "ADMIN" && !user.roles.includes("DEV"))) return null;
  return user;
}

export async function GET() {
  const admin = await getAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const shifts = await prisma.shift.findMany({
    where: { status: "ACTIVE", date: { gte: thirtyDaysAgo } },
    orderBy: { date: "asc" },
    include: {
      clinic: { select: { id: true, name: true, address: true } },
      postedBy: { select: { name: true, email: true } },
      positions: {
        orderBy: { positionNumber: "asc" },
        include: {
          volunteer: {
            include: { user: { select: { name: true, email: true } } },
          },
        },
      },
    },
  });

  return NextResponse.json(shifts);
}

export async function POST(req: NextRequest) {
  const admin = await getAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

  const body = await req.json();
  const { clinicId, date, volunteerStart, volunteerEnd, travelMinutes, keyRetrievalTime, keyReturnTime, languagesNeeded, notes } = body;

  // Basic validation
  if (!clinicId || !date || volunteerStart == null || volunteerEnd == null || !Array.isArray(languagesNeeded) || languagesNeeded.length === 0) {
    return NextResponse.json({ error: "clinicId, date, volunteerStart, volunteerEnd, and at least one language are required" }, { status: 400 });
  }
  if (Number(volunteerEnd) <= Number(volunteerStart)) {
    return NextResponse.json({ error: "Volunteer end time must be after start time" }, { status: 400 });
  }

  const clinic = await prisma.clinic.findUnique({ where: { id: clinicId } });
  if (!clinic) return NextResponse.json({ error: "Clinic not found" }, { status: 404 });

  // Date validation
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const shiftDate = new Date(date + "T12:00:00");
  if (shiftDate < today) {
    return NextResponse.json({ error: "Cannot create a shift in the past" }, { status: 400 });
  }

  const resolvedTravel = travelMinutes != null ? Number(travelMinutes) : clinic.travelMinutes;

  // Create shift + positions in a transaction
  const shift = await prisma.$transaction(async (tx) => {
    const newShift = await tx.shift.create({
      data: {
        clinicId,
        date: shiftDate,
        volunteerStart: Number(volunteerStart),
        volunteerEnd: Number(volunteerEnd),
        travelMinutes: resolvedTravel,
        keyRetrievalTime: keyRetrievalTime != null ? Number(keyRetrievalTime) : null,
        keyReturnTime: keyReturnTime != null ? Number(keyReturnTime) : null,
        languagesNeeded,
        notes: notes || null,
        postedById: admin.id,
      },
    });

    // Create N positions. Position 1 = driver (OPEN). Positions 2+ = LOCKED (no language yet).
    await tx.shiftPosition.createMany({
      data: languagesNeeded.map((_: string, i: number) => ({
        shiftId: newShift.id,
        positionNumber: i + 1,
        isDriver: i === 0,
        languageCode: null,       // language assigned dynamically when driver fills seat 1
        status: i === 0 ? "OPEN" : "LOCKED",
      })),
    });

    return newShift;
  });

  // Create GCal event for this shift (non-blocking)
  await createShiftCalEvent(shift.id, {
    date: shiftDate,
    volunteerStart: Number(volunteerStart),
    volunteerEnd: Number(volunteerEnd),
    travelMinutes: resolvedTravel,
    keyRetrievalTime: keyRetrievalTime != null ? Number(keyRetrievalTime) : null,
    keyReturnTime: keyReturnTime != null ? Number(keyReturnTime) : null,
    clinicName: clinic.name,
    clinicAddress: clinic.address,
    notes: notes || null,
    languagesNeeded,
  }).catch(console.error);

  await logActivity({
    actorId: admin.id,
    actorEmail: admin.email ?? undefined,
    actorName: admin.name ?? undefined,
    action: "SHIFT_CREATED",
    targetType: "Shift",
    targetId: shift.id,
    detail: `Created shift for ${clinic.name} on ${date} — ${languagesNeeded.join(", ")}`,
  });

  const created = await prisma.shift.findUnique({
    where: { id: shift.id },
    include: {
      clinic: { select: { id: true, name: true, address: true } },
      positions: { orderBy: { positionNumber: "asc" } },
    },
  });

  return NextResponse.json(created, { status: 201 });
}
