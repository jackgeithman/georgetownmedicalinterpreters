import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

async function getSession() {
  return await getServerSession(authOptions);
}

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

  const signupId = req.nextUrl.searchParams.get("signupId");
  if (!signupId) return NextResponse.json({ error: "signupId required" }, { status: 400 });

  const feedback = await prisma.feedback.findMany({
    where: { signupId },
    orderBy: { createdAt: "asc" },
  });

  return NextResponse.json(feedback);
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

  const role = session.user.role;
  const isClinic = (session.user as { isClinicSession?: boolean }).isClinicSession || role === "CLINIC";
  const isVolunteerOrAdmin = role === "VOLUNTEER" || role === "ADMIN";

  if (!isClinic && !isVolunteerOrAdmin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const authorRole = isClinic ? "CLINIC" : "VOLUNTEER";

  const body = await req.json();
  const { signupId, rating, note } = body;

  if (!signupId) return NextResponse.json({ error: "signupId required" }, { status: 400 });
  if (rating == null || rating < 1 || rating > 5) return NextResponse.json({ error: "rating must be 1-5" }, { status: 400 });

  const signup = await prisma.subBlockSignup.findUnique({ where: { id: signupId } });
  if (!signup) return NextResponse.json({ error: "Signup not found" }, { status: 404 });

  // One rating per volunteer per slot (not per sub-block).
  // Check if any feedback with this authorRole already exists for ANY sub-block
  // that belongs to the same slot AND the same volunteer.
  const existing = await prisma.feedback.findFirst({
    where: {
      authorRole,
      signup: {
        slotId: signup.slotId,
        volunteerId: signup.volunteerId,
      },
    },
  });
  if (existing) {
    return NextResponse.json({ error: "Feedback already submitted for this shift" }, { status: 409 });
  }

  const feedback = await prisma.feedback.create({
    data: {
      signupId,
      authorRole,
      rating: Number(rating),
      note: note.trim(),
    },
  });

  return NextResponse.json(feedback, { status: 201 });
}
