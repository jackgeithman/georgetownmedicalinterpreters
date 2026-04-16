import { NextResponse } from "next/server";
// Deprecated: signups replaced by /api/volunteer/positions
export async function POST() {
  return NextResponse.json({ error: "Use /api/volunteer/positions" }, { status: 410 });
}
export async function GET() {
  return NextResponse.json({ error: "Use /api/volunteer/positions" }, { status: 410 });
}
