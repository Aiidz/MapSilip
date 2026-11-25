import { redirect } from 'next/navigation';
import { DashboardOverview } from '../components/DashboardOverview';

export default async function ManagementOverviewPage({ searchParams }: { searchParams: Promise<{ accessRequests?: string; export?: string }> }) {
  const { accessRequests, export: exportData } = await searchParams;
  if (exportData === '1') redirect('/management/storage');
  return <DashboardOverview role="owner" showAccessRequests={accessRequests === '1'} />;
}
