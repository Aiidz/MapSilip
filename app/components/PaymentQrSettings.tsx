'use client';

import './payment-settings.css';
import { useState, type FormEvent } from 'react';
import { TenantFileDropzone } from './TenantFormControls';
import { Panel } from './ui';

export function PaymentQrSettings() {
  const [revision, setRevision] = useState(0);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    if (await change('POST', new FormData(form))) form.reset();
  }

  async function change(method: 'POST' | 'DELETE', body?: FormData) {
    setBusy(true);
    setMessage('');
    try {
      const result = await fetch('/api/paymentqr', { method, body });
      if (!result.ok) throw new Error();
      setReady(false);
      setRevision(value => value + 1);
      setMessage(method === 'POST' ? 'GCash QR saved.' : 'GCash QR disabled.');
      return true;
    } catch {
      setMessage(method === 'POST' ? 'Could not save the QR. Use a scannable merchant PNG or JPEG and try again.' : 'Could not disable the QR. Try again.');
      return false;
    } finally { setBusy(false); }
  }

  return <Panel title="GCash merchant QR">
    <form className="operational-form preferences-payment-form" onSubmit={save}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img key={revision} src={`/api/paymentqr?v=${revision}`} alt="Active GCash merchant QR" width={280}
        style={{ display: ready ? 'block' : 'none', maxWidth: '100%', height: 'auto' }}
        onLoad={() => setReady(true)} onError={() => setReady(false)} />
      <fieldset className="payment-qr-upload" disabled={busy}>
        <legend>Upload merchant QR</legend>
        <TenantFileDropzone key={revision} name="file" accept="image/png,image/jpeg" required
          title="Choose QR image" subtitle="PNG or JPEG · up to 2 MB" disabled={busy} />
      </fieldset>
      <label className="payment-qr-confirm"><input type="checkbox" required disabled={busy} /><span>I verified that this QR belongs to the dormitory’s GCash merchant account.</span></label>
      <div className="payment-qr-actions">
        <button className="button button--primary" disabled={busy}>{busy ? "Working…" : "Save QR"}</button>
        <button className="button button--secondary" type="button" disabled={busy || !ready} onClick={() => void change('DELETE')}>Disable QR</button>
      </div>
      {message && <p role="status">{message}</p>}
    </form>
  </Panel>;
}
