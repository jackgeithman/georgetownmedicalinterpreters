import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

// Offset from 2026-04-15
const d = (offset: number) => {
  const dt = new Date("2026-04-15T12:00:00Z");
  dt.setDate(dt.getDate() + offset);
  return dt;
};

async function main() {
  const RESET = process.env.RESEED === "1";

  if (RESET) {
    // Delete in dependency order
    await prisma.feedback.deleteMany({});
    await prisma.subBlockSignup.deleteMany({});
    await prisma.clearanceLog.deleteMany({});
    await prisma.volunteerNotifPrefs.deleteMany({});
    await prisma.volunteerProfile.deleteMany({});
    await prisma.clinicNotifPrefs.deleteMany({});
    await prisma.slot.deleteMany({});
    await prisma.activityLog.deleteMany({});
    await prisma.suggestion.deleteMany({});
    await prisma.trainingMaterial.deleteMany({});
    await prisma.adminNote.deleteMany({});
    await prisma.user.deleteMany({ where: { email: { endsWith: "@dev.local" } } });
    await prisma.user.deleteMany({ where: { email: { endsWith: "@georgetown.edu" } } });
    await prisma.clinic.deleteMany({});
    console.log("✓ Reset complete");
  }

  // ── Languages ──────────────────────────────────────────────────────────────
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

  // ── Feature Flags ──────────────────────────────────────────────────────────
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

  // ── Skip if already seeded ─────────────────────────────────────────────────
  if (!RESET) {
    const devUserCount = await prisma.user.count({ where: { email: { endsWith: "@dev.local" } } });
    if (devUserCount > 0) {
      console.log("Sample data already seeded — run RESEED=1 npx prisma db seed to re-seed.");
      return;
    }
  }

  // ── Clinics ────────────────────────────────────────────────────────────────
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

  // ── Users (5 total) ────────────────────────────────────────────────────────
  // 3 dev users (IDs match auth.ts dev provider)
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

  // 2 sample users
  const alice = await prisma.user.create({
    data: {
      email: "alice.kim@georgetown.edu",
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
      email: "sofia.rodriguez@georgetown.edu",
      name: "Sofia Rodriguez",
      firstName: "Sofia",
      lastName: "Rodriguez",
      role: "PENDING",
      roles: ["PENDING"],
      status: "PENDING_APPROVAL",
      onboardingComplete: true,
    },
  });

  // ── Volunteer Profiles ─────────────────────────────────────────────────────
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
      backgroundInfo: "Pre-med junior, fluent in Spanish and Mandarin. Interpreting since freshman year.",
      hoursVolunteered: 36,
      isCleared: true,
      clearedAt: new Date("2025-08-15"),
    },
  });

  // ── Clearance Logs ─────────────────────────────────────────────────────────
  await prisma.clearanceLog.createMany({
    data: [
      {
        volunteerId: devVolProf.id,
        clearedById: devAdmin.id,
        isCleared: true,
        languageCode: "ES",
        note: "Passed Spanish oral evaluation.",
        createdAt: new Date("2025-09-01"),
        notifiedAt: new Date("2025-09-02"),
      },
      {
        volunteerId: devVolProf.id,
        clearedById: devAdmin.id,
        isCleared: true,
        languageCode: "ZH",
        note: "Strong Mandarin, very natural in medical context.",
        createdAt: new Date("2025-09-01"),
        notifiedAt: new Date("2025-09-02"),
      },
      {
        volunteerId: aliceProf.id,
        clearedById: devAdmin.id,
        isCleared: true,
        languageCode: "ES",
        createdAt: new Date("2025-08-15"),
        notifiedAt: new Date("2025-08-16"),
      },
      {
        volunteerId: aliceProf.id,
        clearedById: devAdmin.id,
        isCleared: true,
        languageCode: "ZH",
        createdAt: new Date("2025-08-15"),
        notifiedAt: new Date("2025-08-16"),
      },
    ],
  });

  // ── Slots ──────────────────────────────────────────────────────────────────
  const pastSlot1 = await prisma.slot.create({
    data: {
      clinicId: devClinic.id,
      language: "ES",
      date: d(-14),
      startTime: 9,
      endTime: 12,
      interpreterCount: 2,
      status: "COMPLETED",
      notes: "Morning general medicine clinic.",
    },
  });

  const pastSlot2 = await prisma.slot.create({
    data: {
      clinicId: medstar.id,
      language: "ZH",
      date: d(-7),
      startTime: 13,
      endTime: 16,
      interpreterCount: 1,
      status: "COMPLETED",
    },
  });

  // Upcoming
  const slot1 = await prisma.slot.create({
    data: {
      clinicId: devClinic.id,
      language: "ES",
      date: d(2),
      startTime: 9,
      endTime: 13,
      interpreterCount: 2,
      notes: "General medicine. Expect 15-20 patients.",
    },
  });

  const slot2 = await prisma.slot.create({
    data: {
      clinicId: devClinic.id,
      language: "ZH",
      date: d(2),
      startTime: 13,
      endTime: 16,
      interpreterCount: 1,
    },
  });

  await prisma.slot.create({
    data: {
      clinicId: medstar.id,
      language: "ES",
      date: d(5),
      startTime: 8,
      endTime: 12,
      interpreterCount: 3,
      notes: "Busy Saturday clinic.",
    },
  });

  await prisma.slot.create({
    data: {
      clinicId: medstar.id,
      language: "AR",
      date: d(9),
      startTime: 10,
      endTime: 14,
      interpreterCount: 1,
    },
  });

  await prisma.slot.create({
    data: {
      clinicId: childrens.id,
      language: "ES",
      date: d(12),
      startTime: 9,
      endTime: 12,
      interpreterCount: 2,
      notes: "Pediatric immunization clinic.",
    },
  });

  await prisma.slot.create({
    data: {
      clinicId: devClinic.id,
      language: "HI",
      date: d(16),
      startTime: 14,
      endTime: 17,
      interpreterCount: 1,
    },
  });

  // ── Signups ────────────────────────────────────────────────────────────────
  const su1 = await prisma.subBlockSignup.create({
    data: { slotId: pastSlot1.id, volunteerId: devVolProf.id, subBlockHour: 9, status: "COMPLETED" },
  });
  const su2 = await prisma.subBlockSignup.create({
    data: { slotId: pastSlot1.id, volunteerId: aliceProf.id, subBlockHour: 9, status: "COMPLETED" },
  });
  const su3 = await prisma.subBlockSignup.create({
    data: { slotId: pastSlot2.id, volunteerId: aliceProf.id, subBlockHour: 13, status: "COMPLETED" },
  });

  // Cancelled signup (dev volunteer)
  await prisma.subBlockSignup.create({
    data: {
      slotId: pastSlot1.id,
      volunteerId: devVolProf.id,
      subBlockHour: 10,
      status: "CANCELLED",
      cancelledAt: d(-15),
    },
  });

  // Upcoming: dev volunteer signed up for one hour of slot1, leaving hours open to sign up for more
  await prisma.subBlockSignup.create({
    data: { slotId: slot1.id, volunteerId: devVolProf.id, subBlockHour: 9, status: "ACTIVE" },
  });
  await prisma.subBlockSignup.create({
    data: { slotId: slot2.id, volunteerId: aliceProf.id, subBlockHour: 13, status: "ACTIVE" },
  });

  // ── Feedback ───────────────────────────────────────────────────────────────
  await prisma.feedback.createMany({
    data: [
      { signupId: su1.id, authorRole: "CLINIC", rating: 5, note: "Excellent interpreter, very professional and accurate." },
      { signupId: su1.id, authorRole: "VOLUNTEER", rating: 4, note: "Great experience. Patient was very appreciative." },
      { signupId: su2.id, authorRole: "CLINIC", rating: 5, note: "Alice was fantastic — patients love working with her." },
      { signupId: su3.id, authorRole: "CLINIC", rating: 4, note: "Good interpretation, handled complex terminology well." },
    ],
  });

  // ── Training Materials ─────────────────────────────────────────────────────
  await prisma.trainingMaterial.createMany({
    data: [
      {
        title: "Medical Interpreting Standards & Ethics",
        description: "NCIHC national standards of practice for medical interpreters.",
        type: "LINK",
        url: "https://www.ncihc.org/ethics",
        category: "General",
        uploadedById: devAdmin.id,
        updatedAt: new Date("2025-08-01"),
      },
      {
        title: "Spanish Medical Terminology Guide",
        description: "Core vocabulary for Spanish-language medical interpreting.",
        type: "LINK",
        url: "https://www.ncihc.org/assets/documents/publications/Spanish_Glossary.pdf",
        languageCode: "ES",
        category: "Language",
        uploadedById: devAdmin.id,
        updatedAt: new Date("2025-09-15"),
      },
      {
        title: "HIPAA & Patient Privacy for Interpreters",
        description: "What volunteer interpreters need to know about confidentiality and HIPAA.",
        type: "LINK",
        url: "https://www.hhs.gov/hipaa/for-professionals/index.html",
        category: "Compliance",
        uploadedById: devInstructor.id,
        updatedAt: new Date("2025-10-01"),
      },
      {
        title: "Interpreter Orientation Slides",
        description: "New volunteer orientation — roles, responsibilities, and what to expect.",
        type: "LINK",
        url: "https://example.com/orientation",
        category: "General",
        uploadedById: devAdmin.id,
        updatedAt: new Date("2026-01-10"),
      },
    ],
  });

  // ── Suggestions ────────────────────────────────────────────────────────────
  await prisma.suggestion.createMany({
    data: [
      {
        type: "FEATURE",
        subject: "Google Calendar sync",
        message: "It would be really helpful to sync upcoming shifts to Google Calendar automatically.",
        submittedById: alice.id,
        status: "OPEN",
      },
      {
        type: "BUG",
        subject: "Language preferences not saving on profile",
        message: "When I update my languages on the profile page, the changes don't persist after refreshing.",
        submittedById: alice.id,
        status: "NOTED",
        adminNote: "Investigating — may be a cache issue on the profile API.",
      },
    ],
  });

  // ── Activity Log ───────────────────────────────────────────────────────────
  await prisma.activityLog.createMany({
    data: [
      {
        actorId: devAdmin.id,
        actorEmail: devAdmin.email,
        actorName: devAdmin.name,
        action: "USER_APPROVED",
        targetType: "User",
        targetId: alice.id,
        detail: "Approved Alice Kim as VOLUNTEER",
        createdAt: new Date("2025-08-10"),
      },
      {
        actorId: devAdmin.id,
        actorEmail: devAdmin.email,
        actorName: devAdmin.name,
        action: "CLEARANCE_GRANTED",
        targetType: "User",
        targetId: alice.id,
        detail: "Cleared Alice Kim for ES and ZH",
        createdAt: new Date("2025-08-15"),
      },
      {
        actorId: devVolunteer.id,
        actorEmail: devVolunteer.email,
        actorName: devVolunteer.name,
        action: "SIGNUP_CREATED",
        detail: "Dev Volunteer signed up for ES slot at Georgetown University Hospital",
        createdAt: d(-5),
      },
      {
        actorId: null,
        actorEmail: null,
        actorName: "System",
        action: "SLOT_COMPLETED",
        targetType: "Slot",
        targetId: pastSlot1.id,
        detail: "Slot auto-marked as completed",
        createdAt: d(-14),
      },
    ],
  });

  // ── Admin Note ─────────────────────────────────────────────────────────────
  await prisma.adminNote.upsert({
    where: { key: "main" },
    update: {},
    create: {
      key: "main",
      content: "Welcome to the GMI dev environment. Sample data is seeded — use the dev toolbar to switch roles.",
      updatedBy: devAdmin.email,
      updatedAt: new Date(),
    },
  });

  console.log("✓ Seeded: languages, feature flags, 3 clinics, 5 users, volunteer profiles, clearance logs, 8 slots, signups, feedback, training materials, suggestions, activity log");
  console.log("  To re-seed from scratch: RESEED=1 npx prisma db seed");
}

main().catch(console.error).finally(() => prisma.$disconnect());
