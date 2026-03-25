import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { notifySlotUpdated, notifySlotCancelled, type AffectedSignup } from "@/lib/notifications";

async function getClinicUser() {
  const session = await getServerSession(authOptions);
  if (session?.user?.role !== "CLINIC" || !session.user.clinicId) return null;
  return { clinicId: session.user.clinicId };
}

/** Fetches active signups for the given slot IDs, including volunteer email/name. */
async function fetchActiveSignups(slotIds: string[]) {
  return prisma.subBlockSignup.findMany({
    where: { slotId: { in: slotIds }, status: "ACTIVE" },
    include: {
      volunteer: { include: { user: { select: { email: true, name: true } } } },
      slot: { select: { date: true } },
    },
  });
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
  const newDate = updateData.date ? (updateData.date as Date) : undefined;
  const newLanguage = (updateData.language as string | undefined) ?? slot.language;
  const newNotes = updateData.notes !== undefined ? (updateData.notes as string | null) : slot.notes;

  if (newEnd <= newStart) {
    return NextResponse.json({ error: "End time must be after start time" }, { status: 400 });
  }

  if (editScope === "this_and_future" && slot.recurrenceGroupId) {
    const futureSlots = await prisma.slot.findMany({
      where: {
        recurrenceGroupId: slot.recurrenceGroupId,
        status: "ACTIVE",
        date: { gte: slot.date },
      },
      select: { id: true },
    });
    const futureIds = futureSlots.map((s) => s.id);

    // Snapshot affected signups before mutation
    const allSignups = await fetchActiveSignups(futureIds);
    const toCancel: AffectedSignup[] = [];
    const toUpdate: AffectedSignup[] = [];

    for (const s of allSignups) {
      const entry: AffectedSignup = {
        signupId: s.id,
        volunteerEmail: s.volunteer.user.email,
        volunteerName: s.volunteer.user.name ?? s.volunteer.user.email,
        subBlockHour: s.subBlockHour,
      };
      if (s.subBlockHour < newStart || s.subBlockHour >= newEnd) {
        toCancel.push(entry);
      } else {
        toUpdate.push(entry);
      }
    }

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

    // Build per-slot date map for updated signups (use newDate if set, else each slot's own date)
    const slotDateMap = new Map(
      await prisma.slot.findMany({ where: { id: { in: futureIds } }, select: { id: true, date: true } })
        .then((rows) => rows.map((r) => [r.id, r.date] as [string, Date]))
    );

    // For notification purposes, each updated signup uses its slot's (now-updated) date
    const updatedWithDates = toUpdate.map((s) => {
      const origSignup = allSignups.find((a) => a.id === s.signupId);
      const slotId = origSignup?.slotId ?? "";
      return {
        ...s,
        slotDate: newDate ?? slotDateMap.get(slotId) ?? slot.date,
      };
    });

    await notifySlotUpdated({
      cancelledSignups: toCancel,
      updatedSignups: updatedWithDates.map(({ slotDate, ...rest }) => rest),
      clinicName: slot.clinic.name,
      clinicAddress: slot.clinic.address,
      language: newLanguage,
      date: slot.date,
      newDate: newDate,
      notes: newNotes,
    }).catch(console.error);

    return NextResponse.json({ updatedCount: futureIds.length, cancelledCount });
  }

  // ── Single slot edit ──────────────────────────────────────────────────────

  // Snapshot before mutation
  const allSignups = await fetchActiveSignups([id]);
  const toCancel: AffectedSignup[] = [];
  const toUpdate: AffectedSignup[] = [];

  for (const s of allSignups) {
    const entry: AffectedSignup = {
      signupId: s.id,
      volunteerEmail: s.volunteer.user.email,
      volunteerName: s.volunteer.user.name ?? s.volunteer.user.email,
      subBlockHour: s.subBlockHour,
    };
    if (s.subBlockHour < newStart || s.subBlockHour >= newEnd) {
      toCancel.push(entry);
    } else {
      toUpdate.push(entry);
    }
  }

  const { count: cancelledCount } = await prisma.subBlockSignup.updateMany({
    where: {
      slotId: id,
      status: "ACTIVE",
      OR: [{ subBlockHour: { lt: newStart } }, { subBlockHour: { gte: newEnd } }],
    },
    data: { status: "CANCELLED", cancelledAt: new Date() },
  });

  const updated = await prisma.slot.update({ where: { id }, data: updateData });

  await notifySlotUpdated({
    cancelledSignups: toCancel,
    updatedSignups: toUpdate,
    clinicName: slot.clinic.name,
    clinicAddress: slot.clinic.address,
    language: newLanguage,
    date: slot.date,
    newDate: newDate,
    notes: newNotes,
  }).catch(console.error);

  return NextResponse.json({ slot: updated, cancelledCount });
}

export async function DELETE(
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
      select: { id: true, date: true, language: true },
    });
    const futureIds = futureSlots.map((s) => s.id);

    // Snapshot signups before cancelling, grouped by slot for correct dates
    const allSignups = await fetchActiveSignups(futureIds);
    const slotDateMap = new Map(futureSlots.map((s) => [s.id, s.date]));

    await prisma.subBlockSignup.updateMany({
      where: { slotId: { in: futureIds }, status: "ACTIVE" },
      data: { status: "CANCELLED", cancelledAt: new Date() },
    });

    await prisma.slot.updateMany({
      where: { id: { in: futureIds } },
      data: { status: "CANCELLED" },
    });

    // Group signups by slot date so volunteers get per-slot notifications
    const bySlot = new Map<string, AffectedSignup[]>();
    for (const s of allSignups) {
      if (!bySlot.has(s.slotId)) bySlot.set(s.slotId, []);
      bySlot.get(s.slotId)!.push({
        signupId: s.id,
        volunteerEmail: s.volunteer.user.email,
        volunteerName: s.volunteer.user.name ?? s.volunteer.user.email,
        subBlockHour: s.subBlockHour,
      });
    }

    await Promise.all(
      [...bySlot.entries()].map(([slotId, affected]) =>
        notifySlotCancelled({
          affectedSignups: affected,
          clinicName: slot.clinic.name,
          language: slot.language,
          date: slotDateMap.get(slotId) ?? slot.date,
        }).catch(console.error)
      )
    );

    return NextResponse.json({ cancelledCount: futureIds.length });
  }

  // Single delete
  const affectedSignups = await fetchActiveSignups([id]);

  await prisma.subBlockSignup.updateMany({
    where: { slotId: id, status: "ACTIVE" },
    data: { status: "CANCELLED", cancelledAt: new Date() },
  });

  await prisma.slot.update({ where: { id }, data: { status: "CANCELLED" } });

  await notifySlotCancelled({
    affectedSignups: affectedSignups.map((s) => ({
      signupId: s.id,
      volunteerEmail: s.volunteer.user.email,
      volunteerName: s.volunteer.user.name ?? s.volunteer.user.email,
      subBlockHour: s.subBlockHour,
    })),
    clinicName: slot.clinic.name,
    language: slot.language,
    date: slot.date,
  }).catch(console.error);

  return NextResponse.json({ ok: true });
}
