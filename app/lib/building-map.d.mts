export type BuildingRoom = {
  id: string;
  room_number: string;
  floor_label: string;
  capacity: number;
  availability: 'available' | 'reserved' | 'maintenance';
};
export type BuildingIssue = {
  id: string;
  room_id: string;
  category: string;
  description: string;
  status: 'pending' | 'in_progress' | 'resolved';
  staff_response?: string | null;
  attachment_id?: string | null;
};
export type RoomIssueSummary = {
  status: 'pending' | 'in_progress' | 'clear';
  openCount: number;
  totalCount: number;
  issues: BuildingIssue[];
};
export const ROOMS_PER_SCENE: number;
export function modelRoomLabel(index: number): string;
export function groupRoomsByFloor(rooms: BuildingRoom[]): { label: string; rooms: BuildingRoom[] }[];
export function modelFloors(floors: { label: string; rooms: BuildingRoom[] }[]): { label: string; rooms: BuildingRoom[] }[];
export function pageRooms<T>(rooms: T[], page: number, size?: number): T[];
export function summarizeRoomIssues(rooms: BuildingRoom[], issues: BuildingIssue[]): Map<string, RoomIssueSummary>;

export type RoomPosition = { number: number; x: number; y: number; door: 'front' | 'left' | 'right'; beds: boolean; width?: number };
export const ROOM_LAYOUT: RoomPosition[];
export const THIRD_ROOM_LAYOUT: RoomPosition[];
export function roomLayoutForFloor(floorLabel: string): RoomPosition[];
export function roomSlotIndex(room: BuildingRoom): number;
export function roomDisplayNumber(floorLabel: string, index: number): number;
export function mapRoomSlots(rooms: BuildingRoom[], floorLabel?: string): (BuildingRoom | undefined)[];
export function dollhouseLevelOffsets(selectedFloor: string | null): number[];
