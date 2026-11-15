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

function RequestAttachment({ id }: { id: string }) {
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

export function MaintenanceSubmissionDetails({ record }: { record: Row }) {
  const status = String(record.status ?? 'pending');
  const statusLabel = status.replaceAll('_', ' ').replace(/\b\w/g, letter => letter.toUpperCase());
  return <div className="maintenance-request-detail">
    <div className="maintenance-request-detail__summary">
      <span className="maintenance-request-detail__icon"><Icon name="wrench" /></span>
      <div><span className="maintenance-request-detail__eyebrow">Repair category</span><h3>{String(record.category ?? 'Maintenance request')}</h3></div>
      <span className={'maintenance-request-detail__status maintenance-request-detail__status--' + status}>{statusLabel}</span>
    </div>
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
