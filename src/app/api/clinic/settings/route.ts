import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

async function getClinicUser() {
  const session = await getServerSession(authOptions);
  if (session?.user?.role !== "CLINIC" || !session.user.clinicId) return null;
  return { clinicId: session.user.clinicId };
}

export async function GET() {
  const user = await getClinicUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

  const clinic = await prisma.clinic.findUnique({
    where: { id: user.clinicId },
    select: { urgentCancellationAlerts: true },
  });
  if (!clinic) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json(clinic);
}

export async function PATCH(req: NextRequest) {
  const user = await getClinicUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

  const body = await req.json();
  const { urgentCancellationAlerts } = body;

  if (typeof urgentCancellationAlerts !== "boolean") {
    return NextResponse.json({ error: "urgentCancellationAlerts must be a boolean" }, { status: 400 });
  }

  const updated = await prisma.clinic.update({
    where: { id: user.clinicId },
    data: { urgentCancellationAlerts },
    select: { urgentCancellationAlerts: true },
  });

  return NextResponse.json(updated);
}
