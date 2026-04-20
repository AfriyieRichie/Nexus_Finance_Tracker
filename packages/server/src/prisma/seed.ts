import { PrismaClient, UserRole } from '@prisma/client';
import bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding database…');

  // Create super admin
  const passwordHash = await bcrypt.hash('Admin@nexus1!', 12);
  const superAdmin = await prisma.user.upsert({
    where: { email: 'admin@nexus-accounting.local' },
    update: {},
    create: {
      email: 'admin@nexus-accounting.local',
      passwordHash,
      firstName: 'System',
      lastName: 'Admin',
      isSuperAdmin: true,
      isActive: true,
    },
  });

  console.log(`Super admin: ${superAdmin.email}`);

  // Create demo organisation
  const org = await prisma.organisation.upsert({
    where: { id: 'demo-org-id' },
    update: {},
    create: {
      id: 'demo-org-id',
      name: 'Demo Company Ltd',
      legalName: 'Demo Company Limited',
      baseCurrency: 'USD',
      fiscalYearStart: 1,
      industry: 'Technology / SaaS',
    },
  });

  // Link super admin to demo org
  await prisma.organisationUser.upsert({
    where: { organisationId_userId: { organisationId: org.id, userId: superAdmin.id } },
    update: {},
    create: {
      organisationId: org.id,
      userId: superAdmin.id,
      role: UserRole.ORG_ADMIN,
      joinedAt: new Date(),
    },
  });

  console.log(`Demo org: ${org.name}`);
  console.log('Seed complete.');
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
