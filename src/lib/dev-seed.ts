/**
 * Dev seed — wipes and rebuilds the local gmi_dev database with a fixed test world.
 * Called by:
 *   - `npm run db:seed` (CLI)
 *   - POST /api/dev/seed (Reset DB button in dev toolbar)
 *
 * Never runs in production (guarded at both call sites).
 */

import { prisma } from "@/lib/prisma";

// ── Dates ─────────────────────────────────────────────────────────────────────

function daysFromNow(n: number): Date {
  const d = new Date();
  d.setDate(d.getDate() + n);
  d.setHours(12, 0, 0, 0);
  return d;
}

// ── Main seed ─────────────────────────────────────────────────────────────────

export async function runSeed() {
  console.log("[seed] Wiping dev data...");

  // Delete in dependency order
  await prisma.notifLog.deleteMany();
  await prisma.feedback.deleteMany();
  await prisma.shiftPosition.deleteMany();
  await prisma.shift.deleteMany();
  await prisma.volunteerNotifPrefs.deleteMany();
  await prisma.clearanceLog.deleteMany();
  await prisma.volunteerProfile.deleteMany();
  await prisma.clinicNotifPrefs.deleteMany();
  await prisma.account.deleteMany({ where: { user: { email: { endsWith: "@dev.local" } } } });
  await prisma.user.deleteMany({ where: { email: { endsWith: "@dev.local" } } });
  await prisma.clinic.deleteMany({ where: { contactEmail: "testclinic@dev.local" } });

  console.log("[seed] Seeding test world...");

  // ── Clinic ───────────────────────────────────────────────────────────────
  const clinic = await prisma.clinic.create({
    data: {
      name: "Test Clinic",
      address: "123 Dev St, Washington DC",
      contactName: "Dr. Dev",
      contactEmail: "testclinic@dev.local",
      loginPin: "123456",
      travelMinutes: 30,
    },
  });

  // ── Admin ─────────────────────────────────────────────────────────────────
  await prisma.user.upsert({
    where: { email: "dev-admin@dev.local" },
    update: { role: "ADMIN", status: "ACTIVE", onboardingComplete: true, roles: ["DEV"] },
    create: {
      email: "dev-admin@dev.local",
      name: "Dev Admin",
      role: "ADMIN",
      status: "ACTIVE",
      onboardingComplete: true,
      roles: ["DEV"],
    },
  });

  // ── Volunteers ────────────────────────────────────────────────────────────

  // Helper to create a volunteer user + profile + clearances
  async function makeVolunteer(opts: {
    email: string;
    name: string;
    driverCleared: boolean;
    languages: string[]; // language codes they are cleared for
  }) {
    const user = await prisma.user.upsert({
      where: { email: opts.email },
      update: {
        role: "VOLUNTEER", status: "ACTIVE", onboardingComplete: true,
        roles: opts.languages.map((l) => `LANG_${l}_CLEARED`),
      },
      create: {
        email: opts.email,
        name: opts.name,
        role: "VOLUNTEER",
        status: "ACTIVE",
        onboardingComplete: true,
        roles: opts.languages.map((l) => `LANG_${l}_CLEARED`),
      },
    });

    const profile = await prisma.volunteerProfile.upsert({
      where: { userId: user.id },
      update: { driverCleared: opts.driverCleared, languages: opts.languages, isCleared: true },
      create: {
        userId: user.id,
        driverCleared: opts.driverCleared,
        languages: opts.languages,
        isCleared: true,
      },
    });

    return { user, profile };
  }

  const driverEs  = await makeVolunteer({ email: "dev-driver-es@dev.local",     name: "Dev Driver (ES)",     driverCleared: true,  languages: ["ES"] });
  const driverZh  = await makeVolunteer({ email: "dev-driver-zh@dev.local",     name: "Dev Driver (ZH)",     driverCleared: true,  languages: ["ZH"] });
  const interpEsZh = await makeVolunteer({ email: "dev-interp-es-zh@dev.local", name: "Dev Interp (ES+ZH)",  driverCleared: false, languages: ["ES", "ZH"] });
  const interpEs   = await makeVolunteer({ email: "dev-interp-es@dev.local",    name: "Dev Interp (ES)",     driverCleared: false, languages: ["ES"] });
  await makeVolunteer({ email: "dev-uncleared@dev.local",   name: "Dev Uncleared",       driverCleared: false, languages: [] });

  const adminUser = await prisma.user.upsert({
    where: { email: "dev-admin@dev.local" },
    update: {},
    create: { email: "dev-admin@dev.local", name: "Dev Admin", role: "ADMIN", status: "ACTIVE", onboardingComplete: true, roles: ["DEV"] },
  });

  // ── Shifts ────────────────────────────────────────────────────────────────

  // Shift A — Van, Spanish x2, Seat 1 filled by driver-es, Seat 2 open
  const shiftA = await prisma.shift.create({
    data: {
      clinicId: clinic.id,
      date: daysFromNow(3),
      volunteerStart: 540,  // 9:00 AM
      volunteerEnd: 780,    // 1:00 PM
      travelMinutes: 30,
      languagesNeeded: ["ES", "ES"],
      notes: "Shift A: Van, 1 filled / 1 open",
      postedById: adminUser.id,
    },
  });
  // Driver seat — filled
  const shiftAPos1 = await prisma.shiftPosition.create({
    data: { shiftId: shiftA.id, positionNumber: 1, isDriver: true, languageCode: "ES", status: "FILLED", volunteerId: driverEs.profile.id, signedUpAt: new Date() },
  });
  // Interpreter seat — open (unlocked because driver filled)
  await prisma.shiftPosition.create({
    data: { shiftId: shiftA.id, positionNumber: 2, isDriver: false, languageCode: "ES", status: "OPEN" },
  });
  void shiftAPos1;

  // Shift B — Van, Spanish x2, all open (driver empty → Seat 2 locked)
  const shiftB = await prisma.shift.create({
    data: {
      clinicId: clinic.id,
      date: daysFromNow(5),
      volunteerStart: 540,
      volunteerEnd: 780,
      travelMinutes: 30,
      languagesNeeded: ["ES", "ES"],
      notes: "Shift B: Van, driver unfilled — Seat 2 locked",
      postedById: adminUser.id,
    },
  });
  await prisma.shiftPosition.createMany({
    data: [
      { shiftId: shiftB.id, positionNumber: 1, isDriver: true,  languageCode: null, status: "OPEN" },
      { shiftId: shiftB.id, positionNumber: 2, isDriver: false, languageCode: null, status: "LOCKED" },
    ],
  });

  // Shift C — Van, Mandarin + Spanish, all open (driver empty → Seat 2 locked)
  const shiftC = await prisma.shift.create({
    data: {
      clinicId: clinic.id,
      date: daysFromNow(7),
      volunteerStart: 600,  // 10:00 AM
      volunteerEnd: 840,    // 2:00 PM
      travelMinutes: 30,
      languagesNeeded: ["ZH", "ES"],
      notes: "Shift C: Van, ZH driver needed + ES interpreter",
      postedById: adminUser.id,
    },
  });
  await prisma.shiftPosition.createMany({
    data: [
      { shiftId: shiftC.id, positionNumber: 1, isDriver: true,  languageCode: null, status: "OPEN" },
      { shiftId: shiftC.id, positionNumber: 2, isDriver: false, languageCode: null, status: "LOCKED" },
    ],
  });

  // Shift D — Uber, Spanish + Mandarin, both seats open
  const shiftD = await prisma.shift.create({
    data: {
      clinicId: clinic.id,
      date: daysFromNow(10),
      volunteerStart: 540,
      volunteerEnd: 780,
      travelMinutes: 30,
      languagesNeeded: ["ES", "ZH"],
      isUberShift: true,
      uberBookedBy: "Test Booker",
      uberBookedByReturn: null,
      notes: "Shift D: Uber, ES + ZH, both open",
      postedById: adminUser.id,
    },
  });
  await prisma.shiftPosition.createMany({
    data: [
      { shiftId: shiftD.id, positionNumber: 1, isDriver: true,  languageCode: "ES", status: "OPEN" },
      { shiftId: shiftD.id, positionNumber: 2, isDriver: false, languageCode: "ZH", status: "OPEN" },
    ],
  });

  // Shift E — Van, Spanish x2, FULL (both filled)
  const shiftE = await prisma.shift.create({
    data: {
      clinicId: clinic.id,
      date: daysFromNow(14),
      volunteerStart: 540,
      volunteerEnd: 780,
      travelMinutes: 30,
      languagesNeeded: ["ES", "ES"],
      notes: "Shift E: Van, full",
      postedById: adminUser.id,
    },
  });
  await prisma.shiftPosition.createMany({
    data: [
      { shiftId: shiftE.id, positionNumber: 1, isDriver: true,  languageCode: "ES", status: "FILLED", volunteerId: driverEs.profile.id,   signedUpAt: new Date() },
      { shiftId: shiftE.id, positionNumber: 2, isDriver: false, languageCode: "ES", status: "FILLED", volunteerId: interpEsZh.profile.id, signedUpAt: new Date() },
    ],
  });

  // Shift F — Van, Spanish x2, far future, completely empty (for create/edit testing)
  const shiftF = await prisma.shift.create({
    data: {
      clinicId: clinic.id,
      date: daysFromNow(30),
      volunteerStart: 540,
      volunteerEnd: 780,
      travelMinutes: 30,
      languagesNeeded: ["ES", "ES"],
      notes: "Shift F: Far future, empty",
      postedById: adminUser.id,
    },
  });
  await prisma.shiftPosition.createMany({
    data: [
      { shiftId: shiftF.id, positionNumber: 1, isDriver: true,  languageCode: null, status: "OPEN" },
      { shiftId: shiftF.id, positionNumber: 2, isDriver: false, languageCode: null, status: "LOCKED" },
    ],
  });

  // Past shift — for history view testing
  const pastShift = await prisma.shift.create({
    data: {
      clinicId: clinic.id,
      date: daysFromNow(-7),
      volunteerStart: 540,
      volunteerEnd: 780,
      travelMinutes: 30,
      languagesNeeded: ["ES", "ES"],
      status: "COMPLETED",
      notes: "Past shift for history view",
      postedById: adminUser.id,
    },
  });
  await prisma.shiftPosition.createMany({
    data: [
      { shiftId: pastShift.id, positionNumber: 1, isDriver: true,  languageCode: "ES", status: "COMPLETED", volunteerId: driverEs.profile.id,  signedUpAt: new Date() },
      { shiftId: pastShift.id, positionNumber: 2, isDriver: false, languageCode: "ES", status: "COMPLETED", volunteerId: interpEs.profile.id,   signedUpAt: new Date() },
    ],
  });

  console.log("[seed] Done. Test world ready:");
  console.log("  Clinic:    Test Clinic (PIN: 123456)");
  console.log("  Shifts:    A (1 filled/1 open), B (locked), C (ZH+ES locked), D (Uber), E (full), F (future), Past");
  console.log("  Volunteers: driver-es, driver-zh, interp-es-zh, interp-es, uncleared");
}
