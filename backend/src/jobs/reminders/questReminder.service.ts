import type { NotificationService } from "../../modules/notifications/notification.service.js";
import type { DueQuestReminder, IQuestReminderRepository } from "./questReminder.repository.js";

export class QuestReminderService {
  constructor(
    private readonly repo: IQuestReminderRepository,
    private readonly notifier: NotificationService
  ) {}

  async run(now: Date) {
    const reminders = await this.repo.findDue(now, 500);
    let delivered = 0;
    let disabled = 0;
    let quiet = 0;

    for (const quest of reminders) {
      const prefs = quest.user.notificationPreference;

      if (prefs?.questReminders === false) {
        await this.repo.markSent(quest.id, now);
        disabled += 1;
        continue;
      }

      if (this.inQuietHours(quest, now)) {
        quiet += 1;
        continue;
      }

      const sent = await this.notifier.dispatchNotification({
        userId: quest.userId,
        title: "Quest reminder",
        message: `"${quest.title}" is ready for your attention.`,
        category: "QUEST_REMINDER"
      });
      await this.repo.markSent(quest.id, now);

      if (sent) {
        delivered += 1;
      } else {
        disabled += 1;
      }
    }

    return {
      scanned: reminders.length,
      delivered,
      disabled,
      deferredForQuietHours: quiet
    };
  }

  private inQuietHours(quest: DueQuestReminder, now: Date) {
    const { quietHoursStart, quietHoursEnd } = quest.user.notificationPreference ?? {};

    if (!quietHoursStart || !quietHoursEnd) {
      return false;
    }

    const timezone = quest.user.profile?.timezone ?? "UTC";
    const local = this.localMinutes(now, timezone);
    const start = this.toMinutes(quietHoursStart);
    const end = this.toMinutes(quietHoursEnd);

    if (start === end) {
      return true;
    }

    return start < end
      ? local >= start && local < end
      : local >= start || local < end;
  }

  private localMinutes(now: Date, timezone: string) {
    try {
      const parts = new Intl.DateTimeFormat("en-GB", {
        timeZone: timezone,
        hour: "2-digit",
        minute: "2-digit",
        hourCycle: "h23"
      }).formatToParts(now);
      const hour = Number(parts.find((part) => part.type === "hour")?.value ?? 0);
      const minute = Number(parts.find((part) => part.type === "minute")?.value ?? 0);
      return hour * 60 + minute;
    } catch {
      return now.getUTCHours() * 60 + now.getUTCMinutes();
    }
  }

  private toMinutes(time: string) {
    const [hour, minute] = time.split(":").map(Number);
    return hour * 60 + minute;
  }
}
