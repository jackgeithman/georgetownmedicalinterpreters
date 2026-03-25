import { Resend } from "resend";

// Set DISABLE_EMAIL=true in .env to suppress all sends during local development
function emailDisabled() {
  return process.env.DISABLE_EMAIL === "true";
}

// Lazy singleton — avoids instantiation at build time when env vars aren't present
let _resend: Resend | null = null;
function resend() {
  if (!_resend) _resend = new Resend(process.env.RESEND_API_KEY);
  return _resend;
}
function FROM() {
  return process.env.EMAIL_FROM ?? "GMI Notifications <notifications@georgetownmedicalinterpreters.org>";
}

function fmt(date: Date) {
  return date.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });
}
function fmtTime(hour: number) {
  const ampm = hour < 12 ? "AM" : "PM";
  const h = hour % 12 === 0 ? 12 : hour % 12;
  return `${h}:00 ${ampm}`;
}

async function send(payload: Parameters<ReturnType<typeof resend>["emails"]["send"]>[0]) {
  if (emailDisabled()) {
    console.log("[email disabled]", payload.subject, "→", payload.to);
    return;
  }
  console.log("[email] sending:", payload.subject, "→", payload.to);
  const result = await resend().emails.send(payload);
  console.log("[email] result:", JSON.stringify(result));
}

// ── Volunteer emails ──────────────────────────────────────────────────────────

export async function sendSignupReceipt(opts: {
  to: string;
  volunteerName: string;
  clinicName: string;
  date: Date;
  subBlockHour: number;
  language: string;
}) {
  await send({
    from: FROM(),
    to: opts.to,
    subject: `You're signed up — ${fmt(opts.date)} at ${fmtTime(opts.subBlockHour)}`,
    html: `<p>Hi ${opts.volunteerName},</p>
<p>This confirms your signup for:</p>
<ul>
  <li><strong>Clinic:</strong> ${opts.clinicName}</li>
  <li><strong>Date:</strong> ${fmt(opts.date)}</li>
  <li><strong>Time:</strong> ${fmtTime(opts.subBlockHour)} – ${fmtTime(opts.subBlockHour + 1)}</li>
  <li><strong>Language:</strong> ${opts.language}</li>
</ul>
<p>Thank you for volunteering with Georgetown Medical Interpreters!</p>`,
  });
}

export async function sendCancellationReceipt(opts: {
  to: string;
  volunteerName: string;
  clinicName: string;
  date: Date;
  subBlockHour: number;
}) {
  await send({
    from: FROM(),
    to: opts.to,
    subject: `Signup cancelled — ${fmt(opts.date)} at ${fmtTime(opts.subBlockHour)}`,
    html: `<p>Hi ${opts.volunteerName},</p>
<p>Your signup has been cancelled:</p>
<ul>
  <li><strong>Clinic:</strong> ${opts.clinicName}</li>
  <li><strong>Date:</strong> ${fmt(opts.date)}</li>
  <li><strong>Time:</strong> ${fmtTime(opts.subBlockHour)} – ${fmtTime(opts.subBlockHour + 1)}</li>
</ul>
<p>If this was a mistake, log in to re-sign up while the slot is still available.</p>`,
  });
}

export async function sendReminder(opts: {
  to: string;
  volunteerName: string;
  clinicName: string;
  clinicAddress: string;
  date: Date;
  subBlockHour: number;
  language: string;
  hoursUntil: number;
}) {
  const label = opts.hoursUntil === 24 ? "24 hours" : opts.hoursUntil === 8 ? "8 hours" : "2 hours";
  await send({
    from: FROM(),
    to: opts.to,
    subject: `Reminder: shift in ${label} — ${fmt(opts.date)}`,
    html: `<p>Hi ${opts.volunteerName},</p>
<p>This is a reminder that your shift is in <strong>${label}</strong>:</p>
<ul>
  <li><strong>Clinic:</strong> ${opts.clinicName}</li>
  <li><strong>Address:</strong> ${opts.clinicAddress}</li>
  <li><strong>Date:</strong> ${fmt(opts.date)}</li>
  <li><strong>Time:</strong> ${fmtTime(opts.subBlockHour)} – ${fmtTime(opts.subBlockHour + 1)}</li>
  <li><strong>Language:</strong> ${opts.language}</li>
</ul>
<p>Thank you for volunteering!</p>`,
  });
}

export async function sendAdminRemovedNotice(opts: {
  to: string;
  volunteerName: string;
  clinicName: string;
  date: Date;
  subBlockHour: number;
}) {
  await send({
    from: FROM(),
    to: opts.to,
    subject: `You've been removed from a shift — ${fmt(opts.date)}`,
    html: `<p>Hi ${opts.volunteerName},</p>
<p>An administrator has removed you from the following shift:</p>
<ul>
  <li><strong>Clinic:</strong> ${opts.clinicName}</li>
  <li><strong>Date:</strong> ${fmt(opts.date)}</li>
  <li><strong>Time:</strong> ${fmtTime(opts.subBlockHour)} – ${fmtTime(opts.subBlockHour + 1)}</li>
</ul>
<p>Please contact an administrator if you have questions.</p>`,
  });
}

export async function sendSlotCancelledNotice(opts: {
  to: string;
  volunteerName: string;
  clinicName: string;
  date: Date;
  subBlockHour: number;
}) {
  await send({
    from: FROM(),
    to: opts.to,
    subject: `Shift cancelled — ${fmt(opts.date)}`,
    html: `<p>Hi ${opts.volunteerName},</p>
<p>The clinic has cancelled the following slot you were signed up for:</p>
<ul>
  <li><strong>Clinic:</strong> ${opts.clinicName}</li>
  <li><strong>Date:</strong> ${fmt(opts.date)}</li>
  <li><strong>Time:</strong> ${fmtTime(opts.subBlockHour)} – ${fmtTime(opts.subBlockHour + 1)}</li>
</ul>
<p>No action is needed on your end.</p>`,
  });
}

export async function sendSlotEditedNotice(opts: {
  to: string;
  volunteerName: string;
  clinicName: string;
  date: Date;
  subBlockHour: number;
}) {
  await send({
    from: FROM(),
    to: opts.to,
    subject: `Shift updated — your signup was affected — ${fmt(opts.date)}`,
    html: `<p>Hi ${opts.volunteerName},</p>
<p>A clinic updated a slot you were signed up for and your signup is no longer valid. You have been removed from:</p>
<ul>
  <li><strong>Clinic:</strong> ${opts.clinicName}</li>
  <li><strong>Date:</strong> ${fmt(opts.date)}</li>
  <li><strong>Time:</strong> ${fmtTime(opts.subBlockHour)} – ${fmtTime(opts.subBlockHour + 1)}</li>
</ul>
<p>Check the dashboard for updated availability.</p>`,
  });
}

export async function sendUnfilledSlotAlert(opts: {
  to: string;
  volunteerName: string;
  clinicName: string;
  clinicAddress: string;
  date: Date;
  subBlockHour: number;
  language: string;
}) {
  await send({
    from: FROM(),
    to: opts.to,
    subject: `Urgent: open shift in less than 24 hrs — ${fmt(opts.date)} at ${fmtTime(opts.subBlockHour)}`,
    html: `<p>Hi ${opts.volunteerName},</p>
<p>A shift you qualify for has an opening with less than 24 hours to go:</p>
<ul>
  <li><strong>Clinic:</strong> ${opts.clinicName}</li>
  <li><strong>Address:</strong> ${opts.clinicAddress}</li>
  <li><strong>Date:</strong> ${fmt(opts.date)}</li>
  <li><strong>Time:</strong> ${fmtTime(opts.subBlockHour)} – ${fmtTime(opts.subBlockHour + 1)}</li>
  <li><strong>Language:</strong> ${opts.language}</li>
</ul>
<p><a href="${process.env.NEXTAUTH_URL}/dashboard">Sign up now →</a></p>`,
  });
}

// ── Clinic emails ─────────────────────────────────────────────────────────────

type SlotSummaryItem = {
  date: Date;
  startTime: number;
  endTime: number;
  language: string;
  interpreterCount: number;
  signedUp: number;
  notes?: string | null;
};

export async function sendClinicDailySummary(opts: {
  to: string;
  clinicName: string;
  slots: SlotSummaryItem[];
}) {
  const rows = opts.slots
    .map(
      (s) =>
        `<tr>
          <td style="padding:4px 8px">${fmt(s.date)}</td>
          <td style="padding:4px 8px">${fmtTime(s.startTime)} – ${fmtTime(s.endTime)}</td>
          <td style="padding:4px 8px">${s.language}</td>
          <td style="padding:4px 8px">${s.signedUp} / ${s.interpreterCount}</td>
          <td style="padding:4px 8px">${s.notes ?? "—"}</td>
        </tr>`
    )
    .join("");

  await send({
    from: FROM(),
    to: opts.to,
    subject: `Daily summary — ${opts.clinicName}`,
    html: `<p>Hi ${opts.clinicName} team,</p>
<p>Here is today's summary of your upcoming interpreter slots:</p>
<table border="1" cellspacing="0" style="border-collapse:collapse;font-size:14px">
  <thead>
    <tr style="background:#f5f5f0">
      <th style="padding:4px 8px">Date</th>
      <th style="padding:4px 8px">Time</th>
      <th style="padding:4px 8px">Language</th>
      <th style="padding:4px 8px">Filled</th>
      <th style="padding:4px 8px">Notes</th>
    </tr>
  </thead>
  <tbody>${rows}</tbody>
</table>
<p><a href="${process.env.NEXTAUTH_URL}/dashboard">View dashboard →</a></p>`,
  });
}

export async function sendClinicVolunteerCancelAlert(opts: {
  to: string;
  clinicName: string;
  volunteerName: string;
  date: Date;
  subBlockHour: number;
  filledAfterCancel: number;
  needed: number;
}) {
  await send({
    from: FROM(),
    to: opts.to,
    subject: `Volunteer cancelled — ${fmt(opts.date)} at ${fmtTime(opts.subBlockHour)}`,
    html: `<p>Hi ${opts.clinicName} team,</p>
<p><strong>${opts.volunteerName}</strong> has cancelled their signup for:</p>
<ul>
  <li><strong>Date:</strong> ${fmt(opts.date)}</li>
  <li><strong>Time:</strong> ${fmtTime(opts.subBlockHour)} – ${fmtTime(opts.subBlockHour + 1)}</li>
  <li><strong>Filled:</strong> ${opts.filledAfterCancel} of ${opts.needed} needed</li>
</ul>
<p><a href="${process.env.NEXTAUTH_URL}/dashboard">View dashboard →</a></p>`,
  });
}

export async function sendClinicUnfilledAlert(opts: {
  to: string;
  clinicName: string;
  date: Date;
  startTime: number;
  endTime: number;
  unfilledHours: { hour: number; filled: number; needed: number }[];
}) {
  const rows = opts.unfilledHours
    .map(
      (h) =>
        `<li>${fmtTime(h.hour)} – ${fmtTime(h.hour + 1)}: ${h.filled} of ${h.needed} filled</li>`
    )
    .join("");

  await send({
    from: FROM(),
    to: opts.to,
    subject: `Unfilled slots in less than 24 hrs — ${fmt(opts.date)}`,
    html: `<p>Hi ${opts.clinicName} team,</p>
<p>The following sub-blocks for your <strong>${fmt(opts.date)}</strong> slot (${fmtTime(opts.startTime)}–${fmtTime(opts.endTime)}) are still unfilled:</p>
<ul>${rows}</ul>
<p><a href="${process.env.NEXTAUTH_URL}/dashboard">View dashboard →</a></p>`,
  });
}

// ── Admin emails ──────────────────────────────────────────────────────────────

export async function sendAdminPendingVolunteerAlert(opts: {
  to: string;
  pendingCount: number;
  volunteers: { name: string; email: string; waitingHours: number }[];
}) {
  const rows = opts.volunteers
    .map(
      (v) =>
        `<li>${v.name} (${v.email}) — waiting ~${Math.round(v.waitingHours)} hours</li>`
    )
    .join("");

  await send({
    from: FROM(),
    to: opts.to,
    subject: `${opts.pendingCount} volunteer(s) awaiting approval`,
    html: `<p>The following volunteers have been waiting more than 24 hours for approval:</p>
<ul>${rows}</ul>
<p><a href="${process.env.NEXTAUTH_URL}/dashboard">Review in admin dashboard →</a></p>`,
  });
}
