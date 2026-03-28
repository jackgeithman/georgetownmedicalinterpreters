import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { sendTestEmail } from "@/lib/email";

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.roles?.includes("DEV")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const body = await req.json();
  const { to } = body;
  if (!to || !to.trim()) return NextResponse.json({ error: "to required" }, { status: 400 });

  const user = await prisma.user.findUnique({ where: { email: session.user.email! } });
  const sentBy = user?.name ?? session.user.email ?? "Admin";

  await sendTestEmail(to.trim(), sentBy);

  return NextResponse.json({ ok: true });
}
