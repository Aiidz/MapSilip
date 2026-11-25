import { ManagementConcernsWorkspace } from '../../components/ManagementConcernsWorkspace';

export default async function ManagementConcernsPage({ searchParams }: { searchParams: Promise<{ tenant?: string; recordId?: string | string[] }> }) {
  const { tenant, recordId } = await searchParams;
  const concernId = typeof recordId === 'string' && /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(recordId) ? recordId : undefined;
  return <ManagementConcernsWorkspace key={concernId} initialTenantId={tenant} concernId={concernId} />;
}
