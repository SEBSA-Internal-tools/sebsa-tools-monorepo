/**
 * Dev-only seed: creates one Department and one SYSTEM_ADMIN user so login
 * can be tested end-to-end. Idempotent (safe to re-run). Not real data.
 */
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

const TEST_ADMIN_EMAIL = 'admin@sebsa.com';
const TEST_ADMIN_PASSWORD = 'ChangeMe123!';

async function main() {
  const department = await prisma.department.upsert({
    where: { name: 'Engineering' },
    update: {},
    create: { name: 'Engineering' },
  });

  const passwordHash = await bcrypt.hash(TEST_ADMIN_PASSWORD, 10);

  await prisma.user.upsert({
    where: { email: TEST_ADMIN_EMAIL },
    update: {},
    create: {
      name: 'System Administrator',
      email: TEST_ADMIN_EMAIL,
      passwordHash,
      systemRole: 'SYSTEM_ADMIN',
      departmentId: department.id,
      isActive: true,
    },
  });

  console.log('Seed complete. Dev-only test credentials (not real):');
  console.log(`  email:    ${TEST_ADMIN_EMAIL}`);
  console.log(`  password: ${TEST_ADMIN_PASSWORD}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
