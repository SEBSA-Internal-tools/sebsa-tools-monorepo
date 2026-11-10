/**
 * Dev-only seed: creates one Department, one ADMIN user, and one SUPER_ADMIN
 * user so login and the full admin/privilege-group flow can be tested
 * end-to-end. Idempotent (safe to re-run). Not real data. The four default
 * PrivilegeGroups are NOT seeded here — they're created by
 * prisma/migrations/<timestamp>_super_admin_and_privilege_groups/migration.sql
 * itself, so any DB that has run migrations already has them.
 */
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

// Keep in step with PASSWORD_SALT_ROUNDS in apps/ipm-be/src/app/auth/password.ts.
const SALT_ROUNDS = 12;

const prisma = new PrismaClient();

const TEST_ADMIN_EMAIL = 'admin@sebsa.com';
const TEST_ADMIN_PASSWORD = 'ChangeMe123!';

const TEST_SUPER_ADMIN_EMAIL = 'super.admin@sebsa.com';
const TEST_SUPER_ADMIN_PASSWORD = 'ChangeMe123!';

async function main() {
  const department = await prisma.department.upsert({
    where: { name: 'Engineering' },
    update: {},
    create: { name: 'Engineering' },
  });

  const adminPasswordHash = await bcrypt.hash(TEST_ADMIN_PASSWORD, SALT_ROUNDS);
  await prisma.user.upsert({
    where: { email: TEST_ADMIN_EMAIL },
    update: {},
    create: {
      name: 'System Administrator',
      email: TEST_ADMIN_EMAIL,
      passwordHash: adminPasswordHash,
      systemRole: 'ADMIN',
      departmentId: department.id,
      isActive: true,
      approvedAt: new Date(),
    },
  });

  const superAdminPasswordHash = await bcrypt.hash(TEST_SUPER_ADMIN_PASSWORD, SALT_ROUNDS);
  await prisma.user.upsert({
    where: { email: TEST_SUPER_ADMIN_EMAIL },
    update: {},
    create: {
      name: 'Super Administrator',
      email: TEST_SUPER_ADMIN_EMAIL,
      passwordHash: superAdminPasswordHash,
      systemRole: 'SUPER_ADMIN',
      departmentId: department.id,
      isActive: true,
      approvedAt: new Date(),
    },
  });

  console.log('Seed complete. Dev-only test credentials (not real):');
  console.log(`  email:    ${TEST_ADMIN_EMAIL}`);
  console.log(`  password: ${TEST_ADMIN_PASSWORD}`);
  console.log(`  email:    ${TEST_SUPER_ADMIN_EMAIL}`);
  console.log(`  password: ${TEST_SUPER_ADMIN_PASSWORD}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
