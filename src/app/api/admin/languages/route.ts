import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

async function getAuthorizedUser(minRole: "instructor" | "admin") {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return null;
  const user = await prisma.user.findUnique({ where: { email: session.user.email } });
  if (!user) return null;
  if (minRole === "instructor") {
    if (user.role !== "ADMIN" && user.role !== "INSTRUCTOR") return null;
  } else {
    if (user.role !== "ADMIN") return null;
  }
  return user;
}

function generateCode(name: string, existing: string[]): string {
  const base = name.trim().toUpperCase().replace(/[^A-Z]/g, "").slice(0, 3);
  if (base.length >= 2 && !existing.includes(base)) return base;
  // Try substrings
  for (let len = 2; len <= 4; len++) {
    const candidate = name.toUpperCase().replace(/[^A-Z]/g, "").slice(0, len);
    if (candidate.length === len && !existing.includes(candidate)) return candidate;
  }
  // Fallback: add numeric suffix
  let i = 2;
  const base2 = name.toUpperCase().replace(/[^A-Z]/g, "").slice(0, 2);
  while (existing.includes(`${base2}${i}`)) i++;
  return `${base2}${i}`;
}

export async function GET() {
  const user = await getAuthorizedUser("instructor");
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

  const [languages, profiles] = await Promise.all([
    prisma.languageConfig.findMany({ orderBy: { name: "asc" } }),
    prisma.volunteerProfile.findMany({ select: { languages: true } }),
  ]);

  // Count volunteers per language code
  const counts: Record<string, number> = {};
  for (const p of profiles) {
    for (const lang of p.languages) {
      counts[lang] = (counts[lang] ?? 0) + 1;
    }
  }

  const result = languages.map((l) => ({ ...l, volunteerCount: counts[l.code] ?? 0 }));
  return NextResponse.json(result);
}

export async function POST(req: NextRequest) {
  const user = await getAuthorizedUser("admin");
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

  const body = await req.json();
  const { name } = body as { name: string };

  if (!name || !name.trim()) {
    return NextResponse.json({ error: "Name is required" }, { status: 400 });
  }

  // Check by name (case-insensitive)
  const existing = await prisma.languageConfig.findFirst({
    where: { name: { equals: name.trim(), mode: "insensitive" } },
  });
  if (existing) {
    return NextResponse.json({ error: "A language with that name already exists" }, { status: 409 });
  }

  const allLangs = await prisma.languageConfig.findMany({ select: { code: true } });
  const existingCodes = allLangs.map((l) => l.code);
  const code = generateCode(name.trim(), existingCodes);

  const lang = await prisma.languageConfig.create({
    data: { code, name: name.trim() },
  });

  return NextResponse.json({ ...lang, volunteerCount: 0 }, { status: 201 });
}
