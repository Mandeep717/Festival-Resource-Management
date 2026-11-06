const DAY_MS = 24 * 60 * 60 * 1000;

function utcDayStart(value) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return null;
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

export function isWithinFestivalDates(startTime, endTime, festival) {
  const start = new Date(startTime).getTime();
  const end = new Date(endTime).getTime();
  const festivalStart = utcDayStart(festival?.startDate);
  const festivalEnd = utcDayStart(festival?.endDate);

  if (
    !Number.isFinite(start) ||
    !Number.isFinite(end) ||
    festivalStart === null ||
    festivalEnd === null ||
    start >= end ||
    festivalEnd < festivalStart
  ) {
    return false;
  }

  // Festival dates are calendar days. Treat the end date as inclusive by
  // using the start of the following UTC day as the exclusive upper bound.
  return start >= festivalStart && end <= festivalEnd + DAY_MS;
}
