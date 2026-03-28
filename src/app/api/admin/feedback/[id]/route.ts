import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { logActivity } from "@/lib/activity-log";

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

  const user = await prisma.user.findUnique({ where: { email: session.user.email } });
  if (!user || user.role !== "SUPER_ADMIN") {
    return NextResponse.json({ error: "Super admin only" }, { status: 403 });
  }

  const { id } = await params;
  const feedback = await prisma.feedback.findUnique({ where: { id } });
  if (!feedback) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await prisma.feedback.delete({ where: { id } });

  await logActivity({
    actorId: user.id,
    actorEmail: user.email ?? undefined,
    actorName: user.name ?? undefined,
    action: "FEEDBACK_DELETED",
    targetType: "Feedback",
    targetId: id,
    detail: `Deleted feedback entry`,
  });

  return NextResponse.json({ ok: true });
}
