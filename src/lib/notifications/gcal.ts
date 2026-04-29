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

/** GCal event IDs must use lowercase [a-v0-9]. UUID hex chars [0-9a-f] are valid. */
function calEventId(positionId: string): string {
  return positionId.replace(/-/g, "");
}

function gmiCalendarId(): string {
  return process.env.GOOGLE_GCAL_CALENDAR_ID ?? "primary";
}

/** Convert minutes-from-midnight to "HH:MM:00" */
function minutesToTimeStr(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:00`;
}

/** Convert minutes-from-midnight to "9:00 AM" or "1:30 PM" */
function minutesTo12(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  const period = h < 12 ? "AM" : "PM";
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return m === 0 ? `${h12}:00 ${period}` : `${h12}:${String(m).padStart(2, "0")} ${period}`;
}

import { langName } from "@/lib/languages";

export interface ShiftPositionInfo {
  date: Date;
  volunteerStart: number;     // XX1, minutes from midnight
  volunteerEnd: number;       // XX2, minutes from midnight
  travelMinutes: number;      // t
  keyRetrievalTime?: number | null;  // stored commitment start (null = use formula)
  keyReturnTime?: number | null;     // stored commitment end   (null = use formula)
  clinicName: string;
  clinicAddress: string;
  language: string;
  isDriver: boolean;
  notes?: string | null;
}

function buildEventBody(volunteerEmail: string, info: ShiftPositionInfo, titlePrefix = "") {
  const lang = langName(info.language);
  const senderEmail = process.env.GOOGLE_GMAIL_SENDER_EMAIL!;
  const dateStr = info.date.toISOString().slice(0, 10); // "YYYY-MM-DD"

  // Full time commitment: use stored values, fall back to formula
  const keyRetrieval = info.keyRetrievalTime ?? (info.volunteerStart - info.travelMinutes - 15);
  const keyReturn    = info.keyReturnTime    ?? (info.volunteerEnd   + info.travelMinutes + 15);

  const startStr = `${dateStr}T${minutesToTimeStr(keyRetrieval)}`;
  const endStr   = `${dateStr}T${minutesToTimeStr(keyReturn)}`;

  const lines = [
    `Role: ${info.isDriver ? "Driver + Interpreter" : "Interpreter"}`,
    `Language: ${lang}`,
    "",
    "── Full Time Commitment ──────────────────",
    `Key retrieval:       ${minutesTo12(keyRetrieval)}`,
    `Depart Georgetown:   ${minutesTo12(info.volunteerStart - info.travelMinutes)}`,
    `Interpreting starts: ${minutesTo12(info.volunteerStart)}`,
    `Interpreting ends:   ${minutesTo12(info.volunteerEnd)}`,
    `Return + park:       ${minutesTo12(info.volunteerEnd + info.travelMinutes)}`,
    `Return key by:       ${minutesTo12(keyReturn)}`,
    "",
    `Clinic: ${info.clinicName}`,
    `Address: ${info.clinicAddress}`,
    ...(info.notes ? [`Notes: ${info.notes}`] : []),
    "",
    "Georgetown Medical Interpreters",
    "georgetownmedicalinterpreters.org",
    "",
    "If you need to cancel, please do so as early as possible via the volunteer dashboard.",
  ];

  const driverLabel = info.isDriver ? " (Driver + Interpreter)" : "";
  return {
    summary: `${titlePrefix}GMI — ${lang}${driverLabel} at ${info.clinicName}`,
    location: info.clinicAddress,
    description: lines.join("\n"),
    start: { dateTime: startStr, timeZone: "America/New_York" },
    end:   { dateTime: endStr,   timeZone: "America/New_York" },
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

export async function createCalEvent(
  positionId: string,
  volunteerEmail: string,
  info: ShiftPositionInfo,
): Promise<void> {
  if (!process.env.GOOGLE_GMAIL_REFRESH_TOKEN || !process.env.GOOGLE_GMAIL_SENDER_EMAIL) return;
  const cal = google.calendar({ version: "v3", auth: getAuth() });
  const eventId = calEventId(positionId);
  const body = buildEventBody(volunteerEmail, info);

  try {
    await cal.events.insert({
      calendarId: gmiCalendarId(),
      sendUpdates: "all",
      requestBody: { id: eventId, ...body },
    });
  } catch (err: unknown) {
    // Google Calendar returns 409 when an event with this ID already exists or was recently
    // deleted (tombstone window). This happens on cancel → re-signup for the same position.
    // Fall back to update, which restores the event and re-sends the invite.
    const status =
      (err as { code?: number })?.code ??
      (err as { response?: { status?: number } })?.response?.status;
    if (status === 409) {
      await cal.events.update({
        calendarId: gmiCalendarId(),
        eventId,
        sendUpdates: "all",
        requestBody: { id: eventId, ...body },
      });
    } else {
      throw err;
    }
  }
}

export async function updateCalEvent(
  positionId: string,
  volunteerEmail: string,
  info: ShiftPositionInfo,
): Promise<void> {
  if (!process.env.GOOGLE_GMAIL_REFRESH_TOKEN || !process.env.GOOGLE_GMAIL_SENDER_EMAIL) return;
  const cal = google.calendar({ version: "v3", auth: getAuth() });
  await cal.events.update({
    calendarId: gmiCalendarId(),
    eventId: calEventId(positionId),
    sendUpdates: "all",
    requestBody: { id: calEventId(positionId), ...buildEventBody(volunteerEmail, info, "[Updated] ") },
  });
}

export async function deleteCalEvent(positionId: string): Promise<void> {
  if (!process.env.GOOGLE_GMAIL_REFRESH_TOKEN) return;
  const cal = google.calendar({ version: "v3", auth: getAuth() });
  try {
    await cal.events.delete({
      calendarId: gmiCalendarId(),
      eventId: calEventId(positionId),
      sendUpdates: "all",
    });
  } catch {
    // 404 = event was never created
  }
}
