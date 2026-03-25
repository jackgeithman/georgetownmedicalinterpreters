import { Resend } from "resend";

/**
 * Sends an HTML email to a clinic contact via Resend.
 * No-ops silently if RESEND_API_KEY is unset.
 */
export async function sendResendEmail(
  to: string,
  subject: string,
  html: string,
): Promise<void> {
  if (!process.env.RESEND_API_KEY) return;
  const resend = new Resend(process.env.RESEND_API_KEY);
  const from =
    process.env.EMAIL_FROM ?? process.env.RESEND_FROM ?? "Georgetown Medical Interpreters <notifications@georgetownmedicalinterpreters.org>";
  await resend.emails.send({ from, to, subject, html });
}
