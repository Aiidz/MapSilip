'use client';

import { useEffect, useTransition } from 'react';
import { useRouter } from 'next/navigation';

export function BackupHistoryRefresh({ active }: { active: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (!active || pending) return;
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') startTransition(() => router.refresh());
    }, 5000);
    return () => window.clearInterval(timer);
  }, [active, pending, router]);

  return <button type="button" className="dashboard-export" disabled={pending}
    onClick={() => startTransition(() => router.refresh())}>{pending ? 'Refreshing…' : 'Refresh status'}</button>;
}
