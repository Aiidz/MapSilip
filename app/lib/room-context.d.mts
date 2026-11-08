export type RoomResident = {
  user_id: string;
  display_name: string;
  phone: string | null;
  status: string;
  email?: string | null;
  emergency_contact?: string | null;
};
export type RoomVisit = {
  id: string;
  visitor_name: string;
  visit_on: string;
  arrival_time: string | null;
  departure_time: string | null;
  cancelled_at: string | null;
  resident_name: string;
  purpose?: string | null;
};
export type RoomMaintenance = {
  id: string;
  category: string;
  description: string;
  status: 'pending' | 'in_progress' | 'resolved';
  staff_response: string | null;
  attachment_id: string | null;
  created_at: string;
  updated_at: string;
};
export type RoomContext = {
  room: { id: string; room_number: string; floor_label: string; capacity: number; availability: string };
  viewer_role: 'owner' | 'caretaker';
  residents: RoomResident[];
  visits: RoomVisit[];
  maintenance: RoomMaintenance[];
};
export function assignableTenants<T extends { user_id: string; status: string }, A extends { tenant_id: string; ended_on: string | null }>(profiles: T[], assignments: A[]): T[];
export function manilaToday(now?: Date): string;
export function partitionRoomActivity(context: Pick<RoomContext, 'visits' | 'maintenance'>, today: string): {
  upcomingVisits: RoomVisit[];
  visitHistory: RoomVisit[];
  openMaintenance: RoomMaintenance[];
  maintenanceHistory: RoomMaintenance[];
};
