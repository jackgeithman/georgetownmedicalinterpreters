/**
 * Tests for src/lib/email.ts
 *
 * Covers:
 *  - sendClinicDailySummary → shows slot table when slots exist
 *  - sendClinicDailySummary → shows "no slots" nudge when slots array is empty
 *  - No "InterpretConnect" branding in any outbound email
 */

// Mock the Resend SDK so no real HTTP calls are made
const mockSend = jest.fn().mockResolvedValue({ data: { id: "mock-id" }, error: null });

jest.mock("resend", () => ({
  Resend: jest.fn().mockImplementation(() => ({
    emails: { send: mockSend },
  })),
}));

// Provide required env vars
process.env.RESEND_API_KEY = "re_test_key";
process.env.NEXTAUTH_URL = "https://georgetownmedicalinterpreters.org";

import {
  sendClinicDailySummary,
  sendSignupReceipt,
  sendCancellationReceipt,
  sendReminder,
  sendClinicVolunteerCancelAlert,
  sendClinicUnfilledAlert,
  sendAdminPendingVolunteerAlert,
} from "../lib/email";

const slotBase = {
  date: new Date("2026-04-01T12:00:00Z"),
  startTime: 9,
  endTime: 11,
  language: "Spanish",
  interpreterCount: 2,
  signedUp: 1,
  notes: null,
};

beforeEach(() => {
  jest.clearAllMocks();
  delete process.env.DISABLE_EMAIL;
});

// ── sendClinicDailySummary ────────────────────────────────────────────────────

describe("sendClinicDailySummary", () => {
  it("sends an email with a slot table when slots exist", async () => {
    await sendClinicDailySummary({
      to: "clinic@example.com",
      clinicName: "Test Clinic",
      slots: [slotBase],
    });

    expect(mockSend).toHaveBeenCalledTimes(1);
    const payload = mockSend.mock.calls[0][0];
    expect(payload.html).toContain("Spanish");
    expect(payload.html).toContain("1 / 2");
  });

  it("sends an email even when there are no slots", async () => {
    await sendClinicDailySummary({
      to: "clinic@example.com",
      clinicName: "Empty Clinic",
      slots: [],
    });

    expect(mockSend).toHaveBeenCalledTimes(1);
  });

  it("no-slots email contains a prompt to create slots", async () => {
    await sendClinicDailySummary({
      to: "clinic@example.com",
      clinicName: "Empty Clinic",
      slots: [],
    });

    const { html } = mockSend.mock.calls[0][0];
    expect(html).toContain("no upcoming interpreter slots");
    expect(html).toContain("create slots");
  });

  it("no-slots email does NOT contain the slot table", async () => {
    await sendClinicDailySummary({
      to: "clinic@example.com",
      clinicName: "Empty Clinic",
      slots: [],
    });

    const { html } = mockSend.mock.calls[0][0];
    expect(html).not.toContain("<table");
  });

  it("no-slots email contains a link to the dashboard", async () => {
    await sendClinicDailySummary({
      to: "clinic@example.com",
      clinicName: "Empty Clinic",
      slots: [],
    });

    const { html } = mockSend.mock.calls[0][0];
    expect(html).toContain("georgetownmedicalinterpreters.org");
  });

  it("subject contains the clinic name", async () => {
    await sendClinicDailySummary({
      to: "clinic@example.com",
      clinicName: "Georgetown Pediatrics",
      slots: [],
    });

    const { subject } = mockSend.mock.calls[0][0];
    expect(subject).toContain("Georgetown Pediatrics");
  });
});

// ── No "InterpretConnect" branding ────────────────────────────────────────────

describe("branding — no InterpretConnect references", () => {
  const noInterpretConnect = (html: string) =>
    expect(html).not.toContain("InterpretConnect");

  it("sendSignupReceipt", async () => {
    await sendSignupReceipt({
      to: "v@georgetown.edu",
      volunteerName: "Jane",
      clinicName: "Clinic A",
      date: new Date("2026-04-01T12:00:00Z"),
      subBlockHour: 9,
      language: "Spanish",
    });
    noInterpretConnect(mockSend.mock.calls[0][0].html);
  });

  it("sendCancellationReceipt", async () => {
    await sendCancellationReceipt({
      to: "v@georgetown.edu",
      volunteerName: "Jane",
      clinicName: "Clinic A",
      date: new Date("2026-04-01T12:00:00Z"),
      subBlockHour: 9,
    });
    noInterpretConnect(mockSend.mock.calls[0][0].html);
  });

  it("sendReminder", async () => {
    await sendReminder({
      to: "v@georgetown.edu",
      volunteerName: "Jane",
      clinicName: "Clinic A",
      clinicAddress: "123 Main St",
      date: new Date("2026-04-01T12:00:00Z"),
      subBlockHour: 9,
      language: "Spanish",
      hoursUntil: 24,
    });
    noInterpretConnect(mockSend.mock.calls[0][0].html);
  });

  it("sendClinicVolunteerCancelAlert", async () => {
    await sendClinicVolunteerCancelAlert({
      to: "clinic@example.com",
      clinicName: "Clinic A",
      volunteerName: "Jane",
      date: new Date("2026-04-01T12:00:00Z"),
      subBlockHour: 9,
      filledAfterCancel: 0,
      needed: 1,
    });
    noInterpretConnect(mockSend.mock.calls[0][0].html);
  });

  it("sendClinicUnfilledAlert", async () => {
    await sendClinicUnfilledAlert({
      to: "clinic@example.com",
      clinicName: "Clinic A",
      date: new Date("2026-04-01T12:00:00Z"),
      startTime: 9,
      endTime: 11,
      unfilledHours: [{ hour: 9, filled: 0, needed: 1 }],
    });
    noInterpretConnect(mockSend.mock.calls[0][0].html);
  });

  it("sendAdminPendingVolunteerAlert", async () => {
    await sendAdminPendingVolunteerAlert({
      to: "admin@georgetown.edu",
      pendingCount: 1,
      volunteers: [{ name: "Jane", email: "jane@georgetown.edu", waitingHours: 26 }],
    });
    noInterpretConnect(mockSend.mock.calls[0][0].html);
  });

  it("sendClinicDailySummary", async () => {
    await sendClinicDailySummary({
      to: "clinic@example.com",
      clinicName: "Clinic A",
      slots: [slotBase],
    });
    noInterpretConnect(mockSend.mock.calls[0][0].html);
  });
});

// ── DISABLE_EMAIL guard ───────────────────────────────────────────────────────

describe("DISABLE_EMAIL", () => {
  it("suppresses all sends when DISABLE_EMAIL=true", async () => {
    process.env.DISABLE_EMAIL = "true";
    await sendClinicDailySummary({
      to: "clinic@example.com",
      clinicName: "Test Clinic",
      slots: [slotBase],
    });
    expect(mockSend).not.toHaveBeenCalled();
  });
});
