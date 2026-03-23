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
  const updateData: Record<string, unknown> = {};
  if (body.language != null) updateData.language = body.language;
  if (body.date != null) updateData.date = new Date(body.date + "T12:00:00");
  if (body.startTime != null) updateData.startTime = Number(body.startTime);
  if (body.endTime != null) updateData.endTime = Number(body.endTime);
  if (body.interpreterCount != null) updateData.interpreterCount = Number(body.interpreterCount);
  if (body.notes !== undefined) updateData.notes = body.notes || null;

  const newStart = updateData.startTime != null ? (updateData.startTime as number) : slot.startTime;
  const newEnd = updateData.endTime != null ? (updateData.endTime as number) : slot.endTime;

  if (newEnd <= newStart) {
    return NextResponse.json({ error: "End time must be after start time" }, { status: 400 });
  }

  // Cancel signups outside the new time window
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
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getClinicUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

  const { id } = await params;
  const slot = await prisma.slot.findUnique({ where: { id } });
  if (!slot || slot.clinicId !== user.clinicId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await prisma.subBlockSignup.updateMany({
    where: { slotId: id, status: "ACTIVE" },
    data: { status: "CANCELLED", cancelledAt: new Date() },
  });

  await prisma.slot.update({ where: { id }, data: { status: "CANCELLED" } });

  return NextResponse.json({ ok: true });
}
