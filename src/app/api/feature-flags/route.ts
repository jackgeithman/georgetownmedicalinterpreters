import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const flags = await prisma.featureFlag.findMany();
  const map: Record<string, boolean> = {};
  for (const flag of flags) {
    map[flag.key] = flag.enabled;
  }
  return NextResponse.json(map);
}
