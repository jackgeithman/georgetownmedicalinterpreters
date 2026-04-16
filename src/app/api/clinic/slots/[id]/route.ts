import { NextResponse } from "next/server";
// Clinic slot editing is disabled — shifts are now managed by admin only
export async function PATCH() {
  return NextResponse.json({ error: "Shift management is handled by administrators" }, { status: 403 });
}
export async function DELETE() {
  return NextResponse.json({ error: "Shift management is handled by administrators" }, { status: 403 });
}
