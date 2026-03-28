import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { sendAdminRemovedNotice } from "@/lib/email";
import { logActivity } from "@/lib/activity-log";

async function getAdmin() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return null;
  const user = await prisma.user.findUnique({ where: { email: session.user.email } });
  if (!user || (user.role !== "ADMIN" && user.role !== "SUPER_ADMIN")) return null;
  return user;
}

// DELETE /api/admin/signups/[id] — admin removes a volunteer from a slot (no penalty counters)
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await getAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

  const { id } = await params;
  const signup = await prisma.subBlockSignup.findUnique({
    where: { id },
    include: {
      slot: { include: { clinic: true } },
      volunteer: { include: { user: true } },
    },
  });
  if (!signup || signup.status !== "ACTIVE") {
    return NextResponse.json({ error: "Signup not found" }, { status: 404 });
  }

  await prisma.subBlockSignup.update({
    where: { id },
    data: { status: "CANCELLED", cancelledAt: new Date() },
  });

  // Automatic notification — no opt-in required
  const email = signup.volunteer.user.email;
  if (email) {
    await sendAdminRemovedNotice({
      to: email,
      volunteerName: signup.volunteer.user.name ?? "Volunteer",
      clinicName: signup.slot.clinic.name,
      date: signup.slot.date,
      subBlockHour: signup.subBlockHour,
    }).catch(() => {/* non-fatal */});
  }

  await logActivity({
    actorId: admin.id,
    actorEmail: admin.email ?? undefined,
    actorName: admin.name ?? undefined,
    action: "ADMIN_REMOVED_SIGNUP",
    targetType: "Signup",
    targetId: id,
    detail: `Removed ${signup.volunteer.user.email} from ${signup.slot.clinic.name} slot`,
  });

  return NextResponse.json({ ok: true });
}

// PATCH /api/admin/signups/[id] — mark as NO_SHOW
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await getAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

  const { id } = await params;
  const { status } = await req.json();

  if (status !== "NO_SHOW") return NextResponse.json({ error: "Only NO_SHOW supported" }, { status: 400 });

  const signup = await prisma.subBlockSignup.findUnique({
    where: { id },
    include: {
      slot: { include: { clinic: true } },
      volunteer: { include: { user: true } },
    },
  });
  if (!signup) return NextResponse.json({ error: "Signup not found" }, { status: 404 });

  await prisma.subBlockSignup.update({ where: { id }, data: { status: "NO_SHOW" } });
  await prisma.volunteerProfile.update({
    where: { id: signup.volunteerId },
    data: { noShows: { increment: 1 } },
  });

  await logActivity({
    actorId: admin.id,
    actorEmail: admin.email ?? undefined,
    actorName: admin.name ?? undefined,
    action: "SIGNUP_NO_SHOW",
    targetType: "Signup",
    targetId: id,
    detail: `Marked ${signup.volunteer.user.email} as no-show at ${signup.slot.clinic.name}`,
  });

  return NextResponse.json({ ok: true });
}
