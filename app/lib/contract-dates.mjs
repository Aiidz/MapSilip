function parseDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || value.startsWith('0000')) return null;
  const date = new Date(value + 'T00:00:00Z');
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value ? date : null;
}

/** Use an explicit end date, or round the last day of the six-month term to month-end. */
export function contractEndDate(start, override) {
  const date = parseDate(start);
  if (!date) return null;
  if (override != null) return parseDate(override) && override >= start ? override : null;

  const day = date.getUTCDate();
  date.setUTCMonth(date.getUTCMonth() + 7, 0);
  date.setUTCDate(Math.min(day, date.getUTCDate()) - 1);
  date.setUTCMonth(date.getUTCMonth() + 1, 0);
  const end = date.toISOString().slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(end) ? end : null;
}
