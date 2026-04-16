/**
 * GET /api/feedback/my-status
 *
 * Volunteer / Admin response: { givenShiftIds: string[] }
 *   – shiftIds where the volunteer already left VOLUNTEER-authored feedback
 *
 * Clinic response: { givenKeys: string[] }
 *   – "${shiftId}-${volunteerId}" keys where the clinic already rated that volunteer
 */
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

  const isClinic =
    (session.user as { isClinicSession?: boolean }).isClinicSession ||
    session.user.role === "CLINIC";

  if (isClinic) {
    const clinicId = (session.user as { clinicId?: string }).clinicId;
    if (!clinicId) return NextResponse.json({ givenKeys: [] });

    const feedback = await prisma.feedback.findMany({
      where: {
        authorRole: "CLINIC",
        position: { shift: { clinicId } },
      },
      include: {
        position: { select: { shiftId: true, volunteerId: true } },
      },
    });

    const givenKeys = feedback.map(
      (f) => `${f.position.shiftId}-${f.position.volunteerId}`,
    );

    return NextResponse.json({ givenKeys });
  }

  const email = session.user.email;
  if (!email) return NextResponse.json({ givenShiftIds: [] });

  const user = await prisma.user.findUnique({
    where: { email },
    include: { volunteer: true },
  });
  if (!user?.volunteer) return NextResponse.json({ givenShiftIds: [] });

  const feedback = await prisma.feedback.findMany({
    where: {
      authorRole: "VOLUNTEER",
      position: { volunteerId: user.volunteer.id },
    },
    include: { position: { select: { shiftId: true } } },
  });

  const givenShiftIds = [...new Set(feedback.map((f) => f.position.shiftId))];

  return NextResponse.json({ givenShiftIds });
}
