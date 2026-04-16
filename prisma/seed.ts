import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

async function main() {
  // ── Hard guard: never run sample data seeding against production ───────────
  const dbUrl = process.env.DATABASE_URL ?? "";
  const isProduction = dbUrl.includes("supabase.com") || dbUrl.includes("neon.tech") || dbUrl.includes("railway.app");
  if (isProduction && process.env.NODE_ENV !== "development") {
    console.log("⚠️  Production database detected. Only seeding languages and feature flags (safe upserts).");
    await seedSafeData();
    return;
  }

  // ── Skip if already seeded (dev only) ─────────────────────────────────────
  const devUserCount = await prisma.user.count({ where: { email: { endsWith: "@dev.local" } } });
  if (devUserCount > 0) {
    console.log("Sample data already seeded — skipping.");
    console.log("To reset dev data, manually delete dev.local users from the DB first.");
    await seedSafeData();
    return;
  }

  await seedSafeData();
  await seedDevData();
}

// ── Languages and feature flags — safe to run anywhere ────────────────────
async function seedSafeData() {
  const langs = [
    { code: "ES", name: "Spanish" },
    { code: "ZH", name: "Mandarin" },
    { code: "KO", name: "Korean" },
    { code: "AR", name: "Arabic" },
    { code: "FR", name: "French" },
    { code: "PT", name: "Portuguese" },
    { code: "HI", name: "Hindi" },
    { code: "VI", name: "Vietnamese" },
  ];
  for (const lang of langs) {
    await prisma.languageConfig.upsert({
      where: { code: lang.code },
      update: {},
      create: lang,
    });
  }

  const flags = [
    { key: "EMAILS", label: "Notification Emails", description: "Send automated email notifications to volunteers and clinics" },
    { key: "TRAINING", label: "Training Portal", description: "Show the Training tab to volunteers and instructors" },
    { key: "METRICS", label: "Metrics Dashboard", description: "Show the Metrics tab to admins and instructors" },
    { key: "GCAL", label: "Google Calendar Integration", description: "Sync slots to Google Calendar" },
  ];
  for (const flag of flags) {
    await prisma.featureFlag.upsert({
      where: { key: flag.key },
      update: {},
      create: { ...flag, updatedAt: new Date() },
    });
  }

  console.log("✓ Seeded languages and feature flags");
}

// ── Dev sample data — only runs in local dev, never in production ──────────
async function seedDevData() {
  // Offset from a fixed dev date
  const d = (offset: number) => {
    const dt = new Date("2026-04-15T12:00:00Z");
    dt.setDate(dt.getDate() + offset);
    return dt;
  };

  const devClinic = await prisma.clinic.create({
    data: {
      id: "dev-clinic",
      name: "Georgetown University Hospital",
      address: "3800 Reservoir Rd NW, Washington, DC 20007",
      contactName: "Dr. Sarah Chen",
      contactEmail: "s.chen@gumc.edu",
      loginToken: "dev-clinic-token",
      loginPin: "123456",
    },
  });

  const medstar = await prisma.clinic.create({
    data: {
      name: "MedStar Georgetown",
      address: "3800 Reservoir Rd NW, Washington, DC 20007",
      contactName: "Maria Lopez",
      contactEmail: "m.lopez@medstar.net",
      loginToken: "medstar-token",
      loginPin: "654321",
    },
  });

  const childrens = await prisma.clinic.create({
    data: {
      name: "Children's National Medical Center",
      address: "111 Michigan Ave NW, Washington, DC 20010",
      contactName: "Dr. James Park",
      contactEmail: "j.park@childrensnational.org",
      loginToken: "childrens-token",
      loginPin: "246810",
    },
  });

  await prisma.clinicNotifPrefs.createMany({
    data: [
      { clinicId: devClinic.id, dailySummary: true, unfilledAlert24h: true, updatedAt: new Date() },
      { clinicId: medstar.id, dailySummary: true, unfilledAlert24h: false, updatedAt: new Date() },
      { clinicId: childrens.id, dailySummary: false, unfilledAlert24h: true, updatedAt: new Date() },
    ],
  });

  const devAdmin = await prisma.user.create({
    data: {
      id: "dev-ADMIN",
      email: "dev-admin@dev.local",
      name: "Dev Admin",
      firstName: "Dev",
      lastName: "Admin",
      role: "ADMIN",
      roles: ["ADMIN", "DEV", "LANG_ES_CLEARED", "LANG_ZH_CLEARED"],
      status: "ACTIVE",
      onboardingComplete: true,
    },
  });

  const devVolunteer = await prisma.user.create({
    data: {
      id: "dev-VOLUNTEER",
      email: "dev-volunteer@dev.local",
      name: "Dev Volunteer",
      firstName: "Dev",
      lastName: "Volunteer",
      role: "VOLUNTEER",
      roles: ["VOLUNTEER", "LANG_ES_CLEARED", "LANG_ZH_CLEARED"],
      status: "ACTIVE",
      onboardingComplete: true,
    },
  });

  const devInstructor = await prisma.user.create({
    data: {
      id: "dev-INSTRUCTOR",
      email: "dev-instructor@dev.local",
      name: "Dev Instructor",
      firstName: "Dev",
      lastName: "Instructor",
      role: "INSTRUCTOR",
      roles: ["INSTRUCTOR", "LANG_ES_CLEARED"],
      status: "ACTIVE",
      onboardingComplete: true,
    },
  });

  const alice = await prisma.user.create({
    data: {
      email: "alice.kim@dev.local",
      name: "Alice Kim",
      firstName: "Alice",
      lastName: "Kim",
      role: "VOLUNTEER",
      roles: ["VOLUNTEER", "LANG_ES_CLEARED", "LANG_ZH_CLEARED"],
      status: "ACTIVE",
      onboardingComplete: true,
    },
  });

  await prisma.user.create({
    data: {
      email: "sofia.rodriguez@dev.local",
      name: "Sofia Rodriguez",
      firstName: "Sofia",
      lastName: "Rodriguez",
      role: "PENDING",
      roles: ["PENDING"],
      status: "PENDING_APPROVAL",
      onboardingComplete: true,
    },
  });

  const devVolProf = await prisma.volunteerProfile.create({
    data: {
      userId: devVolunteer.id,
      languages: ["ES", "ZH"],
      backgroundInfo: "Medical student with 2 years of interpreting experience.",
      hoursVolunteered: 24,
      cancellationsWithin24h: 1,
      isCleared: true,
      clearedAt: new Date("2025-09-01"),
    },
  });

  const aliceProf = await prisma.volunteerProfile.create({
    data: {
      userId: alice.id,
      languages: ["ES", "ZH"],
      backgroundInfo: "Pre-med junior, fluent in Spanish and Mandarin.",
      hoursVolunteered: 36,
      isCleared: true,
      clearedAt: new Date("2025-08-15"),
    },
  });

  await prisma.clearanceLog.createMany({
    data: [
      { volunteerId: devVolProf.id, clearedById: devAdmin.id, isCleared: true, languageCode: "ES", createdAt: new Date("2025-09-01"), notifiedAt: new Date("2025-09-02") },
      { volunteerId: devVolProf.id, clearedById: devAdmin.id, isCleared: true, languageCode: "ZH", createdAt: new Date("2025-09-01"), notifiedAt: new Date("2025-09-02") },
      { volunteerId: aliceProf.id, clearedById: devAdmin.id, isCleared: true, languageCode: "ES", createdAt: new Date("2025-08-15"), notifiedAt: new Date("2025-08-16") },
      { volunteerId: aliceProf.id, clearedById: devAdmin.id, isCleared: true, languageCode: "ZH", createdAt: new Date("2025-08-15"), notifiedAt: new Date("2025-08-16") },
    ],
  });

  // ── Shifts (admin-created, new model) ─────────────────────────────────────
  // Past shift 1: devClinic, ES + ZH, completed — driver devVolunteer (ES), alice (ZH)
  const pastShift1 = await prisma.shift.create({
    data: { clinicId: devClinic.id, date: d(-14), volunteerStart: 540, volunteerEnd: 720, travelMinutes: 30, languagesNeeded: ["ES", "ZH"], status: "COMPLETED", notes: "Morning general medicine clinic.", postedById: devAdmin.id },
  });
  const ps1p1 = await prisma.shiftPosition.create({ data: { shiftId: pastShift1.id, positionNumber: 1, isDriver: true, languageCode: "ES", volunteerId: devVolProf.id, status: "COMPLETED", signedUpAt: d(-20) } });
  const ps1p2 = await prisma.shiftPosition.create({ data: { shiftId: pastShift1.id, positionNumber: 2, isDriver: false, languageCode: "ZH", volunteerId: aliceProf.id, status: "COMPLETED", signedUpAt: d(-20) } });

  // Past shift 2: medstar, ZH only, completed — driver alice (ZH)
  const pastShift2 = await prisma.shift.create({
    data: { clinicId: medstar.id, date: d(-7), volunteerStart: 780, volunteerEnd: 960, travelMinutes: 45, languagesNeeded: ["ZH"], status: "COMPLETED", postedById: devAdmin.id },
  });
  const ps2p1 = await prisma.shiftPosition.create({ data: { shiftId: pastShift2.id, positionNumber: 1, isDriver: true, languageCode: "ZH", volunteerId: aliceProf.id, status: "COMPLETED", signedUpAt: d(-14) } });

  // Upcoming shift 1: devClinic, ES + ZH — driver devVolunteer (ES) filled, ZH seat open
  const shift1 = await prisma.shift.create({
    data: { clinicId: devClinic.id, date: d(2), volunteerStart: 540, volunteerEnd: 780, travelMinutes: 30, languagesNeeded: ["ES", "ZH"], notes: "General medicine. Expect 15-20 patients.", postedById: devAdmin.id },
  });
  const s1p1 = await prisma.shiftPosition.create({ data: { shiftId: shift1.id, positionNumber: 1, isDriver: true, languageCode: "ES", volunteerId: devVolProf.id, status: "FILLED", signedUpAt: new Date() } });
  await prisma.shiftPosition.create({ data: { shiftId: shift1.id, positionNumber: 2, isDriver: false, languageCode: "ZH", status: "OPEN" } });

  // Upcoming shift 2: medstar, ES + AR — no one signed up yet
  await prisma.shift.create({
    data: { clinicId: medstar.id, date: d(5), volunteerStart: 480, volunteerEnd: 720, travelMinutes: 45, languagesNeeded: ["ES", "AR"], notes: "Busy Saturday clinic.", postedById: devAdmin.id },
  }).then(async (s) => {
    await prisma.shiftPosition.createMany({ data: [
      { shiftId: s.id, positionNumber: 1, isDriver: true, status: "OPEN" },
      { shiftId: s.id, positionNumber: 2, isDriver: false, status: "LOCKED" },
    ]});
  });

  // Upcoming shift 3: childrens, ES only
  await prisma.shift.create({
    data: { clinicId: childrens.id, date: d(12), volunteerStart: 540, volunteerEnd: 720, travelMinutes: 20, languagesNeeded: ["ES"], notes: "Pediatric immunization clinic.", postedById: devAdmin.id },
  }).then(async (s) => {
    await prisma.shiftPosition.create({ data: { shiftId: s.id, positionNumber: 1, isDriver: true, status: "OPEN" } });
  });

  await prisma.feedback.createMany({
    data: [
      { positionId: ps1p1.id, authorRole: "CLINIC", rating: 5, note: "Excellent interpreter, very professional." },
      { positionId: ps1p1.id, authorRole: "VOLUNTEER", rating: 4, note: "Great experience." },
      { positionId: ps1p2.id, authorRole: "CLINIC", rating: 5, note: "Alice was fantastic." },
      { positionId: ps2p1.id, authorRole: "CLINIC", rating: 4, note: "Good interpretation." },
    ],
  });

  await prisma.trainingMaterial.createMany({
    data: [
      { title: "Medical Interpreting Standards & Ethics", type: "LINK", url: "https://www.ncihc.org/ethics", category: "General", uploadedById: devAdmin.id, updatedAt: new Date("2025-08-01") },
      { title: "HIPAA & Patient Privacy for Interpreters", type: "LINK", url: "https://www.hhs.gov/hipaa/for-professionals/index.html", category: "Compliance", uploadedById: devInstructor.id, updatedAt: new Date("2025-10-01") },
    ],
  });

  await prisma.suggestion.createMany({
    data: [
      { type: "FEATURE", subject: "Google Calendar sync", message: "Sync upcoming shifts to Google Calendar.", submittedById: alice.id, status: "OPEN" },
      { type: "BUG", subject: "Language preferences not saving", message: "Changes don't persist after refresh.", submittedById: alice.id, status: "NOTED", adminNote: "Investigating." },
    ],
  });

  await prisma.adminNote.upsert({
    where: { key: "main" },
    update: {},
    create: { key: "main", content: "Dev environment. Use the dev toolbar to switch roles.", updatedBy: devAdmin.email, updatedAt: new Date() },
  });

  console.log("✓ Seeded dev sample data (5 users, 3 clinics, 5 shifts, positions, feedback, training materials)");
}

main().catch(console.error).finally(() => prisma.$disconnect());
