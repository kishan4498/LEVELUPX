import type { CoinTransaction, EconomySettings, XpTransaction } from "@prisma/client";

import { AppError } from "../../common/errors/AppError.js";
import type { IRewardRepository } from "./reward.repository.js";
import type {
  CoinHistoryItemDto,
  QuestRewardInput,
  RewardEconomyContextDto,
  RewardExportFileDto,
  RewardHistoryInput,
  RewardResult,
  RewardSummaryDto,
  XpHistoryItemDto
} from "./reward.types.js";

export class RewardService {
  constructor(private readonly repo: IRewardRepository) {}

  async computeQuestBounty(userId: string, bounty: QuestRewardInput): Promise<RewardResult> {
    const [settings, coinsEarnedToday] = await Promise.all([
      this.repo.getEconomySettings(),
      this.repo.getCoinsEarnedToday(userId)
    ]);

    return this.calculate(bounty, settings, coinsEarnedToday);
  }

  getEconomySettings() {
    return this.repo.getEconomySettings();
  }

  calculate(
    bounty: QuestRewardInput,
    settings: EconomySettings,
    coinsEarnedToday: number
  ): RewardResult {
    const streak = this.streakMultiplier(bounty.currentStreak);
    const multiplier = streak * settings.xpMultiplier;
    const coinIssuanceMultiplier = Math.max(0, 1 - settings.inflationRate / 100);
    const rawXp = Math.round(bounty.quest.xpReward * multiplier);
    const rawCoins = Math.round(
      bounty.quest.coinReward * settings.coinMultiplier * coinIssuanceMultiplier
    );
    const xp = Math.min(rawXp, settings.maxQuestReward);
    const cappedCoins = Math.min(rawCoins, settings.maxQuestReward);
    const remainingCoins = Math.max(0, settings.dailyCoinLimit - coinsEarnedToday);

    // Cap spendable rewards without suppressing XP for legitimate effort.
    const coins = Math.min(cappedCoins, remainingCoins);

    return {
      xp,
      coins,
      multiplier,
      dailyCoinLimitApplied: coins < cappedCoins
    };
  }

  private streakMultiplier(streak: number): number {
    // Stepped bonuses reward long streaks without unbounded growth.
    if (streak >= 30) return 2;
    if (streak >= 14) return 1.5;
    if (streak >= 7) return 1.25;
    return 1;
  }
}

export class RewardReadService {
  constructor(private readonly repo: IRewardRepository) {}

  async fetchPlayerEconomySummary(userId: string): Promise<RewardSummaryDto> {
    const summary = await this.repo.getSummary(userId);

    if (!summary.profile) {
      throw new AppError("User profile was not found", 404, "PROFILE_NOT_FOUND");
    }

    return {
      level: summary.profile.level,
      totalXp: summary.profile.totalXp,
      coins: summary.profile.coins,
      currentStreak: summary.profile.currentStreak,
      longestStreak: summary.profile.longestStreak,
      totalXpEarned: summary.totalXpEarned,
      totalCoinsEarned: summary.totalCoinsEarned,
      totalCoinsSpent: summary.totalCoinsSpent
    };
  }

  async fetchXpLedger(userId: string, query: RewardHistoryInput): Promise<XpHistoryItemDto[]> {
    const history = await this.repo.findXpHistory(userId, {
      skip: (query.page - 1) * query.limit,
      take: query.limit
    });

    return history.map((transaction) => this.toXpHistoryDto(transaction));
  }

  async fetchCoinLedger(userId: string, query: RewardHistoryInput): Promise<CoinHistoryItemDto[]> {
    const history = await this.repo.findCoinHistory(userId, {
      skip: (query.page - 1) * query.limit,
      take: query.limit
    });

    return history.map((transaction) => this.toCoinHistoryDto(transaction));
  }

  async fetchEconomyContext(userId: string): Promise<RewardEconomyContextDto> {
    const [settings, coinsEarnedToday] = await Promise.all([
      this.repo.getEconomySettings(),
      this.repo.getCoinsEarnedToday(userId)
    ]);

    return {
      xpMultiplier: settings.xpMultiplier,
      coinMultiplier: settings.coinMultiplier,
      inflationRate: settings.inflationRate,
      dailyCoinLimit: settings.dailyCoinLimit,
      maxQuestReward: settings.maxQuestReward,
      coinsEarnedToday,
      remainingDailyCoins: Math.max(0, settings.dailyCoinLimit - coinsEarnedToday),
      updatedAt: settings.updatedAt.toISOString()
    };
  }

  async dumpEconomyLedger(userId: string): Promise<RewardExportFileDto> {
    const [xpHistory, coinHistory] = await Promise.all([
      this.repo.findXpHistory(userId, { skip: 0, take: 500 }),
      this.repo.findCoinHistory(userId, { skip: 0, take: 500 })
    ]);
    const lines: (string | number | null)[][] = [
      ["ledger", "date", "type", "amount", "multiplier", "balanceAfter", "reason"],
      ...xpHistory.map((transaction) => [
        "XP",
        transaction.createdAt.toISOString(),
        transaction.sourceType,
        transaction.amount,
        transaction.multiplier,
        null,
        transaction.reason
      ]),
      ...coinHistory.map((transaction) => [
        "COIN",
        transaction.createdAt.toISOString(),
        transaction.type,
        transaction.amount,
        null,
        transaction.balanceAfter,
        transaction.reason
      ])
    ];

    return {
      filename: `levelupx-reward-ledger-${new Date().toISOString().slice(0, 10)}.csv`,
      contentType: "text/csv; charset=utf-8",
      content: this.toCsv(lines)
    };
  }

  private toXpHistoryDto(transaction: XpTransaction): XpHistoryItemDto {
    return {
      id: transaction.id,
      sourceType: transaction.sourceType,
      sourceId: transaction.sourceId,
      amount: transaction.amount,
      multiplier: transaction.multiplier,
      reason: transaction.reason,
      createdAt: transaction.createdAt.toISOString()
    };
  }

  private toCoinHistoryDto(transaction: CoinTransaction): CoinHistoryItemDto {
    return {
      id: transaction.id,
      type: transaction.type,
      amount: transaction.amount,
      reason: transaction.reason,
      balanceAfter: transaction.balanceAfter,
      createdAt: transaction.createdAt.toISOString()
    };
  }

  private toCsv(lines: (string | number | null)[][]) {
    return lines.map((line) => line.map((cell) => this.csvCell(cell)).join(",")).join("\n");
  }

  private csvCell(cell: string | number | null) {
    const raw = cell === null ? "" : String(cell);
    return `"${raw.replace(/"/g, '""')}"`;
  }
}
