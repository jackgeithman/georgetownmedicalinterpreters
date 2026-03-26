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

/**
 * Derives a Google Calendar-safe event ID from a signup UUID.
 * GCal IDs must use lowercase [a-v0-9]. UUID hex chars [0-9a-f] are a valid subset.
 */
function calEventId(signupId: string): string {
  return signupId.replace(/-/g, "");
}

export interface SlotInfo {
  date: Date;
  subBlockHour: number;
  clinicName: string;
  clinicAddress: string;
  language: string;
  notes?: string | null;
}

const LANG_NAMES: Record<string, string> = {
  ES: "Spanish",
  ZH: "Chinese (Mandarin)",
  KO: "Korean",
  AR: "Arabic",
};

function buildEventBody(volunteerEmail: string, slot: SlotInfo, titlePrefix = "") {
  const lang = LANG_NAMES[slot.language] ?? slot.language;
  const senderEmail = process.env.GOOGLE_GMAIL_SENDER_EMAIL!;

  // Slot dates are stored at noon UTC. Build a local datetime string (no UTC
  // conversion) and pass timeZone explicitly so Google Calendar interprets the
  // hour as Eastern time regardless of where the server runs.
  const dateStr = slot.date.toISOString().slice(0, 10); // "YYYY-MM-DD"
  const pad = (n: number) => String(n).padStart(2, "0");
  const startStr = `${dateStr}T${pad(slot.subBlockHour)}:00:00`;
  const endStr = `${dateStr}T${pad(slot.subBlockHour + 1)}:00:00`;

  return {
    summary: `${titlePrefix}Medical Interpreter — ${lang} at ${slot.clinicName}`,
    location: slot.clinicAddress,
    description:
      (slot.notes ? `Notes: ${slot.notes}\n\n` : "") +
      "Managed by Georgetown Medical Interpreters",
    start: { dateTime: startStr, timeZone: "America/New_York" },
    end: { dateTime: endStr, timeZone: "America/New_York" },
    attendees: [
      { email: senderEmail, organizer: true },
      { email: volunteerEmail },
    ],
    reminders: {
      useDefault: false,
      overrides: [
        { method: "email", minutes: 24 * 60 },
        { method: "popup", minutes: 60 },
      ],
    },
  };
}

/**
 * Returns the GMI Google Calendar ID to use.
 * Set GOOGLE_GCAL_CALENDAR_ID to a specific calendar's ID (found in Google Calendar settings).
 * Falls back to "primary" only if the env var is unset.
 */
function gmiCalendarId(): string {
  return process.env.GOOGLE_GCAL_CALENDAR_ID ?? "primary";
}

/**
 * Creates a Google Calendar event in the GMI calendar for a volunteer signup.
 * The volunteer is added as an attendee — they receive an invite and the event
 * appears in their own Google Calendar. No one else can see it unless they have
 * access to either the GMI calendar or the volunteer's calendar.
 */
export async function createCalEvent(
  signupId: string,
  volunteerEmail: string,
  slot: SlotInfo,
): Promise<void> {
  if (!process.env.GOOGLE_GMAIL_REFRESH_TOKEN || !process.env.GOOGLE_GMAIL_SENDER_EMAIL) return;
  const cal = google.calendar({ version: "v3", auth: getAuth() });
  await cal.events.insert({
    calendarId: gmiCalendarId(),
    sendUpdates: "all",
    requestBody: { id: calEventId(signupId), ...buildEventBody(volunteerEmail, slot) },
  });
}

/**
 * Updates an existing GMI calendar event (e.g. when a clinic edits a slot).
 * Sends update emails to all attendees.
 */
export async function updateCalEvent(
  signupId: string,
  volunteerEmail: string,
  slot: SlotInfo,
): Promise<void> {
  if (!process.env.GOOGLE_GMAIL_REFRESH_TOKEN || !process.env.GOOGLE_GMAIL_SENDER_EMAIL) return;
  const cal = google.calendar({ version: "v3", auth: getAuth() });
  await cal.events.update({
    calendarId: gmiCalendarId(),
    eventId: calEventId(signupId),
    sendUpdates: "all",
    requestBody: {
      id: calEventId(signupId),
      ...buildEventBody(volunteerEmail, slot, "[Updated] "),
    },
  });
}

/**
 * Deletes a GMI calendar event (cancellation). Sends cancellation emails to all attendees.
 * Silently ignores 404 if the event was never created.
 */
export async function deleteCalEvent(signupId: string): Promise<void> {
  if (!process.env.GOOGLE_GMAIL_REFRESH_TOKEN) return;
  const cal = google.calendar({ version: "v3", auth: getAuth() });
  try {
    await cal.events.delete({
      calendarId: gmiCalendarId(),
      eventId: calEventId(signupId),
      sendUpdates: "all",
    });
  } catch {
    // 404 means event was never created (e.g. Calendar API was not configured at signup time)
  }
}
