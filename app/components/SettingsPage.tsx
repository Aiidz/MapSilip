import type { ReactNode } from 'react';
import Link from 'next/link';
import { PageHeader } from './ui';

const tabs = [
  { id: 'profile', label: 'Profile' },
  { id: 'notifications', label: 'Notifications' },
  { id: 'payments', label: 'Payments' },
  { id: 'backups', label: 'Backups' },
] as const;

type Area = 'management' | 'caretaker' | 'tenant';
type Section = typeof tabs[number]['id'];

export function SettingsPage({ area, section, children }: { area: Area; section: Section; children: ReactNode }) {
  const label = tabs.find(tab => tab.id === section)?.label;
  const visibleTabs = area === 'management' ? tabs : tabs.slice(0, 2);
  return <div className="preferences-page">
    <PageHeader title="Settings" />
    <nav className="preferences-nav" aria-label="Settings sections">
      {visibleTabs.map(tab => <Link key={tab.id} href={`/${area}/settings?section=${tab.id}`}
        aria-current={tab.id === section ? 'page' : undefined}>{tab.label}</Link>)}
    </nav>
    <section className="preferences-content" id={section} aria-labelledby="settings-section-title">
      <h2 id="settings-section-title">{label}</h2>
      {children}
    </section>
  </div>;
}
