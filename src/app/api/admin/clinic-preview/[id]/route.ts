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

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await getAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

  const { id } = await params;

  const clinic = await prisma.clinic.findUnique({ where: { id }, select: { name: true } });
  if (!clinic) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const shifts = await prisma.shift.findMany({
    where: { clinicId: id },
    orderBy: { date: "asc" },
    include: {
      positions: {
        where: { status: { in: ["FILLED", "NO_SHOW", "COMPLETED"] } },
        orderBy: { positionNumber: "asc" },
        include: {
          volunteer: {
            include: { user: { select: { name: true, email: true } } },
          },
        },
      },
    },
  });

  return NextResponse.json({ clinicName: clinic.name, shifts });
}
