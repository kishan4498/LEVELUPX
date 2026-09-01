import { TeamQuestStatus, type TeamQuest } from "@prisma/client";
import { describe, expect, it } from "vitest";

import type {
  IWeeklyTeamQuestRepository,
  NextWeeklyTeamQuest
} from "./weeklyTeamQuest.repository.js";
import { WeeklyTeamQuestService } from "./weeklyTeamQuest.service.js";

function recurringQuest(patch: Partial<TeamQuest> = {}): TeamQuest {
  return {
    id: "quest-week-1",
    guildId: "guild-1",
    title: "Weekly Focus Sprint",
    targetType: "FOCUS_MINUTES",
    targetValue: 300,
    currentProgress: 300,
    rewardXp: 100,
    rewardCoins: 25,
    startDate: new Date("2026-08-10T08:00:00.000Z"),
    endDate: new Date("2026-08-16T20:00:00.000Z"),
    status: TeamQuestStatus.COMPLETED,
    repeatWeekly: true,
    recurrenceSeriesId: "series-1",
    recurrenceWeekStart: new Date("2026-08-10T00:00:00.000Z"),
    sourceTeamQuestId: null,
    ...patch
  };
}

class MemoryWeeklyRepo implements IWeeklyTeamQuestRepository {
  readonly rows: TeamQuest[] = [recurringQuest()];
  private readonly keys = new Set(["series-1:2026-08-10T00:00:00.000Z"]);

  async findRecurringTeamQuests() {
    return [...this.rows];
  }

  async createNext(source: TeamQuest, next: NextWeeklyTeamQuest) {
    const key = `${source.recurrenceSeriesId}:${next.recurrenceWeekStart.toISOString()}`;
    if (this.keys.has(key)) {
      return null;
    }

    this.keys.add(key);
    const created = recurringQuest({
      id: `quest-week-${this.rows.length + 1}`,
      currentProgress: 0,
      status: TeamQuestStatus.ACTIVE,
      startDate: next.startDate,
      endDate: next.endDate,
      recurrenceWeekStart: next.recurrenceWeekStart,
      sourceTeamQuestId: source.id
    });
    this.rows.push(created);
    return created;
  }
}

describe("WeeklyTeamQuestService", () => {
  it("materializes the next weekly instance once and preserves the series", async () => {
    const repo = new MemoryWeeklyRepo();
    const service = new WeeklyTeamQuestService(repo);
    const now = new Date("2026-08-17T08:00:00.000Z");

    const first = await service.materialize(now);
    const second = await service.materialize(now);

    expect(first).toMatchObject({ dueSeries: 1, created: 1, alreadyMaterialized: 0 });
    expect(second).toMatchObject({ dueSeries: 0, created: 0, alreadyMaterialized: 0 });
    expect(repo.rows).toHaveLength(2);
    expect(repo.rows[1]).toMatchObject({
      recurrenceSeriesId: "series-1",
      recurrenceWeekStart: new Date("2026-08-17T00:00:00.000Z"),
      sourceTeamQuestId: "quest-week-1",
      currentProgress: 0,
      status: TeamQuestStatus.ACTIVE
    });
  });

  it("uses the uniqueness guard when concurrent runs race on the same series/week", async () => {
    const repo = new MemoryWeeklyRepo();
    const now = new Date("2026-08-17T08:00:00.000Z");
    const [left, right] = await Promise.all([
      new WeeklyTeamQuestService(repo).materialize(now),
      new WeeklyTeamQuestService(repo).materialize(now)
    ]);

    expect(left.created + right.created).toBe(1);
    expect(left.alreadyMaterialized + right.alreadyMaterialized).toBe(1);
    expect(repo.rows).toHaveLength(2);
  });

  it("does not create a future instance before its week begins", async () => {
    const repo = new MemoryWeeklyRepo();
    const summary = await new WeeklyTeamQuestService(repo).materialize(
      new Date("2026-08-17T07:59:59.999Z")
    );

    expect(summary).toMatchObject({ dueSeries: 0, created: 0 });
    expect(repo.rows).toHaveLength(1);
  });

  it("skips missed historical weeks after a long scheduler outage", async () => {
    const repo = new MemoryWeeklyRepo();
    const summary = await new WeeklyTeamQuestService(repo).materialize(
      new Date("2026-09-02T08:00:00.000Z")
    );

    expect(summary).toMatchObject({ dueSeries: 1, created: 1 });
    expect(repo.rows[1]).toMatchObject({
      startDate: new Date("2026-08-31T08:00:00.000Z"),
      endDate: new Date("2026-09-06T20:00:00.000Z"),
      recurrenceWeekStart: new Date("2026-08-31T00:00:00.000Z")
    });
  });

  it("advances to the next eligible week when the current week's active window already ended", async () => {
    const repo = new MemoryWeeklyRepo();
    repo.rows[0] = recurringQuest({
      endDate: new Date("2026-08-10T09:00:00.000Z")
    });

    const service = new WeeklyTeamQuestService(repo);
    const now = new Date("2026-09-02T08:00:00.000Z");
    const summary = await service.materialize(now);
    const replay = await service.materialize(now);

    expect(summary).toMatchObject({ dueSeries: 1, created: 1, alreadyMaterialized: 0 });
    expect(replay).toMatchObject({ dueSeries: 0, created: 0, alreadyMaterialized: 0 });
    expect(repo.rows).toHaveLength(2);
    expect(repo.rows[1]).toMatchObject({
      startDate: new Date("2026-09-07T08:00:00.000Z"),
      endDate: new Date("2026-09-07T09:00:00.000Z"),
      recurrenceWeekStart: new Date("2026-09-07T00:00:00.000Z")
    });
  });

  it("counts recurring rows whose series metadata is incomplete", async () => {
    const repo = new MemoryWeeklyRepo();
    repo.rows.push(recurringQuest({
      id: "malformed-weekly-quest",
      recurrenceSeriesId: null,
      recurrenceWeekStart: null
    }));

    const summary = await new WeeklyTeamQuestService(repo).materialize(
      new Date("2026-08-17T08:00:00.000Z")
    );

    expect(summary.invalidSeries).toBe(1);
  });
});
