import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await getServerSession(authOptions);
  const role = session?.user?.role;
  if (role !== "ADMIN") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const suggestions = await prisma.suggestion.findMany({
    include: {
      submittedBy: { select: { name: true, email: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(suggestions);
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

  const body = await req.json();
  const { type, subject, message } = body;

  if (!subject || !subject.trim()) return NextResponse.json({ error: "subject required" }, { status: 400 });
  if (!message || !message.trim()) return NextResponse.json({ error: "message required" }, { status: 400 });

  const isClinic = (session.user as { isClinicSession?: boolean }).isClinicSession || session.user.role === "CLINIC";
  let submittedById: string | null = null;

  if (!isClinic && session.user.id) {
    submittedById = session.user.id as string;

    // Rate limit: max 3 per user per 24 hours
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const recentCount = await prisma.suggestion.count({
      where: {
        submittedById,
        createdAt: { gte: since },
      },
    });
    if (recentCount >= 3) {
      return NextResponse.json(
        { error: "You can submit up to 3 suggestions per day. Please try again tomorrow." },
        { status: 429 }
      );
    }
  }

  const suggestion = await prisma.suggestion.create({
    data: {
      type: type || "FEATURE",
      subject: subject.trim(),
      message: message.trim(),
      submittedById,
    },
  });

  return NextResponse.json(suggestion, { status: 201 });
}
