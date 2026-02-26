import { PrismaClient, UserRole, Permission } from '@prisma/client';
import bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding database...');

  // Create default SuperAdmin user
  const passwordHash = await bcrypt.hash('Admin123!', 12);

  const admin = await prisma.user.upsert({
    where: { email: 'admin@redisnavigator.local' },
    update: {},
    create: {
      email: 'admin@redisnavigator.local',
      password: passwordHash,
      name: 'Admin',
      isActive: true,
    },
  });

  console.log(`✅ Admin user: ${admin.email}`);

  // Assign SUPERADMIN role — requirePermission middleware checks for
  // ANY UserConnectionRole row with role=SUPERADMIN (no connectionId filter),
  // so one global entry (connectionId = null) is enough.
  const existingSuperAdminRole = await prisma.userConnectionRole.findFirst({
    where: { userId: admin.id, role: UserRole.SUPERADMIN },
  });

  if (!existingSuperAdminRole) {
    await prisma.userConnectionRole.create({
      data: {
        userId: admin.id,
        connectionId: null,
        role: UserRole.SUPERADMIN,
        permissions: [
          Permission.READ_KEY,
          Permission.WRITE_KEY,
          Permission.DELETE_KEY,
          Permission.MANAGE_CONNECTION,
          Permission.MANAGE_USERS,
        ],
      },
    });
  }
}

main()
  .catch((e) => {
    console.error('Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
