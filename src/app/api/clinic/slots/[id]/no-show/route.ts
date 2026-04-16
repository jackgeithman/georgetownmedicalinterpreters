import { NextResponse } from "next/server";
// TODO: Implement no-show marking for ShiftPosition when clinic read-only view is restored
export async function POST() {
  return NextResponse.json({ error: "No-show marking temporarily disabled during system transition" }, { status: 503 });
}
