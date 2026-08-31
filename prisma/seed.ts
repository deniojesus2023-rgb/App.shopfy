import { PrismaClient, type Prisma } from "@prisma/client";

import { PROGRESS_REWARD_COD_TEMPLATE } from "../src/modules/funnels/config/seed-templates";

const prisma = new PrismaClient();

// FunnelConfig é JSON puro (garantido pelo Zod em seed-templates.ts), mas
// seus literais/union types não satisfazem o índice `InputJsonObject` do
// Prisma — mesmo cast usado em modules/funnels/service.ts.
const templateData = {
  ...PROGRESS_REWARD_COD_TEMPLATE,
  defaultConfig: PROGRESS_REWARD_COD_TEMPLATE.defaultConfig as Prisma.InputJsonValue,
};

async function main() {
  await prisma.funnelTemplate.upsert({
    where: { key: templateData.key },
    create: templateData,
    update: templateData,
  });

  console.log(`Seed concluído: template ${templateData.key}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
