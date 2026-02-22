import { PrismaClient, UserRole, Permission } from '@prisma/client';
import bcrypt from 'bcrypt';
import { encrypt } from '../src/utils/encryption';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding database...');

  // Create default SuperAdmin user
  const passwordHash = await bcrypt.hash('Admin123!', 12);

  const admin = await prisma.user.upsert({
    where: { email: 'admin@redisgui.local' },
    update: {},
    create: {
      email: 'admin@redisgui.local',
      password: passwordHash,
      name: 'Admin',
      isActive: true,
    },
  });

  console.log(`✅ Admin user: ${admin.email}`);

  // Create a sample connection so the SUPERADMIN role can be assigned
  // (UserConnectionRole requires a connectionId FK)
  let sampleConnection = await prisma.redisConnection.findFirst({
    where: { ownerId: admin.id, name: 'Sample Redis (localhost)' },
  });

  if (!sampleConnection) {
    sampleConnection = await prisma.redisConnection.create({
      data: {
        name: 'Sample Redis (localhost)',
        host: 'redis-sample',
        port: 6379,
        passwordEnc: encrypt('samplepassword'),
        ownerId: admin.id,
        isActive: true,
      },
    });
  }

  console.log(`✅ Sample connection: ${sampleConnection.name}`);

  // Assign SUPERADMIN role — requirePermission middleware checks for
  // ANY UserConnectionRole row with role=SUPERADMIN (no connectionId filter),
  // so one entry is enough to grant global superadmin access.
  await prisma.userConnectionRole.upsert({
    where: {
      userId_connectionId: {
        userId: admin.id,
        connectionId: sampleConnection.id,
      },
    },
    update: {},
    create: {
      userId: admin.id,
      connectionId: sampleConnection.id,
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

  console.log(`✅ SUPERADMIN role assigned`);
  console.log('');
  console.log('─────────────────────────────────────');
  console.log('  Default admin credentials:');
  console.log('  Email   : admin@redisgui.local');
  console.log('  Password: Admin123!');
  console.log('─────────────────────────────────────');
}

main()
  .catch((e) => {
    console.error('Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
