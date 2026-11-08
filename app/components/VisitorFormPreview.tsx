'use client';

import { useState, type FormEvent } from 'react';
import { ResponsiveOverlay } from './ResponsiveOverlay';

export function VisitorFormPreview({ open, onClose, onSaved }: {
  open: boolean;
  onClose: () => void;
  onSaved?: () => void;
}) {
  const [busy,setBusy] = useState(false);
  const [message,setMessage] = useState('');
  const [requestKey,setRequestKey] = useState(() => crypto.randomUUID());
  function close() { setMessage(''); onClose(); }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();if (busy) return;
    const form = event.currentTarget;
    const fields = Object.fromEntries(new FormData(form).entries());
    setBusy(true);setMessage('');
    try { const response = await fetch('/api/operations',{ method:'POST',headers:{ 'Content-Type':'application/json' },
      body:JSON.stringify({ action:'visit.create',data:{ ...fields,request_key:requestKey } }) });
      if (!response.ok) throw new Error();
      form.reset();setRequestKey(crypto.randomUUID());onSaved?.();onClose();
    } catch { setMessage('The visit could not be saved. Check the details and try again.'); }
    finally { setBusy(false); }
  }
  return <ResponsiveOverlay
    open={open}
    onClose={close}
    title="Plan a visit"
    description="Share visitor information with the dormitory team."
    variant="dialog"
  >
    <form aria-label="Planned visitor details" className="preview-form" onSubmit={submit}>
      <fieldset><label htmlFor="visitor-name">Visitor name<input id="visitor-name" name="visitor_name" type="text" minLength={2} maxLength={120} required /></label>
        <label htmlFor="visit-date">Visit date<input id="visit-date" name="visit_on" type="date" required /></label>
        <div className="preview-form__time-row"><label htmlFor="arrival">Planned arrival<input id="arrival" name="arrival_time" type="time" required /></label>
          <label htmlFor="departure">Planned departure<input id="departure" name="departure_time" type="time" required /></label></div>
        <label htmlFor="visit-purpose">Purpose<input id="visit-purpose" name="purpose" maxLength={250} minLength={2} required /></label>
      </fieldset>
      {message && <p role="alert">{message}</p>}
      <div className="preview-form__footer"><button className="button button--secondary" type="button" onClick={close}>Cancel</button><button className="button button--primary" disabled={busy}>{busy?'Saving…':'Save planned visit'}</button></div>
    </form>
  </ResponsiveOverlay>;
}
