import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

async function getClinicUser() {
  const session = await getServerSession(authOptions);
  if (session?.user?.role !== "CLINIC" || !session.user.clinicId) return null;
  return { clinicId: session.user.clinicId };
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getClinicUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

  const { id } = await params;
  const slot = await prisma.slot.findUnique({ where: { id } });
  if (!slot || slot.clinicId !== user.clinicId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const body = await req.json();
  // editScope: "single" | "this_and_future" — defaults to "single"
  const { editScope = "single", ...fields } = body;

  const updateData: Record<string, unknown> = {};
  if (fields.language != null) updateData.language = fields.language;
  if (fields.date != null) updateData.date = new Date(fields.date + "T12:00:00");
  if (fields.startTime != null) updateData.startTime = Number(fields.startTime);
  if (fields.endTime != null) updateData.endTime = Number(fields.endTime);
  if (fields.interpreterCount != null) updateData.interpreterCount = Number(fields.interpreterCount);
  if (fields.notes !== undefined) updateData.notes = fields.notes || null;

  const newStart = updateData.startTime != null ? (updateData.startTime as number) : slot.startTime;
  const newEnd = updateData.endTime != null ? (updateData.endTime as number) : slot.endTime;

  if (newEnd <= newStart) {
    return NextResponse.json({ error: "End time must be after start time" }, { status: 400 });
  }

  if (editScope === "this_and_future" && slot.recurrenceGroupId) {
    // Find all future slots in the same group (including this one)
    const futureSlots = await prisma.slot.findMany({
      where: {
        recurrenceGroupId: slot.recurrenceGroupId,
        status: "ACTIVE",
        date: { gte: slot.date },
      },
      select: { id: true },
    });
    const futureIds = futureSlots.map((s) => s.id);

    // Cancel signups outside the new time window across all affected slots
    const { count: cancelledCount } = await prisma.subBlockSignup.updateMany({
      where: {
        slotId: { in: futureIds },
        status: "ACTIVE",
        OR: [{ subBlockHour: { lt: newStart } }, { subBlockHour: { gte: newEnd } }],
      },
      data: { status: "CANCELLED", cancelledAt: new Date() },
    });

    await prisma.slot.updateMany({
      where: { id: { in: futureIds } },
      data: updateData,
    });

    return NextResponse.json({ updatedCount: futureIds.length, cancelledCount });
  }

  // Single slot edit
  const { count: cancelledCount } = await prisma.subBlockSignup.updateMany({
    where: {
      slotId: id,
      status: "ACTIVE",
      OR: [{ subBlockHour: { lt: newStart } }, { subBlockHour: { gte: newEnd } }],
    },
    data: { status: "CANCELLED", cancelledAt: new Date() },
  });

  const updated = await prisma.slot.update({ where: { id }, data: updateData });

  return NextResponse.json({ slot: updated, cancelledCount });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getClinicUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

  const { id } = await params;
  const slot = await prisma.slot.findUnique({ where: { id } });
  if (!slot || slot.clinicId !== user.clinicId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // deleteScope: "single" | "this_and_future" — read from query param or body
  const url = new URL(req.url);
  const deleteScope = url.searchParams.get("deleteScope") ?? "single";

  if (deleteScope === "this_and_future" && slot.recurrenceGroupId) {
    const futureSlots = await prisma.slot.findMany({
      where: {
        recurrenceGroupId: slot.recurrenceGroupId,
        status: "ACTIVE",
        date: { gte: slot.date },
      },
      select: { id: true },
    });
    const futureIds = futureSlots.map((s) => s.id);

    await prisma.subBlockSignup.updateMany({
      where: { slotId: { in: futureIds }, status: "ACTIVE" },
      data: { status: "CANCELLED", cancelledAt: new Date() },
    });

    await prisma.slot.updateMany({
      where: { id: { in: futureIds } },
      data: { status: "CANCELLED" },
    });

    return NextResponse.json({ cancelledCount: futureIds.length });
  }

  // Single delete
  await prisma.subBlockSignup.updateMany({
    where: { slotId: id, status: "ACTIVE" },
    data: { status: "CANCELLED", cancelledAt: new Date() },
  });

  await prisma.slot.update({ where: { id }, data: { status: "CANCELLED" } });

  return NextResponse.json({ ok: true });
}
