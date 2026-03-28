import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

async function getVolunteerUser() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return null;
  const user = await prisma.user.findUnique({
    where: { email: session.user.email },
    include: { volunteer: true },
  });
  if (!user || (user.role !== "VOLUNTEER" && user.role !== "ADMIN" && user.role !== "SUPER_ADMIN" && user.role !== "INSTRUCTOR")) return null;
  return user;
}

export async function GET() {
  const user = await getVolunteerUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

  if (!user.volunteer) {
    const profile = await prisma.volunteerProfile.create({
      data: { userId: user.id, languages: [] },
    });
    return NextResponse.json(profile);
  }

  return NextResponse.json(user.volunteer);
}

export async function PATCH(req: NextRequest) {
  const user = await getVolunteerUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

  const body = await req.json();
  const { languages, backgroundInfo } = body;

  if (!user.volunteer) {
    const profile = await prisma.volunteerProfile.create({
      data: { userId: user.id, languages: languages ?? [] },
    });
    return NextResponse.json(profile);
  }

  const updateData: Record<string, unknown> = {};
  if (languages !== undefined) updateData.languages = languages;
  if (backgroundInfo !== undefined) updateData.backgroundInfo = backgroundInfo || null;

  const profile = await prisma.volunteerProfile.update({
    where: { id: user.volunteer.id },
    data: updateData,
  });

  return NextResponse.json(profile);
}
