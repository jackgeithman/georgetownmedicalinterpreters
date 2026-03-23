// Sets up a full test environment so you can walk through every user flow.
// Run: node scripts/seed-test-data.mjs

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// ── Clinic ────────────────────────────────────────────────────────────────────
let clinic = await prisma.clinic.findFirst({ where: { contactEmail: "medclinic@test.com" } });
if (!clinic) {
  clinic = await prisma.clinic.create({
    data: {
      name: "MedConnect Test Clinic",
      address: "37th & O St NW, Washington DC",
      contactName: "Dr. Test",
      contactEmail: "medclinic@test.com",
      loginPin: "123456",
    },
  });
}

console.log("\n✅ Test clinic created");
console.log(`   Name : ${clinic.name}`);
console.log(`   PIN  : ${clinic.loginPin}`);
console.log(`   URL  : http://localhost:3000/clinic-login/${clinic.loginToken}`);

// ── Volunteer user ────────────────────────────────────────────────────────────
// Pre-register jackgeithman2005@gmail.com as an active volunteer.
// When they sign in via Google, the signIn callback finds this record and lets them in.
// Only create if not already in DB — never overwrite an existing role
let volunteer = await prisma.user.findUnique({ where: { email: "jackgeithman2005@gmail.com" } });
if (!volunteer) {
  volunteer = await prisma.user.create({
    data: {
      email: "jackgeithman2005@gmail.com",
      name: "Jack Geithman",
      role: "VOLUNTEER",
      status: "ACTIVE",
    },
  });
}

// Ensure they have a VolunteerProfile with all 4 languages
await prisma.volunteerProfile.upsert({
  where: { userId: volunteer.id },
  update: {},
  create: {
    userId: volunteer.id,
    languages: ["ES", "ZH", "KO", "AR"],
  },
});

console.log("\n✅ Volunteer user ready");
console.log(`   Email : ${volunteer.email}`);
console.log(`   Role  : ${volunteer.role} / ${volunteer.status}`);

// ── Test slots ────────────────────────────────────────────────────────────────
// Two upcoming slots so the volunteer has something to sign up for.
const tomorrow = new Date();
tomorrow.setDate(tomorrow.getDate() + 1);
tomorrow.setHours(0, 0, 0, 0);

const nextWeek = new Date();
nextWeek.setDate(nextWeek.getDate() + 7);
nextWeek.setHours(0, 0, 0, 0);

const slot1 = await prisma.slot.create({
  data: {
    clinicId: clinic.id,
    language: "ES",
    date: tomorrow,
    startTime: 9,
    endTime: 12,
    interpreterCount: 2,
    notes: "Morning Spanish session — 3 sub-blocks available",
  },
});

const slot2 = await prisma.slot.create({
  data: {
    clinicId: clinic.id,
    language: "ZH",
    date: nextWeek,
    startTime: 14,
    endTime: 16,
    interpreterCount: 1,
    notes: "Afternoon Mandarin session",
  },
});

console.log("\n✅ Test slots created");
console.log(`   Slot 1: Spanish  ${tomorrow.toDateString()}  9 AM – 12 PM  (2 interpreters/hour)`);
console.log(`   Slot 2: Chinese  ${nextWeek.toDateString()}  2 PM – 4 PM   (1 interpreter/hour)`);

// ── Summary ───────────────────────────────────────────────────────────────────
console.log(`
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
TEST FLOWS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

1. ADMIN  →  http://localhost:3000/login
   Sign in with your Georgetown Google account.
   You can approve volunteers, manage clinics, see PINs.

2. CLINIC →  http://localhost:3000/clinic-login/${clinic.loginToken}
   PIN: ${clinic.loginPin}
   Post slots, view signups, report no-shows.

3. VOLUNTEER  →  http://localhost:3000/login
   Sign in with jackgeithman2005@gmail.com (Google).
   Browse the 2 test slots and sign up for sub-blocks.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
`);

await prisma.$disconnect();
