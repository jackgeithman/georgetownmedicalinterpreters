import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

async function getAdmin() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return null;
  const user = await prisma.user.findUnique({ where: { email: session.user.email } });
  if (!user || (user.role !== "ADMIN" && user.role !== "SUPER_ADMIN")) return null;
  return user;
}

export async function GET() {
  const admin = await getAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

  const signups = await prisma.subBlockSignup.findMany({
    where: { status: "ACTIVE" },
    orderBy: [{ slot: { date: "asc" } }, { subBlockHour: "asc" }],
    include: {
      slot: {
        include: { clinic: { select: { name: true } } },
      },
      volunteer: {
        include: { user: { select: { name: true, email: true } } },
      },
    },
  });

  return NextResponse.json(signups);
}
