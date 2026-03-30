import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";
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
    include: { slots: { where: { status: "ACTIVE", date: { gte: new Date() } } } },
  });
  if (!clinic) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (clinic.slots.length > 0) {
    return NextResponse.json(
      { error: "Cannot delete a clinic that has upcoming active slots. Cancel or remove those slots first." },
      { status: 409 }
    );
  }

  // Clean up in dependency order: feedback → signups → slots → unlink staff → clinic
  const slotIds = (await prisma.slot.findMany({ where: { clinicId: id }, select: { id: true } })).map((s) => s.id);
  const signupIds = (await prisma.subBlockSignup.findMany({ where: { slotId: { in: slotIds } }, select: { id: true } })).map((s) => s.id);

  await prisma.feedback.deleteMany({ where: { signupId: { in: signupIds } } });
  await prisma.subBlockSignup.deleteMany({ where: { id: { in: signupIds } } });
  await prisma.slot.deleteMany({ where: { clinicId: id } });
  await prisma.user.updateMany({ where: { clinicId: id }, data: { clinicId: null } });
  await prisma.clinic.delete({ where: { id } });

  return NextResponse.json({ success: true });
}

// PATCH /api/admin/clinics/[id] — regenerate the clinic's PIN
export async function PATCH(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await getAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

  const { id } = await params;
  const clinic = await prisma.clinic.findUnique({ where: { id } });
  if (!clinic) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const plainPin = generatePin();
  const hashedPin = await bcrypt.hash(plainPin, 10);

  const updated = await prisma.clinic.update({
    where: { id },
    data: { loginPin: hashedPin },
  });

  return NextResponse.json({ ...updated, plainPin });
}
