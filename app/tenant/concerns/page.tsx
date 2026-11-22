import { TenantWorkspace } from '../../components/TenantWorkspace';

export default async function TenantConcernsPage({ searchParams }: { searchParams: Promise<{ recordId?: string | string[] }> }) {
  const { recordId } = await searchParams;
  const concernId = typeof recordId === 'string' && /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(recordId) ? recordId : undefined;
  return <TenantWorkspace key={concernId} kind="concerns" concernId={concernId} />;
}
