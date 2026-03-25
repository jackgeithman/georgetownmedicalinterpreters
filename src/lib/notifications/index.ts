import { sendGmail } from "./gmail";
import { createCalEvent, deleteCalEvent, updateCalEvent, type SlotInfo } from "./gcal";
import { sendResendEmail } from "./resend";

// ─── Helpers ────────────────────────────────────────────────────────────────

const LANG_NAMES: Record<string, string> = {
  ES: "Spanish",
  ZH: "Chinese (Mandarin)",
  KO: "Korean",
  AR: "Arabic",
};

function fmt12(h: number): string {
  const period = h < 12 ? "AM" : "PM";
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${h12}:00 ${period}`;
}

function fmtDate(d: Date): string {
  return d.toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "America/New_York",
  });
}

function wrap(title: string, body: string): string {
  return `<!DOCTYPE html><html><body style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px;color:#1a1a1a">
<div style="border-bottom:3px solid #002147;padding-bottom:12px;margin-bottom:24px">
  <h2 style="color:#002147;margin:0;font-size:20px">InterpretConnect</h2>
  <p style="color:#666;margin:4px 0 0;font-size:12px">Georgetown Medical Interpreters</p>
</div>
<h3 style="color:#002147;margin-top:0">${title}</h3>
${body}
<div style="margin-top:32px;padding-top:16px;border-top:1px solid #e5e7eb;font-size:11px;color:#9ca3af">
  Georgetown Medical Interpreters &middot; georgetownmedicalinterpreters.org<br>
  This is an automated message — please do not reply to this email.
</div>
</body></html>`;
}

function detail(label: string, value: string): string {
  return `<tr>
    <td style="padding:6px 12px 6px 0;color:#6b7280;font-size:13px;white-space:nowrap;vertical-align:top">${label}</td>
    <td style="padding:6px 0;font-size:13px;font-weight:600">${value}</td>
  </tr>`;
}

function table(...rows: string[]): string {
  return `<table style="margin:16px 0;border-collapse:collapse">${rows.join("")}</table>`;
}

// ─── Volunteer Notifications (Gmail + Google Calendar) ───────────────────────

/**
 * Volunteer signs up for a slot.
 * Sends a Gmail confirmation and creates a Google Calendar event.
 */
export async function notifyVolunteerSignup(params: {
  signupId: string;
  volunteerEmail: string;
  volunteerName: string;
  clinicName: string;
  clinicAddress: string;
  clinicContactEmail: string;
  language: string;
  date: Date;
  subBlockHour: number;
  notes?: string | null;
}): Promise<void> {
  const {
    signupId,
    volunteerEmail,
    volunteerName,
    clinicName,
    clinicAddress,
    clinicContactEmail,
    language,
    date,
    subBlockHour,
    notes,
  } = params;

  const lang = LANG_NAMES[language] ?? language;

  const html = wrap(
    "Shift Confirmed",
    `<p>Hi ${volunteerName},</p>
<p>You&rsquo;re confirmed for a <strong>${lang}</strong> interpreter shift.</p>
${table(
  detail("Date", fmtDate(date)),
  detail("Time", `${fmt12(subBlockHour)} &ndash; ${fmt12(subBlockHour + 1)}`),
  detail("Clinic", clinicName),
  detail("Location", clinicAddress),
  notes ? detail("Notes", notes) : "",
)}
<p style="font-size:13px;color:#6b7280">A Google Calendar invite has been sent to your Georgetown calendar.
If you need to cancel, please do so in InterpretConnect as early as possible.</p>`,
  );

  const slot: SlotInfo = { date, subBlockHour, clinicName, clinicAddress, language, notes };

  await Promise.all([
    sendGmail(volunteerEmail, `Shift Confirmed: ${lang} at ${clinicName} on ${fmtDate(date)}`, html).catch(console.error),
    createCalEvent(signupId, volunteerEmail, slot).catch(console.error),
  ]);

  // Notify clinic via Resend
  const clinicHtml = wrap(
    "New Interpreter Signed Up",
    `<p>A volunteer has signed up for an interpreter slot at your clinic.</p>
${table(
  detail("Volunteer", volunteerName),
  detail("Language", lang),
  detail("Date", fmtDate(date)),
  detail("Time", `${fmt12(subBlockHour)} &ndash; ${fmt12(subBlockHour + 1)}`),
)}`,
  );

  await sendResendEmail(
    clinicContactEmail,
    `New Interpreter Signup: ${lang} on ${fmtDate(date)}`,
    clinicHtml,
  ).catch(console.error);
}

/**
 * Volunteer cancels their own signup.
 * Always sends Gmail confirmation to the volunteer and deletes their calendar event.
 * Only emails the clinic if the cancellation is within 24h of the slot AND
 * the clinic has urgentCancellationAlerts enabled.
 */
export async function notifyVolunteerCancellation(params: {
  signupId: string;
  volunteerEmail: string;
  volunteerName: string;
  clinicName: string;
  clinicContactEmail: string;
  clinicUrgentAlerts: boolean;
  language: string;
  date: Date;
  subBlockHour: number;
  hoursUntilSlot: number;
}): Promise<void> {
  const {
    signupId,
    volunteerEmail,
    volunteerName,
    clinicName,
    clinicContactEmail,
    clinicUrgentAlerts,
    language,
    date,
    subBlockHour,
    hoursUntilSlot,
  } = params;

  const lang = LANG_NAMES[language] ?? language;
  const isUrgent = hoursUntilSlot < 24;

  const volunteerHtml = wrap(
    "Shift Cancelled",
    `<p>Hi ${volunteerName},</p>
<p>Your cancellation has been recorded for the following shift:</p>
${table(
  detail("Date", fmtDate(date)),
  detail("Time", `${fmt12(subBlockHour)} &ndash; ${fmt12(subBlockHour + 1)}`),
  detail("Clinic", clinicName),
  detail("Language", lang),
)}
<p style="font-size:13px;color:#6b7280">The calendar event has been removed from your Georgetown calendar.</p>`,
  );

  const notifications: Promise<void>[] = [
    sendGmail(volunteerEmail, `Shift Cancellation Confirmed: ${clinicName} on ${fmtDate(date)}`, volunteerHtml).catch(console.error),
    deleteCalEvent(signupId).catch(console.error),
  ];

  // Only alert the clinic if it's within 24h and they have urgent alerts on
  if (isUrgent && clinicUrgentAlerts) {
    const clinicHtml = wrap(
      "Urgent: Interpreter Cancelled Within 24 Hours",
      `<p>A volunteer has cancelled their shift <strong>within 24 hours</strong> of the appointment.</p>
${table(
  detail("Volunteer", volunteerName),
  detail("Language", lang),
  detail("Date", fmtDate(date)),
  detail("Time", `${fmt12(subBlockHour)} &ndash; ${fmt12(subBlockHour + 1)}`),
  detail("Time Until Slot", `${Math.max(0, Math.floor(hoursUntilSlot))}h ${Math.round((hoursUntilSlot % 1) * 60)}m`),
)}
<p style="font-size:13px;color:#ef4444;font-weight:600">This slot may now be understaffed. You may want to contact your coordinator.</p>`,
    );
    notifications.push(
      sendResendEmail(
        clinicContactEmail,
        `Urgent: Interpreter Cancelled — ${lang} Today at ${fmt12(subBlockHour)}`,
        clinicHtml,
      ).catch(console.error),
    );
  }

  await Promise.all(notifications);
}

// ─── Clinic-Triggered Slot Notifications (Gmail + Calendar for volunteers) ───

export interface AffectedSignup {
  signupId: string;
  volunteerEmail: string;
  volunteerName: string;
  subBlockHour: number;
}

/**
 * Clinic edits a slot.
 * - Volunteers whose signup hours are outside the new window (cancelled) get a cancellation.
 * - Volunteers still inside the new window get an updated calendar event.
 */
export async function notifySlotUpdated(params: {
  cancelledSignups: AffectedSignup[];
  updatedSignups: AffectedSignup[];
  clinicName: string;
  clinicAddress: string;
  language: string;
  date: Date;
  newDate?: Date;
  notes?: string | null;
}): Promise<void> {
  const { cancelledSignups, updatedSignups, clinicName, clinicAddress, language, date, newDate, notes } = params;
  const lang = LANG_NAMES[language] ?? language;
  const displayDate = newDate ?? date;

  // Notify cancelled volunteers
  await Promise.all(
    cancelledSignups.map(({ signupId, volunteerEmail, volunteerName, subBlockHour }) => {
      const html = wrap(
        "Shift Removed — Slot Updated",
        `<p>Hi ${volunteerName},</p>
<p>The clinic has updated a slot and your <strong>${lang}</strong> shift on <strong>${fmtDate(date)}</strong> at ${fmt12(subBlockHour)} has been removed because it falls outside the new schedule.</p>
${table(
  detail("Original Date", fmtDate(date)),
  detail("Your Time", `${fmt12(subBlockHour)} &ndash; ${fmt12(subBlockHour + 1)}`),
  detail("Clinic", clinicName),
)}
<p style="font-size:13px;color:#6b7280">The calendar event has been removed. Check InterpretConnect for updated availability.</p>`,
      );
      return Promise.all([
        sendGmail(volunteerEmail, `Shift Removed: ${clinicName} on ${fmtDate(date)}`, html).catch(console.error),
        deleteCalEvent(signupId).catch(console.error),
      ]);
    }),
  );

  // Notify updated volunteers
  await Promise.all(
    updatedSignups.map(({ signupId, volunteerEmail, volunteerName, subBlockHour }) => {
      const html = wrap(
        "Shift Updated",
        `<p>Hi ${volunteerName},</p>
<p>Your <strong>${lang}</strong> interpreter shift has been updated by the clinic.</p>
${table(
  detail("Date", fmtDate(displayDate)),
  detail("Your Time", `${fmt12(subBlockHour)} &ndash; ${fmt12(subBlockHour + 1)}`),
  detail("Clinic", clinicName),
  detail("Location", clinicAddress),
  notes ? detail("Notes", notes) : "",
)}
<p style="font-size:13px;color:#6b7280">Your Google Calendar event has been updated to reflect these changes.</p>`,
      );
      const slot: SlotInfo = {
        date: displayDate,
        subBlockHour,
        clinicName,
        clinicAddress,
        language,
        notes,
      };
      return Promise.all([
        sendGmail(volunteerEmail, `Shift Updated: ${clinicName} on ${fmtDate(displayDate)}`, html).catch(console.error),
        updateCalEvent(signupId, volunteerEmail, slot).catch(console.error),
      ]);
    }),
  );
}

/**
 * Clinic deletes/cancels a slot.
 * All active volunteers get a cancellation email and their calendar event deleted.
 */
export async function notifySlotCancelled(params: {
  affectedSignups: AffectedSignup[];
  clinicName: string;
  language: string;
  date: Date;
}): Promise<void> {
  const { affectedSignups, clinicName, language, date } = params;
  const lang = LANG_NAMES[language] ?? language;

  await Promise.all(
    affectedSignups.map(({ signupId, volunteerEmail, volunteerName, subBlockHour }) => {
      const html = wrap(
        "Shift Cancelled by Clinic",
        `<p>Hi ${volunteerName},</p>
<p>The following <strong>${lang}</strong> interpreter shift has been cancelled by the clinic:</p>
${table(
  detail("Date", fmtDate(date)),
  detail("Your Time", `${fmt12(subBlockHour)} &ndash; ${fmt12(subBlockHour + 1)}`),
  detail("Clinic", clinicName),
)}
<p style="font-size:13px;color:#6b7280">The calendar event has been removed from your Georgetown calendar.</p>`,
      );
      return Promise.all([
        sendGmail(volunteerEmail, `Shift Cancelled: ${clinicName} on ${fmtDate(date)}`, html).catch(console.error),
        deleteCalEvent(signupId).catch(console.error),
      ]);
    }),
  );
}

// ─── No-Show Notification ────────────────────────────────────────────────────

/**
 * Clinic marks a volunteer as no-show. Sends a Gmail notification to the volunteer.
 */
export async function notifyNoShow(params: {
  volunteerEmail: string;
  volunteerName: string;
  clinicName: string;
  language: string;
  date: Date;
  subBlockHour: number;
}): Promise<void> {
  const { volunteerEmail, volunteerName, clinicName, language, date, subBlockHour } = params;
  const lang = LANG_NAMES[language] ?? language;

  const html = wrap(
    "No-Show Recorded",
    `<p>Hi ${volunteerName},</p>
<p>You were marked as a <strong>no-show</strong> for the following shift:</p>
${table(
  detail("Date", fmtDate(date)),
  detail("Time", `${fmt12(subBlockHour)} &ndash; ${fmt12(subBlockHour + 1)}`),
  detail("Clinic", clinicName),
  detail("Language", lang),
)}
<p style="font-size:13px;color:#6b7280">If you believe this is an error, please contact your coordinator.
Repeated no-shows may affect your standing as a volunteer.</p>`,
  );

  await sendGmail(
    volunteerEmail,
    `No-Show Recorded: ${clinicName} on ${fmtDate(date)}`,
    html,
  ).catch(console.error);
}

// ─── Admin User Status Notifications ────────────────────────────────────────

/**
 * Admin approves a pending user. Sends a Gmail welcome notification.
 */
export async function notifyUserApproved(params: {
  email: string;
  name: string;
  role: string;
}): Promise<void> {
  const { email, name, role } = params;
  const roleLabel = role === "VOLUNTEER" ? "volunteer" : role === "ADMIN" ? "administrator" : role.toLowerCase();

  const html = wrap(
    "Your Account Has Been Approved",
    `<p>Hi ${name},</p>
<p>Your InterpretConnect account has been <strong>approved</strong>. You can now sign in as a <strong>${roleLabel}</strong>.</p>
<p><a href="${process.env.NEXTAUTH_URL ?? "https://georgetownmedicalinterpreters.org"}/login"
   style="display:inline-block;background:#002147;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none;font-size:14px;font-weight:600">
  Sign In to InterpretConnect
</a></p>`,
  );

  await sendGmail(email, "Your InterpretConnect Account Has Been Approved", html).catch(console.error);
}

/**
 * Admin suspends a user. Sends a Gmail notification.
 */
export async function notifyUserSuspended(params: {
  email: string;
  name: string;
}): Promise<void> {
  const { email, name } = params;

  const html = wrap(
    "Account Suspended",
    `<p>Hi ${name},</p>
<p>Your InterpretConnect account has been <strong>suspended</strong>. You will no longer be able to sign in.</p>
<p style="font-size:13px;color:#6b7280">If you believe this is an error, please contact your program coordinator.</p>`,
  );

  await sendGmail(email, "Your InterpretConnect Account Has Been Suspended", html).catch(console.error);
}
