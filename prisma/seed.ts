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

  const pastSlot1 = await prisma.slot.create({ data: { clinicId: devClinic.id, language: "ES", date: d(-14), startTime: 9, endTime: 12, interpreterCount: 2, status: "COMPLETED", notes: "Morning general medicine clinic." } });
  const pastSlot2 = await prisma.slot.create({ data: { clinicId: medstar.id, language: "ZH", date: d(-7), startTime: 13, endTime: 16, interpreterCount: 1, status: "COMPLETED" } });
  const slot1 = await prisma.slot.create({ data: { clinicId: devClinic.id, language: "ES", date: d(2), startTime: 9, endTime: 13, interpreterCount: 2, notes: "General medicine. Expect 15-20 patients." } });
  const slot2 = await prisma.slot.create({ data: { clinicId: devClinic.id, language: "ZH", date: d(2), startTime: 13, endTime: 16, interpreterCount: 1 } });
  await prisma.slot.create({ data: { clinicId: medstar.id, language: "ES", date: d(5), startTime: 8, endTime: 12, interpreterCount: 3, notes: "Busy Saturday clinic." } });
  await prisma.slot.create({ data: { clinicId: medstar.id, language: "AR", date: d(9), startTime: 10, endTime: 14, interpreterCount: 1 } });
  await prisma.slot.create({ data: { clinicId: childrens.id, language: "ES", date: d(12), startTime: 9, endTime: 12, interpreterCount: 2, notes: "Pediatric immunization clinic." } });
  await prisma.slot.create({ data: { clinicId: devClinic.id, language: "HI", date: d(16), startTime: 14, endTime: 17, interpreterCount: 1 } });

  const su1 = await prisma.subBlockSignup.create({ data: { slotId: pastSlot1.id, volunteerId: devVolProf.id, subBlockHour: 9, status: "COMPLETED" } });
  const su2 = await prisma.subBlockSignup.create({ data: { slotId: pastSlot1.id, volunteerId: aliceProf.id, subBlockHour: 9, status: "COMPLETED" } });
  const su3 = await prisma.subBlockSignup.create({ data: { slotId: pastSlot2.id, volunteerId: aliceProf.id, subBlockHour: 13, status: "COMPLETED" } });
  await prisma.subBlockSignup.create({ data: { slotId: slot1.id, volunteerId: devVolProf.id, subBlockHour: 9, status: "ACTIVE" } });
  await prisma.subBlockSignup.create({ data: { slotId: slot2.id, volunteerId: aliceProf.id, subBlockHour: 13, status: "ACTIVE" } });

  await prisma.feedback.createMany({
    data: [
      { signupId: su1.id, authorRole: "CLINIC", rating: 5, note: "Excellent interpreter, very professional." },
      { signupId: su1.id, authorRole: "VOLUNTEER", rating: 4, note: "Great experience." },
      { signupId: su2.id, authorRole: "CLINIC", rating: 5, note: "Alice was fantastic." },
      { signupId: su3.id, authorRole: "CLINIC", rating: 4, note: "Good interpretation." },
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

  console.log("✓ Seeded dev sample data (5 users, 3 clinics, 8 slots, signups, feedback, training materials)");
}

main().catch(console.error).finally(() => prisma.$disconnect());
