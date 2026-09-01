import { AchievementRarity } from "@prisma/client";

export const builtInAchievements = [
  {
    title: "First Quest",
    description: "Complete your first quest.",
    conditionType: "QUESTS_COMPLETED",
    conditionValue: 1,
    xpBonus: 25,
    coinBonus: 5,
    rarity: AchievementRarity.COMMON
  },
  {
    title: "Quest Streak Starter",
    description: "Complete 5 quests.",
    conditionType: "QUESTS_COMPLETED",
    conditionValue: 5,
    xpBonus: 75,
    coinBonus: 15,
    rarity: AchievementRarity.RARE
  },
  {
    title: "Level Climber",
    description: "Earn 1000 total XP.",
    conditionType: "TOTAL_XP",
    conditionValue: 1000,
    xpBonus: 100,
    coinBonus: 25,
    rarity: AchievementRarity.EPIC
  },
  {
    title: "Deep Work Initiate",
    description: "Complete 120 minutes of focus time.",
    conditionType: "FOCUS_MINUTES",
    conditionValue: 120,
    xpBonus: 60,
    coinBonus: 10,
    rarity: AchievementRarity.RARE
  }
];

