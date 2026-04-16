import { NextResponse } from "next/server";
// Deprecated
export async function DELETE() {
  return NextResponse.json({ error: "Use /api/volunteer/positions/[id]" }, { status: 410 });
}
