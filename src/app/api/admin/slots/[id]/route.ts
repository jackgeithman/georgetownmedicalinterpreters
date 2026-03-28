import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { notifySlotCancelled, type AffectedSignup } from "@/lib/notifications";

async function getAdmin() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return null;
  const user = await prisma.user.findUnique({ where: { email: session.user.email } });
  if (!user || user.role !== "ADMIN") return null;
  return user;
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await getAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

  const { id } = await params;

  const slot = await prisma.slot.findUnique({
    where: { id },
    include: {
      clinic: true,
      signups: {
        where: { status: "ACTIVE" },
        include: { volunteer: { include: { user: true } } },
      },
    },
  });
  if (!slot) return NextResponse.json({ error: "Slot not found" }, { status: 404 });

  // Build affected signups list for notifications
  const affectedSignups: AffectedSignup[] = slot.signups
    .filter((s) => !!s.volunteer.user.email)
    .map((s) => ({
      signupId: s.id,
      volunteerEmail: s.volunteer.user.email!,
      volunteerName: s.volunteer.user.name ?? s.volunteer.user.email!,
      subBlockHour: s.subBlockHour,
    }));

  // Cancel all active signups
  await prisma.subBlockSignup.updateMany({
    where: { slotId: id, status: "ACTIVE" },
    data: { status: "CANCELLED", cancelledAt: new Date() },
  });

  // Cancel the slot
  await prisma.slot.update({
    where: { id },
    data: { status: "CANCELLED" },
  });

  // Notify affected volunteers
  if (affectedSignups.length > 0) {
    await notifySlotCancelled({
      affectedSignups,
      clinicName: slot.clinic.name,
      language: slot.language,
      date: slot.date,
    }).catch(console.error);
  }

  return NextResponse.json({ ok: true });
}
