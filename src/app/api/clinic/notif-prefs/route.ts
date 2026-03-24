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

  const prefs = await prisma.clinicNotifPrefs.findUnique({ where: { clinicId: user.clinicId } });
  return NextResponse.json(prefs ?? defaultPrefs());
}

export async function PATCH(req: NextRequest) {
  const user = await getClinicUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

  const body = await req.json();
  const data: Record<string, unknown> = {};
  if (typeof body.dailySummary === "boolean") data.dailySummary = body.dailySummary;
  if (typeof body.unfilledAlert24h === "boolean") data.unfilledAlert24h = body.unfilledAlert24h;
  // volunteerCancelWindow: null means "don't care", number is hours (2, 4, 12, 24)
  if ("volunteerCancelWindow" in body) {
    data.volunteerCancelWindow = body.volunteerCancelWindow === null ? null : Number(body.volunteerCancelWindow);
  }

  const prefs = await prisma.clinicNotifPrefs.upsert({
    where: { clinicId: user.clinicId },
    update: data,
    create: { clinicId: user.clinicId, ...data },
  });

  return NextResponse.json(prefs);
}

function defaultPrefs() {
  return { dailySummary: true, volunteerCancelWindow: null, unfilledAlert24h: true };
}
