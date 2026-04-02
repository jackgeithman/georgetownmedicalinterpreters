import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

  const all = new URL(req.url).searchParams.get("all") === "true";

  const languages = await prisma.languageConfig.findMany({
    where: all ? undefined : { isActive: true },
    orderBy: { name: "asc" },
    select: { code: true, name: true, isActive: true },
  });

  return NextResponse.json(languages);
}
