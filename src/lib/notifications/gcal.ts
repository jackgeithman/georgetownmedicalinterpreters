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
function shiftEventId(shiftId: string): string {
  return shiftId.replace(/-/g, "");
}

function gmiCalendarId(): string {
  return process.env.GOOGLE_GCAL_CALENDAR_ID ?? "primary";
}

function minutesToTimeStr(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:00`;
}

function minutesTo12(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  const period = h < 12 ? "AM" : "PM";
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return m === 0 ? `${h12}:00 ${period}` : `${h12}:${String(m).padStart(2, "0")} ${period}`;
}

export interface ShiftCalInfo {
  date: Date;
  volunteerStart: number;    // minutes from midnight
  volunteerEnd: number;      // minutes from midnight
  travelMinutes: number;
  keyRetrievalTime?: number | null;  // stored commitment start; null = use formula
  keyReturnTime?: number | null;     // stored commitment end;   null = use formula
  clinicName: string;
  clinicAddress: string;
  notes?: string | null;
}

type Attendee = { email?: string | null; organizer?: boolean | null; responseStatus?: string | null };

function buildShiftEventBody(info: ShiftCalInfo, attendees: Attendee[] = []) {
  const senderEmail = process.env.GOOGLE_GMAIL_SENDER_EMAIL!;
  const dateStr = info.date.toISOString().slice(0, 10);

  const driveStart = info.volunteerStart - info.travelMinutes;
  const driveEnd   = info.volunteerEnd   + info.travelMinutes;

  const startStr = `${dateStr}T${minutesToTimeStr(driveStart)}`;
  const endStr   = `${dateStr}T${minutesToTimeStr(driveEnd)}`;

  const lines = [
    "If you need to cancel, please do so as early as possible via the volunteer dashboard.",
    "",
    "── Schedule ──────────────────────────────────────",
    `Depart Georgetown:   ${minutesTo12(driveStart)}`,
    `Interpreting starts: ${minutesTo12(info.volunteerStart)}`,
    `Interpreting ends:   ${minutesTo12(info.volunteerEnd)}`,
    `Return + park:       ${minutesTo12(driveEnd)}`,
    "",
    "── Meeting Location ──────────────────────────────",
    "Meet outside the Leavey Garage on the side of the building",
    "next to Aruppe and Reiss. The van will be parked there once",
    "the driver has retrieved it.",
    "",
    "── Clinic ────────────────────────────────────────",
    info.clinicName,
    info.clinicAddress,
    ...(info.notes ? ["", `Notes: ${info.notes}`] : []),
    "",
    "Georgetown Medical Interpreters",
    "georgetownmedicalinterpreters.org",
    "In the event of an issue with the website or Google Calendar, text Jack Geithman at (425) 877-4701.",
  ];

  // Ensure organizer is always present
  const organizerEntry: Attendee = { email: senderEmail, organizer: true };
  const hasOrganizer = attendees.some((a) => a.email === senderEmail);
  const fullAttendees = hasOrganizer ? attendees : [organizerEntry, ...attendees];

  return {
    summary: `GMI at ${info.clinicName}`,
    location: info.clinicAddress,
    description: lines.join("\n"),
    start: { dateTime: startStr, timeZone: "America/New_York" },
    end:   { dateTime: endStr,   timeZone: "America/New_York" },
    attendees: fullAttendees,
    reminders: {
      useDefault: false,
      overrides: [
        { method: "email", minutes: 24 * 60 },
        { method: "popup", minutes: 60 },
      ],
    },
  };
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

function errStatus(err: unknown): number | undefined {
  return (
    (err as { code?: number })?.code ??
    (err as { response?: { status?: number } })?.response?.status
  );
}

async function fetchAttendees(
  cal: ReturnType<typeof google.calendar>,
  eventId: string,
): Promise<Attendee[]> {
  const res = await cal.events.get({ calendarId: gmiCalendarId(), eventId });
  return (res.data.attendees ?? []) as Attendee[];
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Create a GCal event when a shift is posted.
 * No volunteer attendees yet — just the GMI organizer.
 */
export async function createShiftCalEvent(shiftId: string, info: ShiftCalInfo): Promise<void> {
  if (!process.env.GOOGLE_GMAIL_REFRESH_TOKEN || !process.env.GOOGLE_GMAIL_SENDER_EMAIL) return;
  const cal = google.calendar({ version: "v3", auth: getAuth() });
  const eventId = shiftEventId(shiftId);

  try {
    await cal.events.insert({
      calendarId: gmiCalendarId(),
      sendUpdates: "none",   // no volunteers yet, no emails needed
      requestBody: { id: eventId, ...buildShiftEventBody(info) },
    });
  } catch (err) {
    if (errStatus(err) === 409) {
      // Already exists — update it
      const current = await fetchAttendees(cal, eventId);
      await cal.events.update({
        calendarId: gmiCalendarId(),
        eventId,
        sendUpdates: "all",
        requestBody: { id: eventId, ...buildShiftEventBody(info, current) },
      });
    } else {
      throw err;
    }
  }
}

/**
 * Add a volunteer as a guest to the shift's GCal event.
 * Lazy-creates the event if the shift predates this system.
 * GCal automatically sends an invite email to the volunteer.
 */
export async function addAttendeeToShiftEvent(
  shiftId: string,
  volunteerEmail: string,
  info: ShiftCalInfo,
): Promise<void> {
  if (!process.env.GOOGLE_GMAIL_REFRESH_TOKEN || !process.env.GOOGLE_GMAIL_SENDER_EMAIL) return;
  const cal = google.calendar({ version: "v3", auth: getAuth() });
  const eventId = shiftEventId(shiftId);

  let current: Attendee[];
  try {
    current = await fetchAttendees(cal, eventId);
  } catch (err) {
    if (errStatus(err) === 404) {
      // Shift predates this system — create event first
      await createShiftCalEvent(shiftId, info);
      current = await fetchAttendees(cal, eventId);
    } else {
      throw err;
    }
  }

  // Already a guest — nothing to do (handles re-signup after cancel gracefully)
  if (current.some((a) => a.email === volunteerEmail)) return;

  await cal.events.patch({
    calendarId: gmiCalendarId(),
    eventId,
    sendUpdates: "all",
    requestBody: {
      attendees: [...current, { email: volunteerEmail }],
    },
  });
}

/**
 * Remove a volunteer from the shift's GCal event guest list.
 * GCal automatically sends a cancellation email to the volunteer.
 */
export async function removeAttendeeFromShiftEvent(
  shiftId: string,
  volunteerEmail: string,
): Promise<void> {
  if (!process.env.GOOGLE_GMAIL_REFRESH_TOKEN) return;
  const cal = google.calendar({ version: "v3", auth: getAuth() });
  const eventId = shiftEventId(shiftId);

  try {
    const current = await fetchAttendees(cal, eventId);
    const updated = current.filter((a) => a.email !== volunteerEmail);
    if (updated.length === current.length) return; // not a guest, nothing to do

    await cal.events.patch({
      calendarId: gmiCalendarId(),
      eventId,
      sendUpdates: "all",
      requestBody: { attendees: updated },
    });
  } catch {
    // 404 = shift event doesn't exist yet, nothing to remove
  }
}

/**
 * Update the shift event details when the shift is edited.
 * Preserves the current attendee list and notifies all guests of the change.
 */
export async function updateShiftCalEvent(shiftId: string, info: ShiftCalInfo): Promise<void> {
  if (!process.env.GOOGLE_GMAIL_REFRESH_TOKEN || !process.env.GOOGLE_GMAIL_SENDER_EMAIL) return;
  const cal = google.calendar({ version: "v3", auth: getAuth() });
  const eventId = shiftEventId(shiftId);

  try {
    const current = await fetchAttendees(cal, eventId);
    await cal.events.update({
      calendarId: gmiCalendarId(),
      eventId,
      sendUpdates: "all",
      requestBody: { id: eventId, ...buildShiftEventBody(info, current) },
    });
  } catch (err) {
    if (errStatus(err) === 404) {
      // Shift predates this system — create fresh
      await createShiftCalEvent(shiftId, info);
    } else {
      throw err;
    }
  }
}

/**
 * Delete the shift event when a shift is cancelled.
 * GCal automatically sends cancellation emails to all guests.
 */
export async function deleteShiftCalEvent(shiftId: string): Promise<void> {
  if (!process.env.GOOGLE_GMAIL_REFRESH_TOKEN) return;
  const cal = google.calendar({ version: "v3", auth: getAuth() });
  try {
    await cal.events.delete({
      calendarId: gmiCalendarId(),
      eventId: shiftEventId(shiftId),
      sendUpdates: "all",
    });
  } catch {
    // 404 = event doesn't exist, nothing to do
  }
}
