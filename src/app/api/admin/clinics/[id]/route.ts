import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";

async function getAdmin() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return null;
  const user = await prisma.user.findUnique({ where: { email: session.user.email } });
  if (!user || (user.role !== "ADMIN" && user.role !== "SUPER_ADMIN")) return null;
  return user;
}

function generatePin(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
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

  const { loginPin: _, ...safe } = updated;
  // Return plaintext PIN once — admin must copy it now
  return NextResponse.json({ ...safe, plainPin });
}
