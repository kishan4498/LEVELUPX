const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

export function startOfUtcWeek(source: Date) {
  const result = new Date(Date.UTC(source.getUTCFullYear(), source.getUTCMonth(), source.getUTCDate()));
  const daysSinceMonday = (result.getUTCDay() + 6) % 7;
  result.setUTCDate(result.getUTCDate() - daysSinceMonday);
  return result;
}

export function addUtcWeek(source: Date) {
  return new Date(source.getTime() + WEEK_MS);
}

export function isAtMostOneWeek(start: Date, end: Date) {
  return end.getTime() - start.getTime() <= WEEK_MS;
}
