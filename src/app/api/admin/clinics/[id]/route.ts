import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
async function getAdmin() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return null;
  const user = await prisma.user.findUnique({ where: { email: session.user.email } });
  if (!user || user.role !== "ADMIN") return null;
  return user;
}

function generatePin(): string {
  return Math.floor(10000000 + Math.random() * 90000000).toString();
}

// DELETE /api/admin/clinics/[id] — delete clinic (blocked if future active slots exist)
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await getAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

  const { id } = await params;
  const clinic = await prisma.clinic.findUnique({
    where: { id },
    include: { shifts: { where: { status: "ACTIVE", date: { gte: new Date() } } } },
  });
  if (!clinic) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (clinic.shifts.length > 0) {
    return NextResponse.json(
      { error: "Cannot delete a clinic that has upcoming active shifts. Cancel those shifts first." },
      { status: 409 }
    );
  }

  // Clean up in dependency order: feedback → positions → shifts → unlink staff → clinic
  const shiftIds = (await prisma.shift.findMany({ where: { clinicId: id }, select: { id: true } })).map((s) => s.id);
  const positionIds = (await prisma.shiftPosition.findMany({ where: { shiftId: { in: shiftIds } }, select: { id: true } })).map((p) => p.id);

  await prisma.feedback.deleteMany({ where: { positionId: { in: positionIds } } });
  await prisma.shiftPosition.deleteMany({ where: { id: { in: positionIds } } });
  await prisma.shift.deleteMany({ where: { clinicId: id } });
  await prisma.user.updateMany({ where: { clinicId: id }, data: { clinicId: null } });
  await prisma.clinic.delete({ where: { id } });

  return NextResponse.json({ success: true });
}

// PATCH /api/admin/clinics/[id]
// Body { travelMinutes } → update travel minutes
// Body {} or { regenPin: true } → regenerate PIN
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await getAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

  const { id } = await params;
  const clinic = await prisma.clinic.findUnique({ where: { id } });
  if (!clinic) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json().catch(() => ({}));

  if (body.travelMinutes != null) {
    const t = Number(body.travelMinutes);
    if (isNaN(t) || t < 0 || t > 240) {
      return NextResponse.json({ error: "travelMinutes must be 0–240" }, { status: 400 });
    }
    const updated = await prisma.clinic.update({ where: { id }, data: { travelMinutes: t } });
    return NextResponse.json(updated);
  }

  // Default: regenerate PIN
  const plainPin = generatePin();
  const updated = await prisma.clinic.update({
    where: { id },
    data: { loginPin: plainPin },
  });

  return NextResponse.json({ ...updated, plainPin });
}
