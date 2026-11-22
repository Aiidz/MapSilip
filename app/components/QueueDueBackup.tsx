'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export function QueueDueBackup() {
  const router = useRouter();
  useEffect(() => {
    const controller = new AbortController();
    void fetch('/api/backups/jobs?action=due', { method: 'POST', signal: controller.signal })
      .then(async response => {
        if (response.ok && (await response.json()).queued > 0) router.refresh();
      })
      .catch(() => {});
    return () => controller.abort();
  }, [router]);
  return null;
}
