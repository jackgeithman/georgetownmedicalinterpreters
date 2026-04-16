import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

async function getAuthorizedUser() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return null;
  const user = await prisma.user.findUnique({ where: { email: session.user.email } });
  if (!user) return null;
  if (user.role !== "ADMIN" && user.role !== "INSTRUCTOR") return null;
  return user;
}

export async function GET() {
  const user = await getAuthorizedUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

  const feedback = await prisma.feedback.findMany({
    include: {
      position: {
        include: {
          shift: {
            include: {
              clinic: { select: { name: true } },
            },
          },
          volunteer: {
            include: {
              user: { select: { name: true, email: true } },
            },
          },
        },
      },
    },
    orderBy: { createdAt: "desc" },
    take: 200,
  });

  return NextResponse.json(feedback);
}
