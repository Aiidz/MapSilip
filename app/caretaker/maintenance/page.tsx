import { CaretakerMaintenance } from '../CaretakerPages';

export default async function CaretakerMaintenancePage({ searchParams }: { searchParams: Promise<{ roomId?: string | string[] }> }) {
  const { roomId } = await searchParams;
  return <CaretakerMaintenance initialRoomId={Array.isArray(roomId) ? roomId[0] : roomId} />;
}
