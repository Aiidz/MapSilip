'use client';

import { usePathname } from 'next/navigation';
import { OwnerDashboardLoading } from '../components/OwnerDashboardLoading';
import { WorkspaceLoading } from '../components/WorkspaceLoading';
import { PageHeader } from '../components/ui';

export default function ManagementLoading() {
  const pathname = usePathname();
  if (pathname?.replace(/\/$/, '') !== '/management') return <WorkspaceLoading />;
  return <div className="management-dashboard"><PageHeader title="Dashboard" /><OwnerDashboardLoading /></div>;
}
