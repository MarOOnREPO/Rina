import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding database...');

  // Create hardcoded users if they don't exist
  const maroon = await prisma.user.upsert({
    where: { username: 'maroon' },
    update: {},
    create: {
      username: 'maroon',
      displayName: 'MarOOn',
      timezone: 'Africa/Casablanca'
    }
  });

  const rina = await prisma.user.upsert({
    where: { username: 'rina' },
    update: {},
    create: {
      username: 'rina',
      displayName: 'Rina',
      timezone: 'Europe/Moscow'
    }
  });

  console.log(`✅ Users created: ${maroon.displayName}, ${rina.displayName}`);

  // Seed a sample countdown
  await prisma.countdown.upsert({
    where: { id: 'sample-countdown-1' },
    update: {},
    create: {
      id: 'sample-countdown-1',
      title: 'Next Visit',
      targetDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days from now
      location: 'Kenitra, Morocco',
      createdBy: maroon.id
    }
  });

  console.log('✅ Seed complete.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
