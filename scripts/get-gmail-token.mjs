/**
 * Generates a Gmail + Calendar refresh token for the GMI org account.
 * Run with: node scripts/get-gmail-token.mjs
 *
 * Prerequisites:
 *   - GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in your .env.local
 *   - http://localhost:3000/oauth must be in your OAuth client's authorized redirect URIs
 *
 * After running, copy the printed refresh token into:
 *   Vercel → Settings → Environment Variables → GOOGLE_GMAIL_REFRESH_TOKEN
 * Then redeploy.
 */

import { OAuth2Client } from "google-auth-library";
import { createServer } from "http";
import { exec } from "child_process";
import { readFileSync } from "fs";
import { resolve } from "path";

// Load .env.local
const envPath = resolve(process.cwd(), ".env.local");
const env = Object.fromEntries(
  readFileSync(envPath, "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.startsWith("#"))
    .map((l) => l.split("=").map((s) => s.trim()))
);

const CLIENT_ID = env.GOOGLE_CLIENT_ID;
const CLIENT_SECRET = env.GOOGLE_CLIENT_SECRET;
const REDIRECT = "http://localhost:3000/oauth";

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error("Missing GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET in .env.local");
  process.exit(1);
}

const client = new OAuth2Client(CLIENT_ID, CLIENT_SECRET, REDIRECT);

const authUrl = client.generateAuthUrl({
  access_type: "offline",
  prompt: "consent",
  scope: [
    "https://www.googleapis.com/auth/gmail.send",
    "https://www.googleapis.com/auth/calendar.events",
  ],
});

console.log("\nOpening browser — sign in as georgetownmedicalinterpreters@gmail.com\n");
exec(`open "${authUrl}"`);

const server = createServer(async (req, res) => {
  const code = new URL(req.url, "http://localhost:3000").searchParams.get("code");
  if (!code) { res.end(); return; }

  try {
    const { tokens } = await client.getToken(code);
    console.log("\n✅ REFRESH TOKEN (copy this into Vercel):\n");
    console.log(tokens.refresh_token);
    console.log("\nThen redeploy on Vercel.\n");
    res.end("Done — check your terminal.");
  } catch (e) {
    console.error("Failed to exchange code:", e.message);
    res.end("Error — check terminal.");
  }

  server.close();
}).listen(3000, () => {
  console.log("Waiting for Google to redirect back...");
});
