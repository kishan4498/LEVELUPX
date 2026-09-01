export type LogLevel = "debug" | "info" | "warn" | "error" | "silent";

const LOG_PRIORITY: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
  silent: 100
};

export type LogEntry = {
  level: Exclude<LogLevel, "silent">;
  message: string;
  timestamp?: string;
  [key: string]: unknown;
};

export function shouldLog(configured: LogLevel, level: Exclude<LogLevel, "silent">) {
  return LOG_PRIORITY[level] >= LOG_PRIORITY[configured];
}

export function writeLog(log: LogEntry, configured: LogLevel = "info") {
  if (!shouldLog(configured, log.level)) {
    return;
  }

  const event = {
    timestamp: log.timestamp ?? new Date().toISOString(),
    ...log
  };

  const line = JSON.stringify(event);

  if (log.level === "error") {
    console.error(line);
    return;
  }

  if (log.level === "warn") {
    console.warn(line);
    return;
  }

  console.log(line);
}
