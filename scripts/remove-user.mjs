// Usage: node scripts/remove-user.mjs <email>
// Example: node scripts/remove-user.mjs jag490@georgetown.edu

import { PrismaClient } from "@prisma/client";

const email = process.argv[2];
if (!email) {
  console.error("Usage: node scripts/remove-user.mjs <email>");
  process.exit(1);
}

const prisma = new PrismaClient();

const user = await prisma.user.findUnique({ where: { email } });
if (!user) {
  console.log(`No user found with email: ${email}`);
  await prisma.$disconnect();
  process.exit(0);
}

// Remove linked accounts first (cascade isn't guaranteed on all DBs)
await prisma.account.deleteMany({ where: { userId: user.id } });
await prisma.user.delete({ where: { email } });

console.log(`Removed user: ${email}`);
console.log("The next person to sign in with a @georgetown.edu account will become admin.");

await prisma.$disconnect();
