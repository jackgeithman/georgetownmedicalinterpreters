import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { sendGmail } from "@/lib/notifications/gmail";

// In-memory rate limit: 1 appeal per user email per 24 hours
const appealRateLimit = new Map<string, number>();

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userEmail = session.user.email.toLowerCase();
  const now = Date.now();
  const lastSent = appealRateLimit.get(userEmail) ?? 0;
  const cooldownMs = 24 * 60 * 60 * 1000;

  if (now - lastSent < cooldownMs) {
    const nextAvailableMs = lastSent + cooldownMs;
    const hoursLeft = Math.ceil((nextAvailableMs - now) / (60 * 60 * 1000));
    return NextResponse.json(
      { error: `You can send one appeal per 24 hours. Try again in ${hoursLeft} hour${hoursLeft !== 1 ? "s" : ""}.` },
      { status: 429 },
    );
  }

  const body = await req.json() as { message?: string };
  const message = body.message?.trim();

  if (!message) {
    return NextResponse.json({ error: "Message cannot be empty." }, { status: 400 });
  }
  if (message.length > 1000) {
    return NextResponse.json({ error: "Message must be under 1000 characters." }, { status: 400 });
  }

  appealRateLimit.set(userEmail, now);

  const userName = session.user.name ?? userEmail;
  const html = `<!DOCTYPE html><html><body style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px;color:#1a1a1a">
<div style="border-bottom:3px solid #002147;padding-bottom:12px;margin-bottom:24px">
  <h2 style="color:#002147;margin:0">Georgetown Medical Interpreters — Account Appeal</h2>
</div>
<table style="margin:0 0 16px;border-collapse:collapse">
  <tr><td style="padding:5px 14px 5px 0;color:#6b7280;font-size:13px;white-space:nowrap">From</td><td style="font-size:13px;font-weight:600">${userName}</td></tr>
  <tr><td style="padding:5px 14px 5px 0;color:#6b7280;font-size:13px;white-space:nowrap">Email</td><td style="font-size:13px;font-weight:600">${userEmail}</td></tr>
</table>
<p style="font-size:13px;font-weight:600;margin-bottom:6px">Message:</p>
<blockquote style="border-left:3px solid #002147;margin:0;padding:12px 16px;background:#f9fafb;font-size:14px;line-height:1.6">
  ${message.replace(/\n/g, "<br>")}
</blockquote>
<div style="margin-top:24px;font-size:11px;color:#9ca3af">Georgetown Medical Interpreters · Automatic account rejection appeal</div>
</body></html>`;

  await sendGmail(
    "georgetownmedicalinterpreters@gmail.com",
    `Account Appeal from ${userName} <${userEmail}>`,
    html,
  );

  return NextResponse.json({ ok: true });
}
