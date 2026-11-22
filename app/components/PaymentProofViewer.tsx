'use client';

import { useEffect, useState } from 'react';
import { ResponsiveOverlay } from './ResponsiveOverlay';
import { Icon } from './Icon';

function ReceiptLoading({ label }: { label: string }) {
  return <span className="receipt-loading" role="status" aria-label={`Loading ${label}`}>
    <span aria-hidden="true"><Icon name="receipt" /></span>
  </span>;
}

export function PaymentProofViewer({ attachmentId, kind = 'receipt' }: { attachmentId: string; kind?: 'receipt' | 'contract' }) {
  const label = kind === 'contract' ? 'rental contract' : 'uploaded receipt';
  const title = kind === 'contract' ? 'Rental contract' : 'Payment receipt';
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<{ url: string; image: boolean } | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    let url = '';
    fetch('/api/attachments?id=' + encodeURIComponent(attachmentId), { signal: controller.signal })
      .then(async response => {
        if (!response.ok) throw new Error();
        const blob = await response.blob();
        if (controller.signal.aborted) return;
        url = URL.createObjectURL(blob);
        setFile({ url, image: blob.type.startsWith('image/') });
      }).catch(() => { if (!controller.signal.aborted) setFailed(true); });
    return () => { controller.abort(); if (url) URL.revokeObjectURL(url); };
  }, [attachmentId]);
  return <>
    <button type="button" className="payment-receipt-preview" onClick={() => setOpen(true)} aria-label={`View ${label}`}>
      {file?.image && (
        // Authorized private response is displayed through a temporary object URL.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={file.url} alt="" />
      )}
      {!file && !failed ? <ReceiptLoading label={label} /> : <span><Icon name="receipt" />{failed ? 'Preview unavailable' : `View ${label}`}</span>}
    </button>
    <ResponsiveOverlay open={open} onClose={() => setOpen(false)} title={title} className="payment-receipt-viewer">
      {file ? file.image ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={file.url} alt={title} />
      ) : <iframe src={file.url + '#toolbar=0'} title={title} /> : failed ? <p role="alert">The {label} could not be loaded. Close this viewer and try again later.</p> : <ReceiptLoading label={label} />}
      {kind === 'contract' && file && (
        <a className="button button--secondary" href={`/api/attachments?id=${encodeURIComponent(attachmentId)}`}>
          Download rental contract
        </a>
      )}
    </ResponsiveOverlay>
  </>;
}
