/** The previous closed calendar month in Manila. A late invocation retains its actual capture time. */
export function closedManilaPeriod(now) {
  const local = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit' })
    .formatToParts(now);
  const year = Number(local.find(part => part.type === 'year').value);
  const month = Number(local.find(part => part.type === 'month').value);
  const start = new Date(Date.UTC(year, month - 2, 0, 16));
  const end = new Date(Date.UTC(year, month - 1, 0, 16));
  const label = `${month === 1 ? year - 1 : year}-${String(month === 1 ? 12 : month - 1).padStart(2, '0')}`;
  return { label, fromInclusive: start.toISOString(), toExclusive: end.toISOString(), zone: 'Asia/Manila' };
}

/** enqueueOnce must atomically claim the key in the durable job registry. */
export function enqueueClosedMonth(enqueueOnce, { propertyKey, now, formatVersion }) {
  const period = closedManilaPeriod(now);
  return enqueueOnce({
    idempotencyKey: JSON.stringify(['monthly', propertyKey, period.label, formatVersion]),
    reason: 'monthly', scope: 'full', destinations: ['local', 'drive'],
    propertyKey, period, formatVersion, requestedAt: now.toISOString(),
  });
}

// Contemporary Manila civil time is UTC+08 year-round. All calendar arithmetic uses UTC methods.
export function nextScheduledRun({ frequency, weekday, month_day, year_month, local_time }, after) {
  const offset = 8 * 3600000;
  const local = new Date(after.getTime() + offset);
  const [hour, minute] = local_time.split(':').map(Number);
  const year = local.getUTCFullYear();
  const month = local.getUTCMonth();
  function candidate(y, m, day) {
    return new Date(Date.UTC(y, m, day, hour, minute) - offset);
  }
  if (frequency === 'weekly') {
    const day = local.getUTCDate() + (weekday - local.getUTCDay() + 7) % 7;
    const first = candidate(year, month, day);
    return first > after ? first : candidate(year, month, day + 7);
  }
  function inMonth(y, m) {
    const last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
    return candidate(y, m, Math.min(last, month_day));
  }
  const annual = frequency === 'yearly';
  const first = inMonth(year, annual ? year_month - 1 : month);
  return first > after ? first : annual ? inMonth(year + 1, year_month - 1) : inMonth(year, month + 1);
}

export function scheduledJob(frequency, due) {
  const day = new Date(due.getTime() + 8 * 3600000).toISOString().slice(0, 10);
  const period = frequency === 'monthly' ? closedManilaPeriod(due).label : day.slice(0, 7);
  const occurrence = frequency === 'monthly' ? period : frequency === 'yearly' ? day.slice(0, 4) : day;
  return { key: frequency + ':1:' + occurrence, period };
}
