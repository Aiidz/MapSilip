'use client';

import { useState, type ReactNode } from 'react';
import { ResponsiveOverlay } from '../../components/ResponsiveOverlay';
import styles from './backups.module.css';

export function BackupDialog({ title, children }: { title: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return <>
    <button type="button" className={`dashboard-export ${styles.button}`} aria-haspopup="dialog"
      onClick={() => setOpen(true)}>{title}</button>
    {open && <ResponsiveOverlay title={title} open onClose={() => setOpen(false)}>
      <div className={styles.dialogBody}>{children}</div>
    </ResponsiveOverlay>}
  </>;
}
