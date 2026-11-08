import { ManagementConcernsWorkspace } from '../../components/ManagementConcernsWorkspace';

export default async function ManagementConcernsPage({ searchParams }: { searchParams: Promise<{ tenant?: string }> }) {
  const { tenant } = await searchParams;
  return <ManagementConcernsWorkspace initialTenantId={tenant} />;
}
