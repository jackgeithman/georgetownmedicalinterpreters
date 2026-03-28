import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

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

  return NextResponse.json(clinics);
}

function generatePin(): string {
  return Math.floor(10000000 + Math.random() * 90000000).toString();
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

  const clinic = await prisma.clinic.create({
    data: { name, address: address ?? "", contactName: contactName ?? "", contactEmail, loginPin: plainPin },
  });

  return NextResponse.json({ ...clinic, plainPin: clinic.loginPin });
}
