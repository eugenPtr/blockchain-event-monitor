import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const chain = await prisma.chain.upsert({
    where: { chainId: 1 },
    update: {},
    create: {
      chainId: 1,
      name: 'ethereum',
    },
  });

  console.log(`Seeded chain: ${JSON.stringify(chain)}`);
}

main()
  .catch((e) => {
    console.error(e);
  })
  .finally(async () => {
    await prisma.$disconnect();
  }); 