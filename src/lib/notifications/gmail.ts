import nodemailer from "nodemailer";

function getTransport() {
  return nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: process.env.GOOGLE_GMAIL_SENDER_EMAIL,
      pass: process.env.GMAIL_APP_PASSWORD,
    },
  });
}

/**
 * Sends an HTML email via Gmail SMTP using an App Password.
 * No-ops silently if GMAIL_APP_PASSWORD or GOOGLE_GMAIL_SENDER_EMAIL are unset.
 */
export async function sendGmail(to: string, subject: string, html: string): Promise<void> {
  if (!process.env.GMAIL_APP_PASSWORD || !process.env.GOOGLE_GMAIL_SENDER_EMAIL) return;
  const transporter = getTransport();
  await transporter.sendMail({
    from: `Georgetown Medical Interpreters <${process.env.GOOGLE_GMAIL_SENDER_EMAIL}>`,
    to,
    subject,
    html,
  });
}
