import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

type NotifPrefs = {
  signupReceipt: boolean;
  cancellationReceipt: boolean;
  reminder24h: boolean;
  unfilledSlotAlert: boolean;
};

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = await prisma.user.findUnique({ where: { email: session.user.email } });
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

  // Prevent re-submission after onboarding is already complete
  if (user.onboardingComplete) {
    return NextResponse.json({ error: "Onboarding already submitted" }, { status: 409 });
  }

  const body = await req.json() as {
    firstName?: string;
    lastName?: string;
    roles?: string[];
    languages?: string[];
    notifPrefs?: NotifPrefs | null;
  };

  const { firstName, lastName, roles, languages, notifPrefs } = body;

  if (!firstName?.trim() || !lastName?.trim()) {
    return NextResponse.json({ error: "First and last name are required." }, { status: 400 });
  }

  const allowedRoles = ["VOLUNTEER", "INSTRUCTOR", "ADMIN"];
  const requestedRoles = (roles ?? []).filter((r) => allowedRoles.includes(r));
  if (requestedRoles.length === 0) {
    return NextResponse.json({ error: "At least one role is required." }, { status: 400 });
  }

  const pendingRoleEntries = requestedRoles.map((r) => `${r}_PENDING`);
  const langEntries = (languages ?? []).map((code) => `LANG_${code.toUpperCase()}`);
  const newRoles = [...pendingRoleEntries, ...langEntries];

  // Build transaction steps
  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: user.id },
      data: {
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        name: `${firstName.trim()} ${lastName.trim()}`,
        roles: newRoles,
        status: "PENDING_APPROVAL",
        onboardingComplete: true,
      },
    });

    // If volunteer requested, create VolunteerProfile + notif prefs
    if (requestedRoles.includes("VOLUNTEER")) {
      const existing = await tx.volunteerProfile.findUnique({ where: { userId: user.id } });
      if (!existing) {
        const profile = await tx.volunteerProfile.create({
          data: {
            userId: user.id,
            languages: (languages ?? []).map((c) => c.toUpperCase()),
          },
        });
        if (notifPrefs) {
          await tx.volunteerNotifPrefs.create({
            data: {
              volunteerId: profile.id,
              signupReceipt: notifPrefs.signupReceipt ?? true,
              cancellationReceipt: notifPrefs.cancellationReceipt ?? true,
              reminder24h: notifPrefs.reminder24h ?? true,
              unfilledSlotAlert: notifPrefs.unfilledSlotAlert ?? false,
            },
          });
        }
      }
    }
  });

  // Send confirmation email (non-blocking)
  try {
    const { sendOnboardingConfirmation } = await import("@/lib/notifications");
    await sendOnboardingConfirmation({
      email: user.email,
      name: `${firstName.trim()} ${lastName.trim()}`,
      roles: requestedRoles,
    });
  } catch (err) {
    console.error("[ONBOARDING] Failed to send confirmation email:", err);
  }

  return NextResponse.json({ ok: true });
}
