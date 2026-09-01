import type { NotificationService } from "../../modules/notifications/notification.service.js";
import type { DailyDigestCandidate, IDailyDigestRepository } from "./dailyDigest.repository.js";

const DELIVERY_START_MINUTES = 8 * 60;

export class DailyDigestService {
  constructor(
    private readonly repo: IDailyDigestRepository,
    private readonly notifier: NotificationService
  ) {}

  async run(now: Date) {
    const candidates = await this.repo.findCandidates(now, 500);
    const summary = {
      scanned: candidates.length,
      delivered: 0,
      beforeDeliveryWindow: 0,
      alreadyDelivered: 0,
      deferredForQuietHours: 0,
      failed: 0
    };

    for (const candidate of candidates) {
      const local = localTime(now, candidate.timezone);

      if (local.minutes < DELIVERY_START_MINUTES) {
        summary.beforeDeliveryWindow += 1;
        continue;
      }

      if (
        candidate.lastDailyDigestAt &&
        localTime(candidate.lastDailyDigestAt, candidate.timezone).dateKey === local.dateKey
      ) {
        summary.alreadyDelivered += 1;
        continue;
      }

      if (inQuietHours(candidate, local.minutes)) {
        summary.deferredForQuietHours += 1;
        continue;
      }

      const claimed = await this.repo.claimDelivery(
        candidate.preferenceId,
        candidate.lastDailyDigestAt,
        now
      );

      if (!claimed) {
        summary.alreadyDelivered += 1;
        continue;
      }

      try {
        const active = candidate.quests.length;
        const dueToday = candidate.quests.filter(
          (quest) => quest.dueDate && localTime(quest.dueDate, candidate.timezone).dateKey === local.dateKey
        ).length;
        const focus = candidate.focusSessions
          .filter((session) => localTime(session.startTime, candidate.timezone).dateKey === local.dateKey)
          .reduce((total, session) => total + (session.durationMinutes ?? 0), 0);
        let next = "Capture one useful next step when you are ready.";

        if (active > 0) {
          next = "Choose one quest and protect a focus block.";
        }

        if (dueToday > 0) {
          next = "Start with the nearest deadline.";
        }

        const sent = await this.notifier.dispatchNotification({
          userId: candidate.userId,
          title: `Good morning, ${firstName(candidate.name)}`,
          message: `Today: ${active} active quest${active === 1 ? "" : "s"}, ${dueToday} due, and ${focus} focus minutes recorded. ${next}`,
          category: "DAILY_DIGEST"
        });

        if (sent) {
          summary.delivered += 1;
        } else {
          summary.failed += 1;
        }
      } catch {
        // A bad timezone or delivery must not block every other user's digest.
        summary.failed += 1;
      }
    }

    return summary;
  }
}

function localTime(date: Date, timezone: string) {
  try {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23"
    }).formatToParts(date);
    const part = (type: Intl.DateTimeFormatPartTypes) =>
      parts.find((datePart) => datePart.type === type)?.value ?? "00";
    const hour = Number(part("hour"));
    const minute = Number(part("minute"));

    return {
      dateKey: `${part("year")}-${part("month")}-${part("day")}`,
      minutes: hour * 60 + minute
    };
  } catch {
    return {
      dateKey: date.toISOString().slice(0, 10),
      minutes: date.getUTCHours() * 60 + date.getUTCMinutes()
    };
  }
}

function inQuietHours(candidate: DailyDigestCandidate, localMinutes: number) {
  if (!candidate.quietHoursStart || !candidate.quietHoursEnd) {
    return false;
  }

  const start = toMinutes(candidate.quietHoursStart);
  const end = toMinutes(candidate.quietHoursEnd);

  if (start === end) {
    return true;
  }

  return start < end
    ? localMinutes >= start && localMinutes < end
    : localMinutes >= start || localMinutes < end;
}

function toMinutes(time: string) {
  const [hour, minute] = time.split(":").map(Number);
  return hour * 60 + minute;
}

function firstName(name: string) {
  return name.trim().split(/\s+/)[0] || "Player";
}
