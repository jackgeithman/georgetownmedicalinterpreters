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

export async function GET() {
  const admin = await getAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

  const clinics = await prisma.clinic.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      _count: { select: { staff: true, slots: true } },
    },
  });

  // Never return the hashed PIN over the wire
  const safe = clinics.map(({ loginPin: _, ...c }) => c);
  return NextResponse.json(safe);
}

function generatePin(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

export async function POST(req: NextRequest) {
  const admin = await getAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

  const body = await req.json();
  const { name, address, contactName, contactEmail } = body;

  if (!name || !contactEmail) {
    return NextResponse.json({ error: "Name and contact email required" }, { status: 400 });
  }

  const plainPin = generatePin();
  const hashedPin = await bcrypt.hash(plainPin, 10);

  const clinic = await prisma.clinic.create({
    data: { name, address: address ?? "", contactName: contactName ?? "", contactEmail, loginPin: hashedPin },
  });

  const { loginPin: _, ...safe } = clinic;
  // Return plaintext PIN once — admin must copy it now
  return NextResponse.json({ ...safe, plainPin });
}
