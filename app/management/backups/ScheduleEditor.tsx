'use client';

import { useState } from 'react';
import styles from './backups.module.css';

const frequencies = ['weekly', 'monthly', 'yearly'] as const;
type Frequency = typeof frequencies[number];
type Settings = { frequency: Frequency; weekday: number; month_day: number; year_month: number; local_time: string };
const weekdays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const months = Array.from({ length: 12 }, (_, index) => new Intl.DateTimeFormat('en', {
  month: 'short', timeZone: 'UTC',
}).format(Date.UTC(2024, index)));

export function ScheduleEditor({ settings, enabled }: { settings?: Settings; enabled: boolean }) {
  const [frequency, setFrequency] = useState<Frequency>(settings?.frequency ?? 'monthly');
  return <form className={styles.editor} method="post" action="/api/backups/jobs?action=schedule&from=settings">
    <fieldset className={styles.segments}>
      <legend>Frequency</legend>
      {frequencies.map(option => <label key={option}>
        <input type="radio" name="frequency" value={option} checked={frequency === option}
          onChange={() => setFrequency(option)} /><span>{option}</span>
      </label>)}
    </fieldset>
    {frequency === 'weekly' && <fieldset className={styles.segments}>
      <legend>Day of week</legend>
      {weekdays.map((day, index) => <label key={day}>
        <input type="radio" name="weekday" value={index} defaultChecked={index === (settings?.weekday ?? 1)} /><span>{day}</span>
      </label>)}
    </fieldset>}
    {frequency === 'yearly' && <fieldset className={`${styles.segments} ${styles.months}`}>
      <legend>Month</legend>
      {months.map((month, index) => <label key={month}>
        <input type="radio" name="year_month" value={index + 1} defaultChecked={index + 1 === (settings?.year_month ?? 1)} /><span>{month}</span>
      </label>)}
    </fieldset>}
    <div className={styles.scheduleFields}>
      {frequency !== 'weekly' && <label>Day of month<input name="month_day" type="number" min={1} max={31}
        required defaultValue={settings?.month_day ?? 1} title="Shorter months run on their last day" /></label>}
      <label>Time (Manila)<input type="time" name="local_time" required defaultValue={settings?.local_time.slice(0, 5) ?? '00:00'} /></label>
    </div>
    <button className="button button--primary">{enabled ? 'Save schedule' : 'Enable backups'}</button>
  </form>;
}
