/**
 * Dev-mode notification logger.
 * Intercepts GCal and Gmail calls and writes them to .dev-logs/notifications.jsonl
 * so the dev toolbar can display them. Never runs in production.
 */

import fs from "fs";
import path from "path";

const LOG_DIR  = path.join(process.cwd(), ".dev-logs");
const LOG_FILE = path.join(LOG_DIR, "notifications.jsonl");
const MAX_ENTRIES = 100;

export type DevLogEntry = {
  id: string;
  ts: string;           // ISO timestamp
  service: "GCAL" | "GMAIL";
  action: string;       // e.g. "create_event", "add_attendee", "send_email"
  summary: string;      // one-line human description shown in toolbar
  detail: string;       // full content (GCal description text, email HTML, etc.)
};

function ensureDir() {
  if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });
}

export function devLog(entry: Omit<DevLogEntry, "id" | "ts">): void {
  if (process.env.NODE_ENV !== "development") return;
  ensureDir();
  const full: DevLogEntry = {
    id: Math.random().toString(36).slice(2),
    ts: new Date().toISOString(),
    ...entry,
  };
  fs.appendFileSync(LOG_FILE, JSON.stringify(full) + "\n", "utf8");
  // Trim to last MAX_ENTRIES
  try {
    const raw = fs.readFileSync(LOG_FILE, "utf8").trim();
    const lines = raw ? raw.split("\n") : [];
    if (lines.length > MAX_ENTRIES) {
      fs.writeFileSync(LOG_FILE, lines.slice(-MAX_ENTRIES).join("\n") + "\n", "utf8");
    }
  } catch { /* ignore trim errors */ }
}

export function readDevLogs(): DevLogEntry[] {
  if (process.env.NODE_ENV !== "development") return [];
  ensureDir();
  if (!fs.existsSync(LOG_FILE)) return [];
  const raw = fs.readFileSync(LOG_FILE, "utf8").trim();
  if (!raw) return [];
  return raw
    .split("\n")
    .map((line) => { try { return JSON.parse(line) as DevLogEntry; } catch { return null; } })
    .filter(Boolean)
    .reverse() as DevLogEntry[]; // newest first
}

export function clearDevLogs(): void {
  if (process.env.NODE_ENV !== "development") return;
  ensureDir();
  fs.writeFileSync(LOG_FILE, "", "utf8");
}
