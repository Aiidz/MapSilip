'use client';

import { useEffect, useState } from 'react';
import { Icon } from './Icon';

type Row = Record<string, unknown>;
const dateLabel = (value: unknown) => {
  const date = new Date(String(value ?? ''));
  return Number.isNaN(date.getTime()) ? 'Not available' : new Intl.DateTimeFormat('en-PH', {
    month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Manila',
  }).format(date);
};

export function RequestAttachment({ id }: { id: string }) {
  const [preview, setPreview] = useState('');
  const [state, setState] = useState('loading');
  const href = '/api/attachments?id=' + encodeURIComponent(id);
  useEffect(() => {
    const controller = new AbortController();
    let objectUrl = '';
    fetch(href, { signal: controller.signal }).then(async response => {
      if (!response.ok) throw new Error();
      const blob = await response.blob();
      if (controller.signal.aborted) return;
      if (['image/jpeg', 'image/png', 'image/webp'].includes(blob.type)) {
        objectUrl = URL.createObjectURL(blob);
        setPreview(objectUrl);
        setState('image');
      } else setState('document');
    }).catch(() => { if (!controller.signal.aborted) setState('error'); });
    return () => { controller.abort(); if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [href]);
  return <div className="maintenance-request-photo">
    {preview ? (
      // Private previews use an authorized response blob, not a public image URL.
      // eslint-disable-next-line @next/next/no-img-element
      <img src={preview} alt="Photo attached to this maintenance request" />
    ) : <div className="maintenance-request-photo__placeholder"><Icon name="fileSearch" /><span>{state === 'loading' ? 'Loading attachment…' : state === 'error' ? 'Preview unavailable' : 'Document attached'}</span></div>}
    <a href={href}>Download attachment <span aria-hidden="true">↗</span></a>
  </div>;
}

function MaintenanceFeedback({ record, onRate }: { record: Row; onRate: (rating: number, comment: string) => Promise<void> }) {
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  if (record.satisfaction_rating) return <section className="maintenance-feedback">
    <h3>Your feedback</h3>
    <p className="maintenance-feedback__result">{String(record.satisfaction_rating)} out of 5 stars</p>
    {Boolean(record.satisfaction_comment) && <p>{String(record.satisfaction_comment)}</p>}
  </section>;

  return <form className="maintenance-feedback" onSubmit={async event => {
    event.preventDefault();
    if (!rating || busy) return;
    setBusy(true);
    setError(false);
    try { await onRate(rating, comment.trim()); }
    catch { setError(true); }
    finally { setBusy(false); }
  }}>
    <fieldset disabled={busy}>
      <legend>How satisfied were you with the repair?</legend>
      <div className="maintenance-feedback__stars">
        {[1, 2, 3, 4, 5].map(value => <label key={value} data-filled={value <= rating}>
          <input className="sr-only" type="radio" name="satisfaction" value={value} checked={rating === value}
            onChange={() => setRating(value)} aria-label={value === 1 ? '1 star' : `${value} stars`} />
          <span aria-hidden="true">{value <= rating ? '★' : '☆'}</span>
        </label>)}
      </div>
      <label className="maintenance-feedback__comment">Comment <span>(optional)</span>
        <textarea rows={3} maxLength={1000} value={comment} onChange={event => setComment(event.target.value)} />
      </label>
    </fieldset>
    {error && <p role="alert">Couldn’t submit feedback. Reopen this request to check whether it was saved.</p>}
    <button className="button button--primary" disabled={!rating || busy}>{busy ? 'Submitting…' : 'Submit feedback'}</button>
  </form>;
}

export function MaintenanceSubmissionDetails({ record, onRate }: { record: Row; onRate: (rating: number, comment: string) => Promise<void> }) {
  const status = String(record.status ?? 'pending');
  const statusLabel = status.replaceAll('_', ' ').replace(/\b\w/g, letter => letter.toUpperCase());
  return <div className="maintenance-request-detail">
    <div className="maintenance-request-detail__summary">
      <span className="maintenance-request-detail__icon"><Icon name="wrench" /></span>
      <div><span className="maintenance-request-detail__eyebrow">Repair category</span><h3>{String(record.category ?? 'Maintenance request')}</h3></div>
      <span className={'maintenance-request-detail__status maintenance-request-detail__status--' + status}>{statusLabel}</span>
    </div>
    {status === 'resolved' && 'satisfaction_rating' in record && <MaintenanceFeedback record={record} onRate={onRate} />}
    <dl className="maintenance-request-detail__dates">
      <div><dt>Reported</dt><dd>{dateLabel(record.created_at)}</dd></div>
      <div><dt>Last updated</dt><dd>{dateLabel(record.updated_at)}</dd></div>
    </dl>
    <section><h3>Description</h3><p>{String(record.description || 'No description provided.')}</p></section>
    <section><h3>Photo or attachment</h3>{record.attachment_id
      ? <RequestAttachment key={String(record.attachment_id)} id={String(record.attachment_id)} />
      : <div className="maintenance-request-detail__no-photo"><Icon name="fileSearch" /><span>No attachment included</span></div>}
    </section>
    <section className="maintenance-request-detail__response"><h3>Staff response</h3><p>{String(record.staff_response || 'No response yet. Updates from the dormitory team will appear here.')}</p></section>
  </div>;
}
