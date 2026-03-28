import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

async function getVolunteerUser() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return null;
  const user = await prisma.user.findUnique({
    where: { email: session.user.email },
    include: { volunteer: { include: { notifPrefs: true } } },
  });
  if (!user) return null;
  const validRole = user.role === "VOLUNTEER" || user.role === "ADMIN" || user.role === "INSTRUCTOR";
  if (!validRole || user.status !== "ACTIVE") return null;
  return user;
}

export async function GET() {
  const user = await getVolunteerUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  if (!user.volunteer) return NextResponse.json(defaultPrefs());

  const prefs = user.volunteer.notifPrefs ?? defaultPrefs();
  return NextResponse.json(prefs);
}

export async function PATCH(req: NextRequest) {
  const user = await getVolunteerUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

  // Auto-create volunteer profile if needed
  let volunteerId: string;
  if (user.volunteer) {
    volunteerId = user.volunteer.id;
  } else {
    const created = await prisma.volunteerProfile.create({
      data: { userId: user.id, languages: [] },
    });
    volunteerId = created.id;
  }

  const body = await req.json();
  const allowed = ["signupReceipt", "cancellationReceipt", "reminder24h", "unfilledSlotAlert"] as const;
  const data: Record<string, boolean> = {};
  for (const key of allowed) {
    if (typeof body[key] === "boolean") data[key] = body[key];
  }

  const prefs = await prisma.volunteerNotifPrefs.upsert({
    where: { volunteerId },
    update: data,
    create: { volunteerId, ...data },
  });

  return NextResponse.json(prefs);
}

function defaultPrefs() {
  return {
    signupReceipt: true,
    cancellationReceipt: true,
    reminder24h: true,
    unfilledSlotAlert: false,
  };
}
