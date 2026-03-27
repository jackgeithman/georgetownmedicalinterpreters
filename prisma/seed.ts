import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

async function main() {
  // Seed languages
  const langs = [
    { code: "ES", name: "Spanish" },
    { code: "ZH", name: "Chinese" },
    { code: "KO", name: "Korean" },
    { code: "AR", name: "Arabic" },
  ];
  for (const lang of langs) {
    await prisma.languageConfig.upsert({
      where: { code: lang.code },
      update: {},
      create: lang,
    });
  }

  // Seed feature flags
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

  console.log("Seeded languages and feature flags");
}

main().catch(console.error).finally(() => prisma.$disconnect());
