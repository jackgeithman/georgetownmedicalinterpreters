import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { logActivity } from "@/lib/activity-log";
import { notifyShiftCancelled, notifyShiftUpdated, notifyUberLocationChange } from "@/lib/notifications";
import { updateShiftCalEvent } from "@/lib/notifications/gcal";

async function getAdmin() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return null;
  const user = await prisma.user.findUnique({ where: { email: session.user.email } });
  if (!user || (user.role !== "ADMIN" && !user.roles.includes("DEV"))) return null;
  return user;
}

// ─── Helper: build GCal info from a fully-loaded shift ───────────────────────
function gcalInfo(s: {
  date: Date; volunteerStart: number; volunteerEnd: number; travelMinutes: number;
  keyRetrievalTime: number | null; keyReturnTime: number | null;
  clinicName: string; clinicAddress: string; notes: string | null;
  languagesNeeded: string[]; isUberShift: boolean;
  positions: { positionNumber: number; isDriver: boolean; languageCode: string | null; status: string; volunteerName: string | null }[];
}) {
  return {
    date: s.date,
    volunteerStart: s.volunteerStart,
    volunteerEnd: s.volunteerEnd,
    travelMinutes: s.travelMinutes,
    keyRetrievalTime: s.keyRetrievalTime,
    keyReturnTime: s.keyReturnTime,
    clinicName: s.clinicName,
    clinicAddress: s.clinicAddress,
    notes: s.notes,
    languagesNeeded: s.languagesNeeded,
    isUberShift: s.isUberShift,
    positions: s.positions,
  };
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await getAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

  const { id } = await params;
  const body = await req.json();
  const {
    date, volunteerStart, volunteerEnd, travelMinutes,
    keyRetrievalTime, keyReturnTime, languagesNeeded, notes,
    // Uber fields
    isUberShift, uberBookedBy, uberBookedByReturn, uberBooked,
  } = body;

  const shift = await prisma.shift.findUnique({
    where: { id },
    include: {
      clinic: true,
      positions: {
        orderBy: { positionNumber: "asc" },
        include: {
          volunteer: { include: { user: { select: { name: true, email: true } } } },
        },
      },
    },
  });
  if (!shift || shift.status !== "ACTIVE") {
    return NextResponse.json({ error: "Shift not found or inactive" }, { status: 404 });
  }

  // ── Uber toggle: Van → Uber ────────────────────────────────────────────────
  if (isUberShift === true && !shift.isUberShift) {
    if (!uberBookedBy?.trim()) {
      return NextResponse.json({ error: "uberBookedBy is required when switching to Uber" }, { status: 400 });
    }

    await prisma.$transaction(async (tx) => {
      await tx.shift.update({
        where: { id },
        data: { isUberShift: true, uberBooked: false, uberBookedBy: uberBookedBy.trim(), uberBookedByReturn: uberBookedByReturn?.trim() || null },
      });
      // Distribute all languages across all positions and open every seat
      for (let i = 0; i < shift.positions.length; i++) {
        await tx.shiftPosition.update({
          where: { id: shift.positions[i].id },
          data: { languageCode: shift.languagesNeeded[i] ?? null, status: "OPEN" },
        });
      }
    });

    // Notify currently-filled volunteers of location change
    const filledVolunteers = shift.positions
      .filter((p) => p.status === "FILLED" && p.volunteer?.user?.email)
      .map((p) => ({ email: p.volunteer!.user!.email!, name: p.volunteer!.user!.name ?? p.volunteer!.user!.email! }));
    if (filledVolunteers.length > 0) {
      await notifyUberLocationChange({
        volunteers: filledVolunteers,
        clinicName: shift.clinic.name,
        date: shift.date,
        volunteerStart: shift.volunteerStart,
        volunteerEnd: shift.volunteerEnd,
        uberBookedBy: uberBookedBy.trim(),
      }).catch(console.error);
    }

    await logActivity({
      actorId: admin.id, actorEmail: admin.email ?? undefined, actorName: admin.name ?? undefined,
      action: "SHIFT_UPDATED", targetType: "Shift", targetId: id,
      detail: `Switched shift to Uber mode (booker: ${uberBookedBy.trim()}) for ${shift.clinic.name}`,
    });

    const updated = await prisma.shift.findUnique({
      where: { id },
      include: {
        clinic: { select: { id: true, name: true, address: true } },
        positions: { orderBy: { positionNumber: "asc" }, include: { volunteer: { include: { user: { select: { name: true, email: true } } } } } },
      },
    });

    // Update GCal
    if (updated) {
      await updateShiftCalEvent(id, gcalInfo({
        ...updated,
        clinicName: updated.clinic.name,
        clinicAddress: updated.clinic.address,
        positions: updated.positions.map((p) => ({
          positionNumber: p.positionNumber, isDriver: p.isDriver,
          languageCode: p.languageCode, status: p.status,
          volunteerName: p.volunteer?.user?.name ?? null,
        })),
      })).catch(console.error);
    }

    return NextResponse.json(updated);
  }

  // ── Uber toggle: Uber → Van ────────────────────────────────────────────────
  if (isUberShift === false && shift.isUberShift) {
    const openPositions = shift.positions.filter((p) => p.status === "OPEN");
    if (openPositions.length === 0) {
      return NextResponse.json(
        { error: "Remove a volunteer first — all seats are full. You need a free seat for the driver." },
        { status: 409 },
      );
    }

    await prisma.$transaction(async (tx) => {
      const seat1 = shift.positions.find((p) => p.isDriver)!;
      const firstOpen = openPositions[0];

      if (seat1.status === "FILLED") {
        // Move seat 1 volunteer to the first open seat, keeping their language
        await tx.shiftPosition.update({
          where: { id: firstOpen.id },
          data: {
            volunteerId: seat1.volunteerId,
            languageCode: seat1.languageCode,
            status: "FILLED",
            signedUpAt: seat1.signedUpAt,
          },
        });
        // Clear seat 1 for the driver
        await tx.shiftPosition.update({
          where: { id: seat1.id },
          data: { volunteerId: null, languageCode: null, status: "OPEN", signedUpAt: null },
        });
      } else {
        // Seat 1 is already open — just clear its language code
        await tx.shiftPosition.update({
          where: { id: seat1.id },
          data: { languageCode: null, status: "OPEN" },
        });
      }

      // Lock all remaining empty non-driver positions (except the one we just filled above)
      for (const pos of shift.positions) {
        if (pos.isDriver) continue;
        if (pos.id === firstOpen.id && seat1.status === "FILLED") continue; // just filled
        if (pos.status === "FILLED") continue; // keep filled seats
        await tx.shiftPosition.update({
          where: { id: pos.id },
          data: { languageCode: null, status: "LOCKED" },
        });
      }

      await tx.shift.update({
        where: { id },
        data: { isUberShift: false, uberBooked: false, uberBookedBy: null, uberBookedByReturn: null },
      });
    });

    await logActivity({
      actorId: admin.id, actorEmail: admin.email ?? undefined, actorName: admin.name ?? undefined,
      action: "SHIFT_UPDATED", targetType: "Shift", targetId: id,
      detail: `Switched shift back to Van mode for ${shift.clinic.name} — driver seat now open`,
    });

    const updated = await prisma.shift.findUnique({
      where: { id },
      include: {
        clinic: { select: { id: true, name: true, address: true } },
        positions: { orderBy: { positionNumber: "asc" }, include: { volunteer: { include: { user: { select: { name: true, email: true } } } } } },
      },
    });

    if (updated) {
      await updateShiftCalEvent(id, gcalInfo({
        ...updated,
        clinicName: updated.clinic.name,
        clinicAddress: updated.clinic.address,
        positions: updated.positions.map((p) => ({
          positionNumber: p.positionNumber, isDriver: p.isDriver,
          languageCode: p.languageCode, status: p.status,
          volunteerName: p.volunteer?.user?.name ?? null,
        })),
      })).catch(console.error);
    }

    return NextResponse.json(updated);
  }

  // ── uberBooked toggle ──────────────────────────────────────────────────────
  if (uberBooked !== undefined) {
    await prisma.shift.update({ where: { id }, data: { uberBooked: Boolean(uberBooked) } });
    const updated = await prisma.shift.findUnique({
      where: { id },
      include: {
        clinic: { select: { id: true, name: true, address: true } },
        positions: { orderBy: { positionNumber: "asc" }, include: { volunteer: { include: { user: { select: { name: true, email: true } } } } } },
      },
    });
    return NextResponse.json(updated);
  }

  // ── Regular shift edit ─────────────────────────────────────────────────────
  const updateData: Record<string, unknown> = {};
  if (date != null) updateData.date = new Date(date + "T12:00:00");
  if (volunteerStart != null) updateData.volunteerStart = Number(volunteerStart);
  if (volunteerEnd != null) updateData.volunteerEnd = Number(volunteerEnd);
  if (travelMinutes != null) updateData.travelMinutes = Number(travelMinutes);
  if (keyRetrievalTime !== undefined) updateData.keyRetrievalTime = keyRetrievalTime != null ? Number(keyRetrievalTime) : null;
  if (keyReturnTime !== undefined) updateData.keyReturnTime = keyReturnTime != null ? Number(keyReturnTime) : null;
  if (notes !== undefined) updateData.notes = notes || null;

  let cancelledPositions: typeof shift.positions = [];
  if (languagesNeeded && Array.isArray(languagesNeeded)) {
    updateData.languagesNeeded = languagesNeeded;
    cancelledPositions = shift.positions.filter(
      (p) => p.status === "FILLED" && p.positionNumber > languagesNeeded.length,
    );
    await prisma.$transaction(async (tx) => {
      await tx.shift.update({ where: { id }, data: updateData });
      await tx.shiftPosition.deleteMany({ where: { shiftId: id } });
      await tx.shiftPosition.createMany({
        data: languagesNeeded.map((_: string, i: number) => ({
          shiftId: id, positionNumber: i + 1, isDriver: i === 0,
          languageCode: null,
          status: i === 0 ? "OPEN" : "LOCKED",
        })),
      });
    });
  } else {
    await prisma.shift.update({ where: { id }, data: updateData });
  }

  if (cancelledPositions.length > 0) {
    const emails = cancelledPositions.map((p) => p.volunteer?.user?.email).filter(Boolean) as string[];
    if (emails.length > 0) {
      await notifyShiftUpdated({ shift, cancelledEmails: emails }).catch(console.error);
    }
  }

  const updatedShift = await prisma.shift.findUnique({
    where: { id },
    include: {
      clinic: true,
      positions: {
        orderBy: { positionNumber: "asc" },
        include: { volunteer: { include: { user: { select: { name: true } } } } },
      },
    },
  });
  if (updatedShift) {
    await updateShiftCalEvent(id, gcalInfo({
      ...updatedShift,
      clinicName: updatedShift.clinic.name,
      clinicAddress: updatedShift.clinic.address,
      positions: updatedShift.positions.map((p) => ({
        positionNumber: p.positionNumber, isDriver: p.isDriver,
        languageCode: p.languageCode, status: p.status,
        volunteerName: p.volunteer?.user?.name ?? null,
      })),
    })).catch(console.error);
  }

  await logActivity({
    actorId: admin.id, actorEmail: admin.email ?? undefined, actorName: admin.name ?? undefined,
    action: "SHIFT_UPDATED", targetType: "Shift", targetId: id,
    detail: `Updated shift for ${shift.clinic.name} on ${shift.date.toISOString().split("T")[0]}`,
  });

  const updated = await prisma.shift.findUnique({
    where: { id },
    include: {
      clinic: { select: { id: true, name: true, address: true } },
      positions: {
        orderBy: { positionNumber: "asc" },
        include: { volunteer: { include: { user: { select: { name: true, email: true } } } } },
      },
    },
  });

  return NextResponse.json(updated);
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await getAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

  const { id } = await params;

  const shift = await prisma.shift.findUnique({
    where: { id },
    include: {
      clinic: true,
      positions: {
        where: { status: "FILLED" },
        include: {
          volunteer: { include: { user: { select: { name: true, email: true } } } },
        },
      },
    },
  });
  if (!shift || shift.status !== "ACTIVE") {
    return NextResponse.json({ error: "Shift not found or already cancelled" }, { status: 404 });
  }

  await prisma.$transaction([
    prisma.shiftPosition.updateMany({
      where: { shiftId: id, status: { in: ["OPEN", "FILLED", "LOCKED"] } },
      data: { status: "CANCELLED", cancelledAt: new Date() },
    }),
    prisma.shift.update({ where: { id }, data: { status: "CANCELLED" } }),
  ]);

  const emails = shift.positions.map((p) => p.volunteer?.user?.email).filter(Boolean) as string[];
  await notifyShiftCancelled({ shiftId: id, shift, volunteerEmails: emails }).catch(console.error);

  await logActivity({
    actorId: admin.id, actorEmail: admin.email ?? undefined, actorName: admin.name ?? undefined,
    action: "SHIFT_CANCELLED", targetType: "Shift", targetId: id,
    detail: `Cancelled shift for ${shift.clinic.name} on ${shift.date.toISOString().split("T")[0]}`,
  });

  return NextResponse.json({ success: true });
}
