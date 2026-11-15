import { CaretakerMaintenance } from '../../caretaker/CaretakerPages';

export default async function ManagementMaintenancePage({ searchParams }: { searchParams: Promise<{ roomId?: string | string[] }> }) {
  const { roomId } = await searchParams;
  return <CaretakerMaintenance initialRoomId={Array.isArray(roomId) ? roomId[0] : roomId} />;
}
