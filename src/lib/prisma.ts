import { PrismaClient } from "@prisma/client";

// ── Dev safety guard ──────────────────────────────────────────────────────────
// Refuse to start if dev mode is accidentally pointed at a non-local database.
if (process.env.NODE_ENV === "development") {
  const url = process.env.DATABASE_URL ?? "";
  if (url && !url.includes("localhost") && !url.includes("127.0.0.1")) {
    throw new Error(
      `[DEV SAFETY] DATABASE_URL does not point to localhost.\n` +
      `Current URL starts with: ${url.slice(0, 40)}...\n` +
      `Check your .env.development.local file.`
    );
  }
}

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

export const prisma = globalForPrisma.prisma || new PrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;