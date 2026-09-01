import { PrismaClient } from "@prisma/client";

import { builtInAchievements } from "../src/modules/achievements/achievement.seed.js";
import { builtInCharacterClasses } from "../src/modules/users/characterClass.seed.js";
import { builtInCosmetics } from "../src/modules/users/cosmetic.seed.js";
import { builtInSkills } from "../src/modules/users/skill.seed.js";

const prisma = new PrismaClient();

async function seed() {
  // Keep setup and Docker rebuilds safe to rerun.
  const classes = await prisma.characterClass.createMany({
    data: builtInCharacterClasses,
    skipDuplicates: true
  });

  const achievements = await prisma.achievement.createMany({
    data: builtInAchievements,
    skipDuplicates: true
  });

  const cosmetics = await prisma.cosmeticItem.createMany({
    data: builtInCosmetics,
    skipDuplicates: true
  });

  const existingSkillCount = await prisma.skill.count();

  for (const skill of builtInSkills) {
    await prisma.skill.upsert({
      where: { name: skill.name },
      create: {
        name: skill.name,
        description: skill.description,
        maxLevel: skill.maxLevel,
        prerequisiteLevel: skill.prerequisiteLevel
      },
      update: {
        description: skill.description,
        maxLevel: skill.maxLevel,
        prerequisiteLevel: skill.prerequisiteLevel
      }
    });
  }

  const synchronizedSkills = await prisma.skill.findMany({
    where: { name: { in: builtInSkills.map((skill) => skill.name) } }
  });
  const skillByName = new Map(synchronizedSkills.map((skill) => [skill.name, skill]));

  for (const skill of builtInSkills) {
    await prisma.skill.update({
      where: { name: skill.name },
      data: {
        prerequisiteSkillId: skill.prerequisiteName
          ? skillByName.get(skill.prerequisiteName)?.id ?? null
          : null
      }
    });
  }

  const economy = await prisma.economySettings.findFirst({
    orderBy: { createdAt: "asc" }
  });

  if (!economy) {
    // One global row gives admins safe defaults before they tune the economy.
    await prisma.economySettings.create({
      data: {
        xpMultiplier: 1,
        coinMultiplier: 1,
        dailyCoinLimit: 500,
        maxQuestReward: 1000,
        inflationRate: 0
      }
    });
  }

  console.log(
    [
      `Seeded ${classes.count} character classes`,
      `Seeded ${achievements.count} achievements`,
      `Seeded ${cosmetics.count} cosmetics`,
      existingSkillCount === 0 ? `Seeded ${builtInSkills.length} skills` : "Synchronized built-in skill tree",
      economy ? "Economy settings already existed" : "Seeded default economy settings"
    ].join("\n")
  );
}

seed()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
