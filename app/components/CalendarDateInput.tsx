'use client';

import { useId, useRef, useState } from 'react';
import { Icon } from './Icon';

type Props = {
  name?: string;
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  min?: string;
  max?: string;
  required?: boolean;
};

const iso = (date: Date) => [
  String(date.getFullYear()).padStart(4, '0'),
  String(date.getMonth() + 1).padStart(2, '0'),
  String(date.getDate()).padStart(2, '0'),
].join('-');
const monthLabel = new Intl.DateTimeFormat('en-PH', { month: 'long', year: 'numeric' });
const dayLabel = new Intl.DateTimeFormat('en-PH', { dateStyle: 'full' });

export function CalendarDateInput({ name, value, defaultValue = '', onValueChange, min, max, required }: Props) {
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const popup = useRef<HTMLDivElement>(null);
  const [draft, setDraft] = useState(defaultValue);
  const [month, setMonth] = useState(() => new Date());
  const selected = value ?? draft;
  const first = new Date(month.getFullYear(), month.getMonth(), 1);
  const dates = Array.from({ length: 42 }, (_, i) =>
    new Date(first.getFullYear(), first.getMonth(), i - first.getDay() + 1));
  const today = iso(new Date());
  const allowed = (day: string) => (!min || day >= min) && (!max || day <= max);
  const validation = (day: string) => {
    if (!day) return '';
    const parsed = new Date(day + 'T12:00:00');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || Number.isNaN(parsed.getTime()) || iso(parsed) !== day) return 'Enter a valid date in YYYY-MM-DD format.';
    return allowed(day) ? '' : 'Choose a date within the allowed range.';
  };
  function update(day: string) {
    input.current?.setCustomValidity(validation(day));
    setDraft(day);
    onValueChange?.(day);
  }
  function choose(day: string) {
    update(day);
    popup.current?.hidePopover();
    trigger.current?.focus();
  }
  function positionPopup() {
    const panel = popup.current;
    const button = trigger.current;
    if (!panel || !button) return;
    const anchor = button.getBoundingClientRect();
    const width = Math.min(310, window.innerWidth - 16);
    const height = panel.offsetHeight;
    const left = Math.max(8, Math.min(anchor.right - width, window.innerWidth - width - 8));
    const preferredTop = anchor.bottom + 6 + height <= window.innerHeight - 8
      ? anchor.bottom + 6 : anchor.top - height - 6;
    panel.style.left = left + 'px';
    panel.style.top = Math.max(8, preferredTop) + 'px';
  }
  return <span className="calendar-date-input">
    <input ref={node => { input.current = node; node?.setCustomValidity(validation(selected)); }}
      type="text" name={name} value={selected} placeholder="YYYY-MM-DD" required={required}
      maxLength={10} onChange={event => update(event.target.value)} />
    <button ref={trigger} type="button" className="calendar-date-trigger" popoverTarget={id}
      aria-label="Open calendar" onClick={() => {
        const parsed = new Date(selected + 'T12:00:00');
        setMonth(validation(selected) || !selected ? new Date() : parsed);
      }}><Icon name="calendar" /></button>
    <div ref={popup} id={id} popover="auto" className="calendar-date-popup" role="dialog" aria-label="Choose a date"
      onToggle={event => { if (event.currentTarget.matches(':popover-open')) positionPopup(); }}>
      <div className="calendar-date-month">
        <button type="button" aria-label="Previous month" onClick={() => setMonth(new Date(first.getFullYear(), first.getMonth() - 1, 1))}>‹</button>
        <strong aria-live="polite">{monthLabel.format(first)}</strong>
        <button type="button" aria-label="Next month" onClick={() => setMonth(new Date(first.getFullYear(), first.getMonth() + 1, 1))}>›</button>
      </div>
      <div className="calendar-date-grid">
        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => <span key={day} aria-hidden="true">{day[0]}</span>)}
        {dates.map(date => {
          const day = iso(date);
          return <button key={day} type="button" className={date.getMonth() !== first.getMonth() ? 'is-outside' : undefined}
            aria-label={dayLabel.format(date)} aria-pressed={selected === day}
            aria-current={today === day ? 'date' : undefined} disabled={!allowed(day)}
            onClick={() => choose(day)}>{date.getDate()}</button>;
        })}
      </div>
      <div className="calendar-date-shortcuts">
        <button type="button" disabled={!allowed(today)} onClick={() => choose(today)}>Today</button>
        {!required && <button type="button" onClick={() => choose('')}>Clear date</button>}
      </div>
    </div>
  </span>;
}
