import { NextResponse } from "next/server";
// Deprecated: replaced by /api/volunteer/positions/[id]
export async function DELETE() {
  return NextResponse.json({ error: "Use /api/volunteer/positions/[id]" }, { status: 410 });
}
