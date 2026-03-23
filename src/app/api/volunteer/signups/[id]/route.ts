import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

async function getActiveVolunteer() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return null;
  const user = await prisma.user.findUnique({
    where: { email: session.user.email },
    include: { volunteer: true },
  });
  if (!user || user.role !== "VOLUNTEER" || user.status !== "ACTIVE") return null;
  return user;
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getActiveVolunteer();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  if (!user.volunteer) return NextResponse.json({ error: "No volunteer profile" }, { status: 404 });

  const { id } = await params;
  const signup = await prisma.subBlockSignup.findUnique({ where: { id } });
  if (!signup || signup.volunteerId !== user.volunteer.id || signup.status !== "ACTIVE") {
    return NextResponse.json({ error: "Signup not found" }, { status: 404 });
  }

  await prisma.subBlockSignup.update({
    where: { id },
    data: { status: "CANCELLED", cancelledAt: new Date() },
  });

  await prisma.volunteerProfile.update({
    where: { id: user.volunteer.id },
    data: { totalCancellations: { increment: 1 } },
  });

  return NextResponse.json({ ok: true });
}
