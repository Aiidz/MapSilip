import { DashboardOverview } from '../components/DashboardOverview';

export default async function ManagementOverviewPage({ searchParams }: { searchParams: Promise<{ accessRequests?: string; export?: string }> }) {
  const { accessRequests, export: exportData } = await searchParams;
  return <DashboardOverview role="owner" showAccessRequests={accessRequests === '1'} showExport={exportData === '1'} />;
}
