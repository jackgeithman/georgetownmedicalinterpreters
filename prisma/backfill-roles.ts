import { prisma } from "../src/lib/prisma";

async function main() {
  const users = await prisma.user.findMany({
    include: { volunteer: true },
  });

  for (const user of users) {
    // Skip if already has roles
    if (user.roles.length > 0) continue;

    const roles: string[] = [user.role]; // start with primary role

    // Add language roles from volunteer profile
    if (user.volunteer) {
      for (const lang of user.volunteer.languages) {
        const code = lang.toUpperCase();
        if (user.volunteer.isCleared) {
          roles.push(`LANG_${code}_CLEARED`);
        } else {
          roles.push(`LANG_${code}`);
        }
      }
    }

    await prisma.user.update({
      where: { id: user.id },
      data: { roles },
    });

    console.log(`Updated ${user.email}: ${roles.join(", ")}`);
  }

  console.log("Done!");
}

main().catch(console.error).finally(() => prisma.$disconnect());
