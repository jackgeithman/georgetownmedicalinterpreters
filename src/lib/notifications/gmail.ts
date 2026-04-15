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

export interface IcsAttachment {
  content: string;
  method: "REQUEST" | "CANCEL";
}

// RFC 2047 B-encoding for non-ASCII subject headers.
// Without this, raw UTF-8 bytes in the Subject line are misread as Latin-1
// by some clients, producing garbled output like "Ã¢Â€Â"" for an em dash.
function encodeSubject(subject: string): string {
  if (!/[^\x00-\x7F]/.test(subject)) return subject;
  return `=?UTF-8?B?${Buffer.from(subject).toString("base64")}?=`;
}

function buildRaw(to: string, subject: string, html: string, ics?: IcsAttachment): string {
  const from = `Georgetown Medical Interpreters <${process.env.GOOGLE_GMAIL_SENDER_EMAIL}>`;
  const date = new Date().toUTCString();

  if (!ics) {
    const lines = [
      `From: ${from}`,
      `To: ${to}`,
      `Subject: ${encodeSubject(subject)}`,
      `Date: ${date}`,
      "MIME-Version: 1.0",
      "Content-Type: text/html; charset=UTF-8",
      "Content-Transfer-Encoding: 8bit",
      "",
      html,
    ];
    return Buffer.from(lines.join("\r\n")).toString("base64url");
  }

  // Multipart/mixed — HTML body + .ics attachment
  const boundary = `gmi_boundary_${Date.now()}`;
  const lines = [
    `From: ${from}`,
    `To: ${to}`,
    `Subject: ${encodeSubject(subject)}`,
    `Date: ${date}`,
    "MIME-Version: 1.0",
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
    "",
    `--${boundary}`,
    "Content-Type: text/html; charset=UTF-8",
    "Content-Transfer-Encoding: 8bit",
    "",
    html,
    "",
    `--${boundary}`,
    `Content-Type: text/calendar; charset=UTF-8; method=${ics.method}`,
    `Content-Disposition: attachment; filename="shift.ics"`,
    "",
    ics.content,
    "",
    `--${boundary}--`,
  ];
  return Buffer.from(lines.join("\r\n")).toString("base64url");
}

/**
 * Sends an HTML email (with optional .ics calendar attachment) via the Gmail API.
 * No-ops silently if GOOGLE_GMAIL_REFRESH_TOKEN or GOOGLE_GMAIL_SENDER_EMAIL are unset.
 */
export async function sendGmail(
  to: string,
  subject: string,
  html: string,
  ics?: IcsAttachment,
): Promise<void> {
  if (!process.env.GOOGLE_GMAIL_REFRESH_TOKEN || !process.env.GOOGLE_GMAIL_SENDER_EMAIL) return;
  const gmail = google.gmail({ version: "v1", auth: getAuth() });
  await gmail.users.messages.send({
    userId: "me",
    requestBody: { raw: buildRaw(to, subject, html, ics) },
  }).catch(console.error);
}
