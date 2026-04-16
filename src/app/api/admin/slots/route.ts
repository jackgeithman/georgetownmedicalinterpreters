import { NextResponse } from "next/server";
// Deprecated: slots replaced by /api/admin/shifts
export async function GET() {
  return NextResponse.json({ error: "Use /api/admin/shifts" }, { status: 410 });
}
