import { google } from "googleapis";

function getAuth() {
  const client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
  );
  client.setCredentials({ refresh_token: process.env.GOOGLE_GMAIL_REFRESH_TOKEN });
  return client;
}

function buildRaw(to: string, subject: string, html: string): string {
  const from = `Georgetown Medical Interpreters <${process.env.GOOGLE_GMAIL_SENDER_EMAIL}>`;
  const lines = [
    `From: ${from}`,
    `To: ${to}`,
    `Subject: ${subject}`,
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
