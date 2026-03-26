/**
 * Tests for src/lib/notifications/index.ts
 *
 * Covers:
 *  - notifyVolunteerSignup  → should NOT email clinic (removed feature)
 *  - notifyVolunteerCancellation → urgent alert logic (clinic only gets email
 *    when cancellation is <24h AND urgentCancellationAlerts is true)
 */

jest.mock("../lib/notifications/gmail", () => ({
  sendGmail: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("../lib/notifications/gcal", () => ({
  createCalEvent: jest.fn().mockResolvedValue(undefined),
  deleteCalEvent: jest.fn().mockResolvedValue(undefined),
  updateCalEvent: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("../lib/notifications/resend", () => ({
  sendResendEmail: jest.fn().mockResolvedValue(undefined),
}));

import { sendGmail } from "../lib/notifications/gmail";
import { createCalEvent, deleteCalEvent } from "../lib/notifications/gcal";
import { sendResendEmail } from "../lib/notifications/resend";
import {
  notifyVolunteerSignup,
  notifyVolunteerCancellation,
} from "../lib/notifications";

const mockSendGmail = sendGmail as jest.Mock;
const mockCreateCalEvent = createCalEvent as jest.Mock;
const mockDeleteCalEvent = deleteCalEvent as jest.Mock;
const mockSendResendEmail = sendResendEmail as jest.Mock;

const baseSignupParams = {
  signupId: "signup-123",
  volunteerEmail: "volunteer@georgetown.edu",
  volunteerName: "Jane Doe",
  clinicName: "MedStar Clinic",
  clinicAddress: "123 Main St, Washington DC",
  language: "ES",
  date: new Date("2026-04-01T12:00:00Z"),
  subBlockHour: 9,
  notes: null,
};

const baseCancelParams = {
  signupId: "signup-123",
  volunteerEmail: "volunteer@georgetown.edu",
  volunteerName: "Jane Doe",
  clinicName: "MedStar Clinic",
  clinicContactEmail: "clinic@medstar.org",
  clinicUrgentAlerts: true,
  language: "ES",
  date: new Date("2026-04-01T12:00:00Z"),
  subBlockHour: 9,
  hoursUntilSlot: 48,
};

beforeEach(() => {
  jest.clearAllMocks();
});

// ── notifyVolunteerSignup ─────────────────────────────────────────────────────

describe("notifyVolunteerSignup", () => {
  it("sends a confirmation email to the volunteer", async () => {
    await notifyVolunteerSignup(baseSignupParams);
    expect(mockSendGmail).toHaveBeenCalledTimes(1);
    expect(mockSendGmail).toHaveBeenCalledWith(
      "volunteer@georgetown.edu",
      expect.stringContaining("Shift Confirmed"),
      expect.any(String),
    );
  });

  it("creates a Google Calendar event for the volunteer", async () => {
    await notifyVolunteerSignup(baseSignupParams);
    expect(mockCreateCalEvent).toHaveBeenCalledTimes(1);
    expect(mockCreateCalEvent).toHaveBeenCalledWith(
      "signup-123",
      "volunteer@georgetown.edu",
      expect.objectContaining({ clinicName: "MedStar Clinic" }),
    );
  });

  it("does NOT email the clinic when a volunteer signs up", async () => {
    await notifyVolunteerSignup(baseSignupParams);
    expect(mockSendResendEmail).not.toHaveBeenCalled();
  });

  it("email subject includes the language and clinic name", async () => {
    await notifyVolunteerSignup(baseSignupParams);
    const [, subject] = mockSendGmail.mock.calls[0];
    expect(subject).toContain("Spanish");
    expect(subject).toContain("MedStar Clinic");
  });

  it("email body does not contain 'InterpretConnect'", async () => {
    await notifyVolunteerSignup(baseSignupParams);
    const [, , html] = mockSendGmail.mock.calls[0];
    expect(html).not.toContain("InterpretConnect");
  });
});

// ── notifyVolunteerCancellation ───────────────────────────────────────────────

describe("notifyVolunteerCancellation", () => {
  it("always sends a cancellation email to the volunteer", async () => {
    await notifyVolunteerCancellation(baseCancelParams);
    expect(mockSendGmail).toHaveBeenCalledTimes(1);
    expect(mockSendGmail).toHaveBeenCalledWith(
      "volunteer@georgetown.edu",
      expect.stringContaining("Shift Cancellation Confirmed"),
      expect.any(String),
    );
  });

  it("always deletes the Google Calendar event", async () => {
    await notifyVolunteerCancellation(baseCancelParams);
    expect(mockDeleteCalEvent).toHaveBeenCalledWith("signup-123");
  });

  it("does NOT alert the clinic when cancellation is more than 24h out", async () => {
    await notifyVolunteerCancellation({ ...baseCancelParams, hoursUntilSlot: 48 });
    expect(mockSendResendEmail).not.toHaveBeenCalled();
  });

  it("does NOT alert the clinic when urgentCancellationAlerts is false, even within 24h", async () => {
    await notifyVolunteerCancellation({
      ...baseCancelParams,
      hoursUntilSlot: 2,
      clinicUrgentAlerts: false,
    });
    expect(mockSendResendEmail).not.toHaveBeenCalled();
  });

  it("DOES alert the clinic when cancellation is within 24h AND urgentCancellationAlerts is true", async () => {
    await notifyVolunteerCancellation({ ...baseCancelParams, hoursUntilSlot: 6 });
    expect(mockSendResendEmail).toHaveBeenCalledTimes(1);
    expect(mockSendResendEmail).toHaveBeenCalledWith(
      "clinic@medstar.org",
      expect.stringContaining("Urgent"),
      expect.any(String),
    );
  });

  it("urgent clinic email body includes the volunteer name and language", async () => {
    await notifyVolunteerCancellation({ ...baseCancelParams, hoursUntilSlot: 6 });
    const [, , html] = mockSendResendEmail.mock.calls[0];
    expect(html).toContain("Jane Doe");
    expect(html).toContain("Spanish");
  });

  it("cancellation email body does not contain 'InterpretConnect'", async () => {
    await notifyVolunteerCancellation({ ...baseCancelParams, hoursUntilSlot: 6 });
    const [, , volunteerHtml] = mockSendGmail.mock.calls[0];
    expect(volunteerHtml).not.toContain("InterpretConnect");
    const [, , clinicHtml] = mockSendResendEmail.mock.calls[0];
    expect(clinicHtml).not.toContain("InterpretConnect");
  });
});
