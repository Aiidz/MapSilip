import { DashboardOverview } from '../components/DashboardOverview';

export default async function ManagementOverviewPage({ searchParams }: { searchParams: Promise<{ accessRequests?: string }> }) {
  const { accessRequests } = await searchParams;
  return <DashboardOverview role="owner" showAccessRequests={accessRequests === '1'} />;
}
