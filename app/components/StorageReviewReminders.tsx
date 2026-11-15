'use client';
import { useEffect } from 'react';

/** Owner portal activity checks reminders; this never schedules or performs deletion. */
export function StorageReviewReminders() {
  useEffect(() => {
    const controller = new AbortController();
    void fetch('/api/storage', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'remind', data: {} }), signal: controller.signal }).catch(() => {});
    return () => controller.abort();
  }, []);
  return null;
}
