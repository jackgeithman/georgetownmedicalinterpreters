import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

async function getClinicUser() {
  const session = await getServerSession(authOptions);
  if (session?.user?.role !== "CLINIC" || !session.user.clinicId) return null;
  return { clinicId: session.user.clinicId };
}

// Read-only: returns shifts for this clinic (replaces old slot-based view)
export async function GET() {
  const user = await getClinicUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

  const shifts = await prisma.shift.findMany({
    where: { clinicId: user.clinicId },
    orderBy: { date: "asc" },
    include: {
      positions: {
        orderBy: { positionNumber: "asc" },
        include: {
          volunteer: {
            include: { user: { select: { name: true, email: true } } },
          },
        },
      },
    },
  });

  return NextResponse.json(shifts);
}

// Shift creation is now handled by admin only
export async function POST() {
  return NextResponse.json(
    { error: "Shift creation is managed by administrators. Please contact your GMI coordinator." },
    { status: 403 },
  );
}
