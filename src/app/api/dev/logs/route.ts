import { NextResponse } from "next/server";
import { readDevLogs, clearDevLogs } from "@/lib/dev-logger";

function devOnly() {
  if (process.env.NODE_ENV !== "development") {
    return NextResponse.json({ error: "Not available in production" }, { status: 403 });
  }
  return null;
}

export async function GET() {
  const guard = devOnly();
  if (guard) return guard;
  return NextResponse.json(readDevLogs());
}

export async function DELETE() {
  const guard = devOnly();
  if (guard) return guard;
  clearDevLogs();
  return NextResponse.json({ success: true });
}
