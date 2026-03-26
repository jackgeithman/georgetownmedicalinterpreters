/**
 * Tests for src/lib/notifications/index.ts
 *
 * Covers:
 *  - notifyVolunteerSignup  → only creates a GCal event (no GMI email)
 *  - notifyVolunteerCancellation → only deletes GCal event + urgent clinic alert logic
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
  clinicAddress: "123 Main St, Washington DC",
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
  it("creates a Google Calendar event for the volunteer", async () => {
    await notifyVolunteerSignup(baseSignupParams);
    expect(mockCreateCalEvent).toHaveBeenCalledTimes(1);
    expect(mockCreateCalEvent).toHaveBeenCalledWith(
      "signup-123",
      "volunteer@georgetown.edu",
      expect.objectContaining({ clinicName: "MedStar Clinic" }),
    );
  });

  it("does NOT send a separate GMI email — GCal invite is the confirmation", async () => {
    await notifyVolunteerSignup(baseSignupParams);
    expect(mockSendGmail).not.toHaveBeenCalled();
  });

  it("does NOT email the clinic", async () => {
    await notifyVolunteerSignup(baseSignupParams);
    expect(mockSendResendEmail).not.toHaveBeenCalled();
  });
});

// ── notifyVolunteerCancellation ───────────────────────────────────────────────

describe("notifyVolunteerCancellation", () => {
  it("deletes the Google Calendar event — GCal sends the cancellation notice", async () => {
    await notifyVolunteerCancellation(baseCancelParams);
    expect(mockDeleteCalEvent).toHaveBeenCalledWith("signup-123");
  });

  it("does NOT send a separate GMI cancellation email", async () => {
    await notifyVolunteerCancellation(baseCancelParams);
    expect(mockSendGmail).not.toHaveBeenCalled();
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

  it("urgent clinic email body includes volunteer name and language", async () => {
    await notifyVolunteerCancellation({ ...baseCancelParams, hoursUntilSlot: 6 });
    const [, , html] = mockSendResendEmail.mock.calls[0];
    expect(html).toContain("Jane Doe");
    expect(html).toContain("Spanish");
  });

  it("urgent clinic email body does not contain 'InterpretConnect'", async () => {
    await notifyVolunteerCancellation({ ...baseCancelParams, hoursUntilSlot: 6 });
    const [, , html] = mockSendResendEmail.mock.calls[0];
    expect(html).not.toContain("InterpretConnect");
  });
});
