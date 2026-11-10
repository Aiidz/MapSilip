'use client';

import { useState, type FormEvent } from 'react';
import { CalendarDatePicker } from './TenantFormControls';
import { ResponsiveOverlay } from './ResponsiveOverlay';

export function VisitorFormPreview({
  open,
  onClose,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  onSaved?: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [requestKey, setRequestKey] = useState(() => crypto.randomUUID());
  const [visitDate, setVisitDate] = useState(() => new Date().toISOString().slice(0, 10));

  function close() {
    setMessage('');
    onClose();
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const form = event.currentTarget;
    const fields = Object.fromEntries(new FormData(form).entries());
    setBusy(true);
    setMessage('');
    try {
      const response = await fetch('/api/operations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'visit.create', data: { ...fields, request_key: requestKey } }),
      });
      if (!response.ok) throw new Error();
      form.reset();
      setRequestKey(crypto.randomUUID());
      onSaved?.();
      onClose();
    } catch {
      setMessage('The visit could not be saved. Check the details and try again.');
    } finally {
      setBusy(false);
    }
  }

  const todayStr = new Date().toISOString().slice(0, 10);

  return (
    <ResponsiveOverlay open={open} onClose={close} title="Plan a visit" variant="dialog">
      <div className="tenant-form-panel tenant-form-panel--bare">
        <form aria-label="Planned visitor details" className="tenant-modal-form" onSubmit={submit}>
          <label htmlFor="visitor-name">
            <span>Visitor name</span>
            <input
              id="visitor-name"
              name="visitor_name"
              type="text"
              minLength={2}
              maxLength={120}
              placeholder="Full name of visitor"
              required
            />
          </label>

          <label>
            <span>Visit date</span>
            <CalendarDatePicker
              name="visit_on"
              value={visitDate}
              onChange={setVisitDate}
              minDate={todayStr}
              required
            />
          </label>

          <div className="tenant-form-row">
            <label htmlFor="arrival">
              <span>Planned arrival</span>
              <input id="arrival" name="arrival_time" type="time" required />
            </label>
            <label htmlFor="departure">
              <span>Planned departure</span>
              <input id="departure" name="departure_time" type="time" required />
            </label>
          </div>

          <label htmlFor="visit-purpose">
            <span>Purpose</span>
            <input
              id="visit-purpose"
              name="purpose"
              type="text"
              maxLength={250}
              minLength={2}
              placeholder="e.g. Study session, family visit"
              required
            />
          </label>

          {message && <p role="alert">{message}</p>}

          <button className="button button--primary" type="submit" disabled={busy}>
            {busy ? 'Saving…' : 'Save planned visit'}
          </button>
        </form>
      </div>
    </ResponsiveOverlay>
  );
}
