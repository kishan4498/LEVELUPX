import { prisma } from "../prisma/client.js";

const DEFAULT_HOSTS = ["localhost", "127.0.0.1", "::1"];

function databaseTarget() {
  const raw = process.env.DATABASE_URL;

  if (!raw) {
    return null;
  }

  try {
    const url = new URL(raw);
    const dbName = decodeURIComponent(url.pathname.replace(/^\//, "")).toLowerCase();
    const configured = (process.env.TEST_DATABASE_ALLOWED_HOSTS ?? "")
      .split(",")
      .map((host) => host.trim().toLowerCase())
      .filter(Boolean);
    const allowed = new Set([...DEFAULT_HOSTS, ...configured]);

    return {
      isAllowedHost: allowed.has(url.hostname.toLowerCase()),
      isTestDatabase: dbName.includes("test")
    };
  } catch {
    return null;
  }
}

export function isTestDatabaseConfigured() {
  const target = databaseTarget();

  return process.env.NODE_ENV === "test" && target?.isTestDatabase === true && target.isAllowedHost;
}

export function assertSafeTestDatabase() {
  if (process.env.NODE_ENV !== "test") {
    throw new Error("Database tests must run with NODE_ENV=test");
  }

  const target = databaseTarget();

  if (!target?.isTestDatabase || !target.isAllowedHost) {
    throw new Error("Refusing to reset a database that does not look like a local test database");
  }
}

export async function resetTestDatabase() {
  assertSafeTestDatabase();

  await prisma.$transaction([
    prisma.leaderboard.deleteMany(),
    prisma.notification.deleteMany(),
    prisma.abuseReport.deleteMany(),
    prisma.adminAction.deleteMany(),
    prisma.aiInsight.deleteMany(),
    prisma.userSkill.deleteMany(),
    prisma.teamQuestContribution.deleteMany(),
    prisma.teamQuest.deleteMany(),
    prisma.guildMember.deleteMany(),
    prisma.guild.deleteMany(),
    prisma.userAchievement.deleteMany(),
    prisma.achievement.deleteMany(),
    prisma.focusSession.deleteMany(),
    prisma.questCompletion.deleteMany(),
    prisma.quest.deleteMany(),
    prisma.xpTransaction.deleteMany(),
    prisma.coinTransaction.deleteMany(),
    prisma.userProfile.deleteMany(),
    prisma.characterClass.deleteMany(),
    prisma.skill.deleteMany(),
    prisma.economySettings.deleteMany(),
    prisma.user.deleteMany()
  ]);
}

export async function disconnectTestDatabase() {
  await prisma.$disconnect();
}
