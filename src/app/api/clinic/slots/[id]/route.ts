import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { sendSlotCancelledNotice, sendSlotEditedNotice } from "@/lib/email";

async function getClinicUser() {
  const session = await getServerSession(authOptions);
  if (session?.user?.role !== "CLINIC" || !session.user.clinicId) return null;
  return { clinicId: session.user.clinicId };
}

type AffectedSignup = {
  id: string;
  subBlockHour: number;
  slot: { date: Date; clinic: { name: string } };
  volunteer: { user: { email: string | null; name: string | null } };
};

async function notifyAffectedSignups(signups: AffectedSignup[], type: "edited" | "cancelled") {
  for (const s of signups) {
    const email = s.volunteer.user.email;
    if (!email) continue;
    const opts = {
      to: email,
      volunteerName: s.volunteer.user.name ?? "Volunteer",
      clinicName: s.slot.clinic.name,
      date: s.slot.date,
      subBlockHour: s.subBlockHour,
    };
    try {
      if (type === "cancelled") await sendSlotCancelledNotice(opts);
      else await sendSlotEditedNotice(opts);
    } catch {/* non-fatal */}
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getClinicUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

  const { id } = await params;
  const slot = await prisma.slot.findUnique({
    where: { id },
    include: { clinic: true },
  });
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

  // If language or date changed, ALL active signups must be cancelled
  const languageChanged = updateData.language != null && updateData.language !== slot.language;
  const dateChanged =
    updateData.date != null &&
    (updateData.date as Date).toDateString() !== slot.date.toDateString();
  const cancelAll = languageChanged || dateChanged;

  if (editScope === "this_and_future" && slot.recurrenceGroupId) {
    const futureSlots = await prisma.slot.findMany({
      where: { recurrenceGroupId: slot.recurrenceGroupId, status: "ACTIVE", date: { gte: slot.date } },
      include: { clinic: true },
    });
    const futureIds = futureSlots.map((s) => s.id);

    // Collect affected signups before cancelling
    const affected = await prisma.subBlockSignup.findMany({
      where: {
        slotId: { in: futureIds },
        status: "ACTIVE",
        ...(cancelAll ? {} : { OR: [{ subBlockHour: { lt: newStart } }, { subBlockHour: { gte: newEnd } }] }),
      },
      include: {
        slot: { include: { clinic: true } },
        volunteer: { include: { user: true } },
      },
    });

    await prisma.subBlockSignup.updateMany({
      where: {
        slotId: { in: futureIds },
        status: "ACTIVE",
        ...(cancelAll ? {} : { OR: [{ subBlockHour: { lt: newStart } }, { subBlockHour: { gte: newEnd } }] }),
      },
      data: { status: "CANCELLED", cancelledAt: new Date() },
    });

    await prisma.slot.updateMany({ where: { id: { in: futureIds } }, data: updateData });

    await notifyAffectedSignups(affected, "edited").catch(() => {/* non-fatal */});

    return NextResponse.json({ updatedCount: futureIds.length });
  }

  // Single slot edit — collect affected signups before cancelling
  const affected = await prisma.subBlockSignup.findMany({
    where: {
      slotId: id,
      status: "ACTIVE",
      ...(cancelAll ? {} : { OR: [{ subBlockHour: { lt: newStart } }, { subBlockHour: { gte: newEnd } }] }),
    },
    include: {
      slot: { include: { clinic: true } },
      volunteer: { include: { user: true } },
    },
  });

  await prisma.subBlockSignup.updateMany({
    where: {
      slotId: id,
      status: "ACTIVE",
      ...(cancelAll ? {} : { OR: [{ subBlockHour: { lt: newStart } }, { subBlockHour: { gte: newEnd } }] }),
    },
    data: { status: "CANCELLED", cancelledAt: new Date() },
  });

  const updated = await prisma.slot.update({ where: { id }, data: updateData });

  await notifyAffectedSignups(affected, "edited").catch(() => {/* non-fatal */});

  return NextResponse.json({ slot: updated });
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
      where: { recurrenceGroupId: slot.recurrenceGroupId, status: "ACTIVE", date: { gte: slot.date } },
      select: { id: true },
    });
    const futureIds = futureSlots.map((s) => s.id);

    const affected = await prisma.subBlockSignup.findMany({
      where: { slotId: { in: futureIds }, status: "ACTIVE" },
      include: {
        slot: { include: { clinic: true } },
        volunteer: { include: { user: true } },
      },
    });

    await prisma.subBlockSignup.updateMany({
      where: { slotId: { in: futureIds }, status: "ACTIVE" },
      data: { status: "CANCELLED", cancelledAt: new Date() },
    });

    await prisma.slot.updateMany({
      where: { id: { in: futureIds } },
      data: { status: "CANCELLED" },
    });

    await notifyAffectedSignups(affected, "cancelled").catch(() => {/* non-fatal */});

    return NextResponse.json({ cancelledCount: futureIds.length });
  }

  // Single delete
  const affected = await prisma.subBlockSignup.findMany({
    where: { slotId: id, status: "ACTIVE" },
    include: {
      slot: { include: { clinic: true } },
      volunteer: { include: { user: true } },
    },
  });

  await prisma.subBlockSignup.updateMany({
    where: { slotId: id, status: "ACTIVE" },
    data: { status: "CANCELLED", cancelledAt: new Date() },
  });

  await prisma.slot.update({ where: { id }, data: { status: "CANCELLED" } });

  await notifyAffectedSignups(affected, "cancelled").catch(() => {/* non-fatal */});

  return NextResponse.json({ ok: true });
}
