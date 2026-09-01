import type { TeamQuest } from "@prisma/client";

import { publishRealtimeEvent } from "../../realtime/realtime.publisher.js";
import { realtimeEvents } from "../../realtime/realtime.types.js";
import { addUtcWeek } from "../../modules/guilds/teamQuestRecurrence.js";
import type { IWeeklyTeamQuestRepository } from "./weeklyTeamQuest.repository.js";

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

export type WeeklyTeamQuestSummary = {
  seriesInspected: number;
  dueSeries: number;
  created: number;
  alreadyMaterialized: number;
  invalidSeries: number;
};

export class WeeklyTeamQuestService {
  constructor(private readonly repo: IWeeklyTeamQuestRepository) {}

  async materialize(now: Date): Promise<WeeklyTeamQuestSummary> {
    const recurring = await this.repo.findRecurringTeamQuests();
    const latestBySeries = new Map<string, TeamQuest>();
    let invalidSeries = 0;

    for (const quest of recurring) {
      if (!quest.recurrenceSeriesId || !quest.recurrenceWeekStart) {
        invalidSeries += 1;
        continue;
      }

      const existing = latestBySeries.get(quest.recurrenceSeriesId);
      if (!existing || quest.recurrenceWeekStart.getTime() > existing.recurrenceWeekStart!.getTime()) {
        latestBySeries.set(quest.recurrenceSeriesId, quest);
      }
    }

    let dueSeries = 0;
    let created = 0;
    let alreadyMaterialized = 0;

    for (const latest of latestBySeries.values()) {
      const nextWeekStart = addUtcWeek(latest.recurrenceWeekStart!);
      const nextStartDate = addUtcWeek(latest.startDate);
      if (nextStartDate.getTime() > now.getTime()) {
        continue;
      }

      dueSeries += 1;
      const durationMs = latest.endDate.getTime() - latest.startDate.getTime();
      const missedWeeks = Math.max(
        0,
        Math.floor((now.getTime() - nextStartDate.getTime()) / WEEK_MS)
      );
      let materializedStart = new Date(nextStartDate.getTime() + missedWeeks * WEEK_MS);
      let materializedWeekStart = new Date(nextWeekStart.getTime() + missedWeeks * WEEK_MS);

      // If this week's short active window already ended, schedule the next
      // eligible week instead of backfilling an unusable ACTIVE instance.
      if (materializedStart.getTime() + durationMs < now.getTime()) {
        materializedStart = addUtcWeek(materializedStart);
        materializedWeekStart = addUtcWeek(materializedWeekStart);
      }

      const next = await this.repo.createNext(latest, {
        startDate: materializedStart,
        endDate: new Date(materializedStart.getTime() + durationMs),
        recurrenceWeekStart: materializedWeekStart
      });

      if (!next) {
        alreadyMaterialized += 1;
        continue;
      }

      created += 1;
      publishRealtimeEvent({
        name: realtimeEvents.teamQuestCreated,
        guildId: next.guildId,
        payload: {
          teamQuestId: next.id,
          title: next.title,
          targetType: next.targetType,
          targetValue: next.targetValue,
          status: next.status
        }
      });
    }

    return {
      seriesInspected: latestBySeries.size,
      dueSeries,
      created,
      alreadyMaterialized,
      invalidSeries
    };
  }
}
