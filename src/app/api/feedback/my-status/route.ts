/**
 * GET /api/feedback/my-status
 *
 * Returns which feedback has already been submitted by the current user, so
 * the frontend can show a pre-hydrated "pending feedback" list without doing
 * N individual /api/feedback?signupId=... calls.
 *
 * Volunteer / Admin response: { givenSlotIds: string[] }
 *   – slotIds where the volunteer already left VOLUNTEER-authored feedback
 *
 * Clinic response: { givenKeys: string[] }
 *   – "${slotId}-${volunteerId}" keys where the clinic already rated that volunteer
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
    // Find this clinic's id from the session
    const clinicId = (session.user as { clinicId?: string }).clinicId;
    if (!clinicId) return NextResponse.json({ givenKeys: [] });

    // All CLINIC-authored feedback for slots belonging to this clinic
    const feedback = await prisma.feedback.findMany({
      where: {
        authorRole: "CLINIC",
        signup: { slot: { clinicId } },
      },
      include: {
        signup: { select: { slotId: true, volunteerId: true } },
      },
    });

    const givenKeys = feedback.map(
      (f) => `${f.signup.slotId}-${f.signup.volunteerId}`
    );

    return NextResponse.json({ givenKeys });
  }

  // Volunteer / Admin path — find their VolunteerProfile
  const email = session.user.email;
  if (!email) return NextResponse.json({ givenSlotIds: [] });

  const user = await prisma.user.findUnique({
    where: { email },
    include: { volunteer: true },
  });
  if (!user?.volunteer) return NextResponse.json({ givenSlotIds: [] });

  const feedback = await prisma.feedback.findMany({
    where: {
      authorRole: "VOLUNTEER",
      signup: { volunteerId: user.volunteer.id },
    },
    include: { signup: { select: { slotId: true } } },
  });

  const givenSlotIds = [...new Set(feedback.map((f) => f.signup.slotId))];

  return NextResponse.json({ givenSlotIds });
}
