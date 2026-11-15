'use client';

import { useEffect, useState } from 'react';
import { ResponsiveOverlay } from './ResponsiveOverlay';
import { Icon } from './Icon';

function ReceiptLoading() {
  return <span className="receipt-loading" role="status" aria-label="Loading receipt">
    <span aria-hidden="true"><Icon name="receipt" /></span>
  </span>;
}

export function PaymentProofViewer({ attachmentId }: { attachmentId: string }) {
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
    <button type="button" className="payment-receipt-preview" onClick={() => setOpen(true)} aria-label="View uploaded receipt">
      {file?.image && (
        // Authorized private response is displayed through a temporary object URL.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={file.url} alt="" />
      )}
      {!file && !failed ? <ReceiptLoading /> : <span><Icon name="receipt" />{failed ? 'Receipt preview unavailable' : 'View uploaded receipt'}</span>}
    </button>
    <ResponsiveOverlay open={open} onClose={() => setOpen(false)} title="Payment receipt" className="payment-receipt-viewer">
      {file ? file.image ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={file.url} alt="Uploaded payment receipt" />
      ) : <iframe src={file.url + '#toolbar=0'} title="Uploaded payment receipt" /> : failed ? <p role="alert">The receipt could not be loaded. Close this viewer and try again later.</p> : <ReceiptLoading />}
    </ResponsiveOverlay>
  </>;
}
