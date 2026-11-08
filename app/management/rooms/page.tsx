import { RoomManagementWorkspace } from '../../components/RoomManagementWorkspace';

export default async function ManagementRoomsPage({ searchParams }: { searchParams: Promise<{ view?: string; tenant?: string }> }) {
  const { view, tenant } = await searchParams;
  return <RoomManagementWorkspace initialView={view === 'tenants' || tenant ? 'tenants' : 'map'} initialTenantId={tenant} />;
}
