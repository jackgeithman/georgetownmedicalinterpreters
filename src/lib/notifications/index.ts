import { sendGmail } from "./gmail";
import {
  addAttendeeToShiftEvent,
  removeAttendeeFromShiftEvent,
  updateShiftCalEvent,
  deleteShiftCalEvent,
  type ShiftCalInfo,
} from "./gcal";
import { sendResendEmail } from "./resend";
import { langName } from "@/lib/languages";

// ─── Helpers ────────────────────────────────────────────────────────────────

function minutesTo12(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  const period = h < 12 ? "AM" : "PM";
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return m === 0 ? `${h12}:00 ${period}` : `${h12}:${String(m).padStart(2, "0")} ${period}`;
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
  return `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px;color:#1a1a1a">
<div style="border-bottom:3px solid #002147;padding-bottom:12px;margin-bottom:24px">
  <h2 style="color:#002147;margin:0;font-size:20px">Georgetown Medical Interpreters</h2>
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

function shiftTimeBlock(params: {
  volunteerStart: number;
  volunteerEnd: number;
  travelMinutes: number;
  keyRetrievalTime?: number | null;
  keyReturnTime?: number | null;
}): string {
  const { volunteerStart, volunteerEnd, travelMinutes } = params;
  const keyRetrieval = params.keyRetrievalTime ?? (volunteerStart - travelMinutes - 15);
  const driveStart   = volunteerStart - travelMinutes;
  const driveEnd     = volunteerEnd   + travelMinutes;
  const keyReturn    = params.keyReturnTime    ?? (volunteerEnd   + travelMinutes + 15);

  return table(
    detail("Key retrieval (driver only)", minutesTo12(keyRetrieval)),
    detail("Depart Georgetown (driver only)", minutesTo12(driveStart)),
    detail("Interpreting", `${minutesTo12(volunteerStart)} &ndash; ${minutesTo12(volunteerEnd)}`),
    detail("Return + park (driver only)", minutesTo12(driveEnd)),
    detail("Return key by (driver only)", minutesTo12(keyReturn)),
  );
}

// ─── Volunteer Signup Notification ──────────────────────────────────────────

/**
 * Volunteer is added to a shift (self-signup or admin-assigned).
 * Adds them as a guest on the shift's GCal event — GCal sends the invite.
 * If byAdmin=true, also sends a Gmail explaining who added them and why.
 */
export async function notifyVolunteerAddedToShift(params: {
  shiftId: string;
  volunteerEmail: string;
  volunteerName: string;
  byAdmin: boolean;
  clinicName: string;
  clinicAddress: string;
  language: string;
  date: Date;
  volunteerStart: number;
  volunteerEnd: number;
  travelMinutes: number;
  keyRetrievalTime?: number | null;
  keyReturnTime?: number | null;
  notes?: string | null;
}): Promise<void> {
  const calInfo: ShiftCalInfo = {
    date: params.date,
    volunteerStart: params.volunteerStart,
    volunteerEnd: params.volunteerEnd,
    travelMinutes: params.travelMinutes,
    keyRetrievalTime: params.keyRetrievalTime,
    keyReturnTime: params.keyReturnTime,
    clinicName: params.clinicName,
    clinicAddress: params.clinicAddress,
    notes: params.notes,
  };

  // Always add to GCal — GCal sends the invite
  await addAttendeeToShiftEvent(params.shiftId, params.volunteerEmail, calInfo).catch(console.error);

  // Only send Gmail when an admin manually assigned them
  if (params.byAdmin) {
    const lang = langName(params.language);
    const html = wrap(
      "You Have Been Added to a Shift",
      `<p>Hi ${params.volunteerName},</p>
<p>An administrator has added you to the following interpreter shift. You should receive a Google Calendar invite shortly.</p>
${table(
  detail("Date", fmtDate(params.date)),
  detail("Clinic", params.clinicName),
  detail("Language", lang),
)}
${shiftTimeBlock(params)}
<p style="font-size:13px;color:#6b7280">If you have questions, please contact your program coordinator.</p>`,
    );
    await sendGmail(
      params.volunteerEmail,
      `Added to Shift: ${params.clinicName} on ${fmtDate(params.date)}`,
      html,
    ).catch(console.error);
  }
}

// ─── Volunteer Cancellation ──────────────────────────────────────────────────

/**
 * Volunteer cancels their shift position.
 * Deletes GCal event (GCal sends its own cancellation email).
 * Alerts clinic contact if cancellation is within 24h.
 */
export async function notifyVolunteerCancellation(params: {
  shiftId: string;
  volunteerEmail: string;
  clinicName: string;
  clinicContactEmail: string;
  language: string;
  date: Date;
  volunteerStart: number;
  volunteerEnd: number;
  isWithin24h: boolean;
}): Promise<void> {
  const {
    shiftId,
    volunteerEmail,
    clinicName,
    clinicContactEmail,
    language,
    date,
    volunteerStart,
    volunteerEnd,
    isWithin24h,
  } = params;

  const lang = langName(language);
  // Remove from shift GCal event — GCal sends cancellation email automatically
  const notifications: Promise<void>[] = [
    removeAttendeeFromShiftEvent(shiftId, volunteerEmail).catch(console.error),
  ];

  // Alert clinic on urgent same-day cancellations
  if (isWithin24h) {
    const clinicHtml = wrap(
      "Urgent: Interpreter Cancelled Within 24 Hours",
      `<p>A volunteer has cancelled their shift <strong>within 24 hours</strong> of the appointment.</p>
${table(
  detail("Volunteer Email", volunteerEmail),
  detail("Language", lang),
  detail("Date", fmtDate(date)),
  detail("Interpreting window", `${minutesTo12(volunteerStart)} &ndash; ${minutesTo12(volunteerEnd)}`),
)}
<p style="font-size:13px;color:#ef4444;font-weight:600">This position is now open. You may want to contact your coordinator.</p>`,
    );
    notifications.push(
      sendResendEmail(
        clinicContactEmail,
        `Urgent: Interpreter Cancelled — ${lang} on ${fmtDate(date)}`,
        clinicHtml,
      ).catch(console.error),
    );
  }

  await Promise.all(notifications);
}

// ─── Shift Updated/Cancelled (Admin) ────────────────────────────────────────

export interface AffectedPosition {
  positionId: string;
  volunteerEmail: string;
  volunteerName: string;
  language: string;
  isDriver: boolean;
}

/**
 * Admin edits a shift in a way that displaces volunteers.
 * Sends cancellation emails + deletes GCal events for displaced volunteers.
 */
export async function notifyShiftUpdated(params: {
  shift: {
    clinic: { name: string; address: string };
    date: Date;
    volunteerStart: number;
    volunteerEnd: number;
    travelMinutes: number;
  };
  cancelledEmails: string[];
}): Promise<void> {
  const { shift, cancelledEmails } = params;

  await Promise.all(
    cancelledEmails.map((email) => {
      const html = wrap(
        "Your Shift Position Has Been Removed",
        `<p>The administrator has updated a shift and your position has been removed.</p>
${table(
  detail("Date", fmtDate(shift.date)),
  detail("Clinic", shift.clinic.name),
  detail("Interpreting", `${minutesTo12(shift.volunteerStart)} &ndash; ${minutesTo12(shift.volunteerEnd)}`),
)}
<p style="font-size:13px;color:#6b7280">Your calendar event has been removed. Please check the volunteer dashboard for updated availability.</p>`,
      );
      return sendGmail(email, `Shift Updated — ${shift.clinic.name} on ${fmtDate(shift.date)}`, html).catch(console.error);
    }),
  );
}

/**
 * Admin cancels a shift entirely.
 * Deletes the shift GCal event — GCal notifies all guests automatically.
 * Also sends a Gmail to each affected volunteer so they know it was cancelled by admin.
 */
export async function notifyShiftCancelled(params: {
  shiftId: string;
  shift: {
    clinic: { name: string };
    date: Date;
    volunteerStart: number;
    volunteerEnd: number;
  };
  volunteerEmails: string[];
}): Promise<void> {
  const { shiftId, shift, volunteerEmails } = params;

  // Delete the shift event — GCal cancels all guests in one shot
  await deleteShiftCalEvent(shiftId).catch(console.error);

  // Also send Gmail so volunteers know it was an admin cancellation (not a glitch)
  await Promise.all(
    volunteerEmails.map((email) => {
      const html = wrap(
        "Shift Cancelled",
        `<p>The following shift has been cancelled by the administrator:</p>
${table(
  detail("Date", fmtDate(shift.date)),
  detail("Clinic", shift.clinic.name),
  detail("Interpreting", `${minutesTo12(shift.volunteerStart)} &ndash; ${minutesTo12(shift.volunteerEnd)}`),
)}
<p style="font-size:13px;color:#6b7280">Your Google Calendar invite has been cancelled. Check the dashboard for other available shifts.</p>`,
      );
      return sendGmail(email, `Shift Cancelled — ${shift.clinic.name} on ${fmtDate(shift.date)}`, html).catch(console.error);
    }),
  );
}

// ─── No-Show Notification ────────────────────────────────────────────────────

export async function notifyNoShow(params: {
  volunteerEmail: string;
  volunteerName: string;
  clinicName: string;
  language: string;
  date: Date;
  volunteerStart: number;
  volunteerEnd: number;
}): Promise<void> {
  const { volunteerEmail, volunteerName, clinicName, language, date, volunteerStart, volunteerEnd } = params;
  const lang = langName(language);

  const html = wrap(
    "No-Show Recorded",
    `<p>Hi ${volunteerName},</p>
<p>You were marked as a <strong>no-show</strong> for the following shift:</p>
${table(
  detail("Date", fmtDate(date)),
  detail("Interpreting", `${minutesTo12(volunteerStart)} &ndash; ${minutesTo12(volunteerEnd)}`),
  detail("Clinic", clinicName),
  detail("Language", lang),
)}
<p style="font-size:13px;color:#6b7280">If you believe this is an error, please contact your coordinator.
Repeated no-shows may affect your standing as a volunteer.</p>`,
  );

  await sendGmail(volunteerEmail, `No-Show Recorded: ${clinicName} on ${fmtDate(date)}`, html).catch(console.error);
}

// ─── Admin removed a volunteer from a position ───────────────────────────────

export async function notifyAdminRemovedFromPosition(params: {
  shiftId: string;
  volunteerEmail: string;
  volunteerName: string;
  clinicName: string;
  language: string;
  date: Date;
  volunteerStart: number;
  volunteerEnd: number;
}): Promise<void> {
  const { shiftId, volunteerEmail, volunteerName, clinicName, language, date, volunteerStart, volunteerEnd } = params;
  const lang = langName(language);

  const html = wrap(
    "You Have Been Removed From a Shift",
    `<p>Hi ${volunteerName},</p>
<p>An administrator has removed you from the following interpreter shift. Your Google Calendar invite has been cancelled.</p>
${table(
  detail("Date", fmtDate(date)),
  detail("Interpreting", `${minutesTo12(volunteerStart)} &ndash; ${minutesTo12(volunteerEnd)}`),
  detail("Clinic", clinicName),
  detail("Language", lang),
)}
<p style="font-size:13px;color:#6b7280">If you have questions, please contact your program coordinator.</p>`,
  );

  await Promise.all([
    sendGmail(volunteerEmail, `Removed From Shift: ${clinicName} on ${fmtDate(date)}`, html).catch(console.error),
    removeAttendeeFromShiftEvent(shiftId, volunteerEmail).catch(console.error),
  ]);
}

// ─── Language Clearance Notifications ───────────────────────────────────────

export async function notifyLanguageCleared(params: {
  volunteerEmail: string;
  volunteerName: string;
  languageName: string;
}): Promise<void> {
  const { volunteerEmail, volunteerName, languageName } = params;
  const html = wrap(
    `Language Clearance Approved — ${languageName}`,
    `<p>Hi ${volunteerName},</p>
<p>You have been <strong>cleared</strong> to interpret in <strong>${languageName}</strong>. You can now sign up for ${languageName} interpreter shifts.</p>
<p><a href="${process.env.NEXTAUTH_URL ?? "https://georgetownmedicalinterpreters.org"}/dashboard/browse"
   style="display:inline-block;background:#002147;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none;font-size:14px;font-weight:600">
  Browse Available Shifts
</a></p>`,
  );
  await sendGmail(volunteerEmail, `Clearance Approved: ${languageName} Interpreter`, html).catch(console.error);
}

export async function notifyLanguageDenied(params: {
  volunteerEmail: string;
  volunteerName: string;
  languageName: string;
}): Promise<void> {
  const { volunteerEmail, volunteerName, languageName } = params;
  const html = wrap(
    `Language Clearance Not Approved — ${languageName}`,
    `<p>Hi ${volunteerName},</p>
<p>Your clearance request for <strong>${languageName}</strong> has not been approved at this time.</p>
<p style="font-size:13px;color:#6b7280">If you have questions, please contact your program coordinator.</p>`,
  );
  await sendGmail(volunteerEmail, `Clearance Not Approved: ${languageName}`, html).catch(console.error);
}

// ─── Admin User Status Notifications ────────────────────────────────────────

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
<p>Your Georgetown Medical Interpreters account has been <strong>approved</strong>. You can now sign in as a <strong>${roleLabel}</strong>.</p>
<p><a href="${process.env.NEXTAUTH_URL ?? "https://georgetownmedicalinterpreters.org"}/login"
   style="display:inline-block;background:#002147;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none;font-size:14px;font-weight:600">
  Sign In to Georgetown Medical Interpreters
</a></p>`,
  );
  await sendGmail(email, "Your Georgetown Medical Interpreters Account Has Been Approved", html).catch(console.error);
}

const ROLE_LABEL_MAP: Record<string, string> = {
  VOLUNTEER: "Volunteer",
  INSTRUCTOR: "Instructor",
  ADMIN: "Admin",
};

export async function sendOnboardingConfirmation(params: {
  email: string;
  name: string;
  roles: string[];
}): Promise<void> {
  const { email, name, roles } = params;
  const roleList = roles.map((r) => ROLE_LABEL_MAP[r] ?? r).join(", ");
  const html = wrap(
    "We've Received Your Account Request",
    `<p>Hi ${name},</p>
<p>Thanks for signing up for Georgetown Medical Interpreters. Your request has been submitted and is pending review by an admin.</p>
${table(
  detail("Roles requested", roleList),
  detail("Email", email),
)}
<p style="font-size:13px;color:#6b7280">You'll receive an email once your access has been cleared. No further action is needed.</p>`,
  );
  await sendGmail(email, "GMI Account Request Received", html).catch(console.error);
}

export async function notifyRolesApproved(params: {
  email: string;
  name: string;
  approvedRoles: string[];
}): Promise<void> {
  const { email, name, approvedRoles } = params;
  const roleList = approvedRoles.map((r) => ROLE_LABEL_MAP[r] ?? r).join(", ");
  const plural = approvedRoles.length > 1;
  const html = wrap(
    `Your ${plural ? "Roles Have" : "Role Has"} Been Approved`,
    `<p>Hi ${name},</p>
<p>Your Georgetown Medical Interpreters ${plural ? "roles have" : "role has"} been <strong>approved</strong>.</p>
${table(detail(plural ? "Approved roles" : "Approved role", roleList))}
<p><a href="${process.env.NEXTAUTH_URL ?? "https://georgetownmedicalinterpreters.org"}/login"
   style="display:inline-block;background:#002147;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none;font-size:14px;font-weight:600">
  Sign In to Georgetown Medical Interpreters
</a></p>`,
  );
  await sendGmail(email, "GMI Account Approved — You're All Set", html).catch(console.error);
}

export async function notifyRolesRejected(params: {
  email: string;
  name: string;
  rejectedRoles: string[];
}): Promise<void> {
  const { email, name, rejectedRoles } = params;
  const roleList = rejectedRoles.map((r) => ROLE_LABEL_MAP[r] ?? r).join(", ");
  const plural = rejectedRoles.length > 1;
  const siteUrl = process.env.NEXTAUTH_URL ?? "https://georgetownmedicalinterpreters.org";
  const html = wrap(
    "Your Account Request Was Not Approved",
    `<p>Hi ${name},</p>
<p>Your request for the following ${plural ? "roles has" : "role has"} not been approved at this time:</p>
${table(detail(plural ? "Requested roles" : "Requested role", roleList))}
<p><a href="${siteUrl}/rejected"
   style="display:inline-block;background:#002147;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none;font-size:14px;font-weight:600">
  Contact Us
</a></p>`,
  );
  await sendGmail(email, "GMI Account Request — Not Approved", html).catch(console.error);
}

export async function notifyUserSuspended(params: {
  email: string;
  name: string;
}): Promise<void> {
  const { email, name } = params;
  const html = wrap(
    "Account Suspended",
    `<p>Hi ${name},</p>
<p>Your Georgetown Medical Interpreters account has been <strong>suspended</strong>. You will no longer be able to sign in.</p>
<p style="font-size:13px;color:#6b7280">If you believe this is an error, please contact your program coordinator.</p>`,
  );
  await sendGmail(email, "Your Georgetown Medical Interpreters Account Has Been Suspended", html).catch(console.error);
}

// keep shiftTimeBlock exported for use in email templates if needed
export { shiftTimeBlock };
