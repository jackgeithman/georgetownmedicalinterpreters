import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// Very simple IP-based rate limit using a module-level map (resets on cold start)
const ipHits = new Map<string, { count: number; resetAt: number }>();

export async function POST(req: NextRequest) {
  // Rate limit: max 2 submissions per IP per hour
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const now = Date.now();
  const entry = ipHits.get(ip);
  if (entry && now < entry.resetAt) {
    if (entry.count >= 2) {
      return NextResponse.json(
        { error: "Too many messages. Please try again later." },
        { status: 429 }
      );
    }
    entry.count++;
  } else {
    ipHits.set(ip, { count: 1, resetAt: now + 60 * 60 * 1000 });
  }

  const body = await req.json();
  const { name, email, phone, message } = body as {
    name?: string;
    email?: string;
    phone?: string;
    message?: string;
  };

  if (!name?.trim()) return NextResponse.json({ error: "Name is required" }, { status: 400 });
  if (!message?.trim()) return NextResponse.json({ error: "Message is required" }, { status: 400 });

  const contactInfo = [
    email?.trim() ? `Email: ${email.trim()}` : null,
    phone?.trim() ? `Phone: ${phone.trim()}` : null,
  ]
    .filter(Boolean)
    .join(" | ");

  const fullMessage = contactInfo ? `${message.trim()}\n\n---\n${contactInfo}` : message.trim();

  const suggestion = await prisma.suggestion.create({
    data: {
      type: "CONTACT",
      subject: `Contact: ${name.trim()}`,
      message: fullMessage,
      submittedById: null,
    },
  });

  return NextResponse.json({ success: true, id: suggestion.id }, { status: 201 });
}
