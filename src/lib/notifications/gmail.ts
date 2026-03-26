import { google } from "googleapis";

function getAuth() {
  const client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    "https://developers.google.com/oauthplayground",
  );
  client.setCredentials({ refresh_token: process.env.GOOGLE_GMAIL_REFRESH_TOKEN });
  return client;
}

function buildRaw(to: string, subject: string, html: string): string {
  const from = `Georgetown Medical Interpreters <${process.env.GOOGLE_GMAIL_SENDER_EMAIL}>`;
  // Include an explicit Date header (RFC 2822) so email clients display the
  // correct send time rather than relying on Gmail's server clock.
  // toUTCString() produces a valid RFC 2822 string (e.g. "Tue, 25 Mar 2026 14:00:00 GMT").
  const lines = [
    `From: ${from}`,
    `To: ${to}`,
    `Subject: ${subject}`,
    `Date: ${new Date().toUTCString()}`,
    "MIME-Version: 1.0",
    "Content-Type: text/html; charset=UTF-8",
    "",
    html,
  ];
  return Buffer.from(lines.join("\r\n")).toString("base64url");
}

/**
 * Sends an HTML email to a volunteer via the Gmail API.
 * No-ops silently if GOOGLE_GMAIL_REFRESH_TOKEN or GOOGLE_GMAIL_SENDER_EMAIL are unset.
 */
export async function sendGmail(to: string, subject: string, html: string): Promise<void> {
  if (!process.env.GOOGLE_GMAIL_REFRESH_TOKEN || !process.env.GOOGLE_GMAIL_SENDER_EMAIL) return;
  const gmail = google.gmail({ version: "v1", auth: getAuth() });
  await gmail.users.messages.send({
    userId: "me",
    requestBody: { raw: buildRaw(to, subject, html) },
  }).catch(console.error);
}
