import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { sendAdminRemovedNotice } from "@/lib/email";

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

  return NextResponse.json({ ok: true });
}
