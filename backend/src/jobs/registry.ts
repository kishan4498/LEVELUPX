import { createAiInsightProviderFromEnv } from "../modules/ai-insights/aiInsight.provider.js";
import { PrismaLeaderboardRepository } from "../modules/leaderboard/leaderboard.repository.js";
import { LeaderboardService } from "../modules/leaderboard/leaderboard.service.js";
import { PrismaBurnoutPredictionRepository } from "./burnout/burnoutPrediction.repository.js";
import { BurnoutPredictionService } from "./burnout/burnoutPrediction.service.js";
import { PrismaScheduledInsightRepository } from "./insights/scheduledInsight.repository.js";
import { ScheduledInsightService } from "./insights/scheduledInsight.service.js";
import { notificationService } from "../modules/notifications/notification.routes.js";
import { PrismaDailyDigestRepository } from "./digests/dailyDigest.repository.js";
import { DailyDigestService } from "./digests/dailyDigest.service.js";
import { PrismaQuestReminderRepository } from "./reminders/questReminder.repository.js";
import { QuestReminderService } from "./reminders/questReminder.service.js";
import { PrismaWeeklyReportRepository } from "./reports/weeklyReport.repository.js";
import { WeeklyReportService } from "./reports/weeklyReport.service.js";
import { PrismaWeeklyTeamQuestRepository } from "./guilds/weeklyTeamQuest.repository.js";
import { WeeklyTeamQuestService } from "./guilds/weeklyTeamQuest.service.js";
import type { Job } from "./job.types.js";

const weeklyReportJob: Job = {
  name: "weekly-report",
  description: "Generate a weekly platform progress summary for later delivery.",
  async run() {
    const service = new WeeklyReportService(new PrismaWeeklyReportRepository());
    const summary = await service.generate();

    return {
      name: weeklyReportJob.name,
      status: "completed",
      message: "Weekly platform report generated.",
      metadata: summary
    };
  }
};

const leaderboardRefreshJob: Job = {
  name: "leaderboard-refresh",
  description: "Refresh persisted leaderboard snapshots for global and guild leaderboards.",
  async run() {
    const service = new LeaderboardService(new PrismaLeaderboardRepository());
    const refresh = await service.refreshSnapshots();

    return {
      name: leaderboardRefreshJob.name,
      status: "completed",
      message: "Leaderboard snapshots refreshed.",
      metadata: {
        refreshedScopes: refresh.refreshedScopes,
        rowsWritten: refresh.rowsWritten
      }
    };
  }
};

const burnoutPredictionJob: Job = {
  name: "burnout-prediction",
  description: "Run non-diagnostic workload-strain rules and store recovery guidance.",
  async run() {
    const service = new BurnoutPredictionService(new PrismaBurnoutPredictionRepository());
    const summary = await service.run();

    return {
      name: burnoutPredictionJob.name,
      status: "completed",
      message: "Workload signal scan completed.",
      metadata: summary
    };
  }
};

const scheduledInsightJob: Job = {
  name: "scheduled-insights",
  description: "Generate AI insights for active users who have no recent insights.",
  async run() {
    const service = new ScheduledInsightService(
      new PrismaScheduledInsightRepository(),
      createAiInsightProviderFromEnv()
    );
    const summary = await service.run();

    return {
      name: scheduledInsightJob.name,
      status: "completed",
      message: "Scheduled insight generation completed.",
      metadata: summary
    };
  }
};

const questReminderJob: Job = {
  name: "quest-reminders",
  description: "Deliver due quest reminders while respecting notification preferences and quiet hours.",
  async run(ctx) {
    const service = new QuestReminderService(new PrismaQuestReminderRepository(), notificationService);
    const summary = await service.run(ctx.startedAt);

    return {
      name: questReminderJob.name,
      status: "completed",
      message: "Quest reminder delivery completed.",
      metadata: summary
    };
  }
};

const dailyDigestJob: Job = {
  name: "daily-digest",
  description: "Deliver each user's daily briefing after 08:00 in their local timezone.",
  async run(ctx) {
    const service = new DailyDigestService(new PrismaDailyDigestRepository(), notificationService);
    const summary = await service.run(ctx.startedAt);

    return {
      name: dailyDigestJob.name,
      status: "completed",
      message: "Daily briefing delivery completed.",
      metadata: summary
    };
  }
};

const weeklyTeamQuestJob: Job = {
  name: "weekly-team-quests",
  description: "Materialize the next due instance for each recurring weekly guild quest.",
  async run(ctx) {
    const service = new WeeklyTeamQuestService(new PrismaWeeklyTeamQuestRepository());
    const summary = await service.materialize(ctx.startedAt);

    return {
      name: weeklyTeamQuestJob.name,
      status: "completed",
      message: "Recurring weekly team quests materialized.",
      metadata: summary
    };
  }
};

export const registeredJobs = [
  weeklyReportJob,
  leaderboardRefreshJob,
  burnoutPredictionJob,
  scheduledInsightJob,
  questReminderJob,
  dailyDigestJob,
  weeklyTeamQuestJob
] satisfies Job[];

export function getJobsByName(names: string[]) {
  const byName = new Map(registeredJobs.map((job) => [job.name, job]));
  const jobs = names.flatMap((name) => {
    const job = byName.get(name);
    return job ? [job] : [];
  });
  const unknownNames = names.filter((name) => !byName.has(name));

  return { jobs, unknownNames };
}
