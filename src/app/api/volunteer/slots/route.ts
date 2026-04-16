import { NextResponse } from "next/server";
// Deprecated: replaced by /api/volunteer/shifts
export async function GET() {
  return NextResponse.json({ error: "Use /api/volunteer/shifts" }, { status: 410 });
}
