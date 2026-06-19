/**
 * One-time script: Set kshitijmay14@gmail.com as SUPER_ADMIN
 * Run: node scripts/set-super-admin.mjs
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const email = 'kshitijmay14@gmail.com';

  // Upsert: create user if doesn't exist yet, otherwise update their role
  const user = await prisma.user.upsert({
    where: { email },
    update: { role: 'SUPER_ADMIN' },
    create: {
      email,
      name: 'Kshitij',
      role: 'SUPER_ADMIN',
    },
  });

  console.log(`✅  Set SUPER_ADMIN for: ${user.email} (id: ${user.id})`);
  console.log(`    Role: ${user.role}`);
}

main()
  .catch((e) => {
    console.error('❌  Error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
