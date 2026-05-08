import { NextResponse } from "next/server";
import { clearDevLogs } from "@/lib/dev-logger";
import { runSeed } from "@/lib/dev-seed";

export async function POST() {
  if (process.env.NODE_ENV !== "development") {
    return NextResponse.json({ error: "Not available in production" }, { status: 403 });
  }
  try {
    await runSeed();
    clearDevLogs();
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[dev/seed]", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
