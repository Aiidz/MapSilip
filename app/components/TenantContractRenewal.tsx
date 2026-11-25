'use client';

import { useEffect, useState } from 'react';
import { ResponsiveOverlay } from './ResponsiveOverlay';

const renewalUpdated = 'mapsilip-contract-renewal-updated';

type Renewal = { assignmentId: string; endOn: string; expired: boolean; requested: boolean };

export function TenantContractRenewal({ reminder = false }: { reminder?: boolean }) {
  const [renewal, setRenewal] = useState<Renewal | null>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    const controller = new AbortController();
    function sync(event: Event) {
      const data = (event as CustomEvent<Renewal>).detail;
      setRenewal(data);
      setOpen(false);
      setError('');
    }
    window.addEventListener(renewalUpdated, sync);
    void fetch('/api/tenant/renewal', { signal: controller.signal, cache: 'no-store' }).then(async response => {
      if (!response.ok) throw new Error();
      const data = await response.json() as Renewal | null;
      if (controller.signal.aborted || !data) return;
      setRenewal(data);
      if (reminder && !data.requested) {
        const key = `mapsilip.contract-reminder:${data.assignmentId}:${data.endOn}:${data.expired ? 'expired' : 'upcoming'}`;
        try {
          if (sessionStorage.getItem(key)) return;
          sessionStorage.setItem(key, 'seen');
        } catch { /* The reminder still works with browser storage disabled. */ }
        setOpen(true);
      }
    }).catch(() => { if (!controller.signal.aborted && !reminder) setError('Renewal status could not be loaded.'); });
    return () => {
      controller.abort();
      window.removeEventListener(renewalUpdated, sync);
    };
  }, [reminder]);

  async function submit() {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      const response = await fetch('/api/tenant/renewal', { method: 'POST' });
      if (!response.ok) throw new Error();
      window.dispatchEvent(new CustomEvent<Renewal>(renewalUpdated, { detail: await response.json() }));
    } catch { setError('Could not send the renewal request. Please try again.'); }
    finally { setBusy(false); }
  }

  if (!renewal) return error ? <p role="status">{error}</p> : null;
  const end = new Intl.DateTimeFormat('en-PH', { dateStyle: 'long', timeZone: 'Asia/Manila' }).format(new Date(renewal.endOn + 'T00:00:00+08:00'));
  return <>
    {!reminder && <div id="contract-renewal">
      {renewal.requested ? <p role="status">Renewal requested. Waiting for admin review.</p>
        : <button type="button" className="button button--secondary" onClick={() => setOpen(true)}>Request renewal</button>}
    </div>}
    <ResponsiveOverlay open={open} onClose={() => setOpen(false)} dismissible={!busy}
      title={renewal.expired ? 'Your contract has ended' : 'Your contract is ending soon'}>
      <p>Your contract {renewal.expired ? 'ended' : 'ends'} on <strong>{end}</strong>. Would you like to request another six-month term?</p>
      {error && <p role="alert">{error}</p>}
      <div className="ps-overlay__actions">
        <button type="button" className="button button--secondary" disabled={busy} onClick={() => setOpen(false)}>Not now</button>
        <button type="button" className="button button--primary" disabled={busy} onClick={() => void submit()}>{busy ? 'Sending…' : 'Request renewal'}</button>
      </div>
    </ResponsiveOverlay>
  </>;
}
