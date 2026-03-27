import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

async function getAuthenticatedUser() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return null;
  const user = await prisma.user.findUnique({ where: { email: session.user.email } });
  return user;
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  const material = await prisma.trainingMaterial.findUnique({ where: { id } });
  if (!material) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const isAdmin = user.role === "ADMIN" || user.role === "SUPER_ADMIN";
  const isInstructor = user.role === "INSTRUCTOR";

  if (!isAdmin && !isInstructor) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Instructors can only delete their own materials
  if (isInstructor && material.uploadedById !== user.id) {
    return NextResponse.json({ error: "You can only delete your own materials" }, { status: 403 });
  }

  await prisma.trainingMaterial.delete({ where: { id } });

  return NextResponse.json({ ok: true });
}
