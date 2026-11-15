export const ROOMS_PER_SCENE = 9;

export function modelRoomLabel(index) {
  return String(index + 1).padStart(2, '0');
}

export function modelFloors(floors) {
  const labels = ['2nd Floor', '3rd Floor'];
  const byLabel = new Map(floors.map(floor => [floor.label, floor]));
  return [
    ...labels.map(label => byLabel.get(label) ?? { label, rooms: [] }),
    ...floors.filter(floor => !labels.includes(floor.label)),
  ];
}

export function groupRoomsByFloor(rooms) {
  const groups = new Map();
  for (const room of rooms) {
    if (typeof room.id !== 'string' || typeof room.floor_label !== 'string') continue;
    const label = room.floor_label.trim();
    if (!label) continue;
    if (!groups.has(label)) groups.set(label, []);
    groups.get(label).push(room);
  }
  return [...groups].sort(([a], [b]) => a.localeCompare(b, undefined, { numeric: true }))
    .map(([label, floorRooms]) => ({
      label,
      rooms: floorRooms.sort((a, b) => String(a.room_number).localeCompare(String(b.room_number), undefined, { numeric: true })),
    }));
}

export function pageRooms(rooms, page, size = ROOMS_PER_SCENE) {
  return rooms.slice((page - 1) * size, page * size);
}

export function summarizeRoomIssues(rooms, issues) {
  const byRoom = new Map(rooms.map(room => [room.id, []]));
  for (const issue of issues) {
    if (byRoom.has(issue.room_id)) byRoom.get(issue.room_id).push(issue);
  }
  return new Map([...byRoom].map(([id, roomIssues]) => {
    const pending = roomIssues.some(issue => issue.status === 'pending');
    const working = roomIssues.some(issue => issue.status === 'in_progress');
    return [id, {
      status: pending ? 'pending' : working ? 'in_progress' : 'clear',
      openCount: roomIssues.filter(issue => issue.status === 'pending' || issue.status === 'in_progress').length,
      totalCount: roomIssues.length,
      issues: roomIssues,
    }];
  }));
}

// Confirmed physical positions; the third floor continues numbering from the second.
export const ROOM_LAYOUT = [
  { number: 1, x: 7.25, y: 2.5, door: 'front', beds: true },
  { number: 2, x: 5.8, y: 2.5, door: 'front', beds: true },
  { number: 3, x: 4.35, y: 2.5, door: 'front', beds: true },
  { number: 4, x: 2.9, y: 2.5, door: 'front', beds: true },
  { number: 5, x: 2.9, y: 1.25, door: 'left', beds: true },
  { number: 6, x: 2.9, y: 0, door: 'left', beds: true },
  { number: 7, x: .85, y: 0, door: 'right', beds: false },
  { number: 8, x: .85, y: 1.25, door: 'right', beds: false },
  { number: 9, x: .85, y: 2.5, door: 'front', beds: false },
];

export const THIRD_ROOM_LAYOUT = [
  ...[7.54, 6.38, 5.22, 4.06, 2.9].map((x, index) => ({ ...ROOM_LAYOUT[0], number: index + 1, x, width: 1.16 })),
  ...ROOM_LAYOUT.slice(4).map((slot, index) => ({ ...slot, number: index + 6 })),
];

export function roomLayoutForFloor(floorLabel) {
  return floorLabel === '3rd Floor' ? THIRD_ROOM_LAYOUT : ROOM_LAYOUT;
}

export function roomSlotIndex(room) {
  const raw = String(room.room_number).trim();
  const legacy = /^(?:room\s*)?([23])0([1-8])$/i.exec(raw);
  if (legacy && room.floor_label === (legacy[1] === '2' ? '2nd Floor' : '3rd Floor')) return Number(legacy[2]) - 1;
  const match = /^(?:room\s*)?0?([1-9]|1[0-9])$/i.exec(raw);
  if (!match) return -1;
  const number = Number(match[1]);
  return number >= 10 && room.floor_label === '3rd Floor' ? number - 10 : number <= 9 ? number - 1 : -1;
}

export function roomDisplayNumber(floorLabel, index) {
  return index + (floorLabel === '3rd Floor' ? 10 : 1);
}

export function mapRoomSlots(rooms, floorLabel = rooms[0]?.floor_label) {
  return roomLayoutForFloor(floorLabel).map((_, index) => {
    const matches = rooms.filter(room => roomSlotIndex(room) === index);
    return matches.length === 1 ? matches[0] : undefined;
  });
}

// Floors remain mounted: only presentation transforms change during inspection.
export function dollhouseLevelOffsets(selectedFloor) {
  const labels = ['1st Floor', '2nd Floor', '3rd Floor'];
  const selected = labels.indexOf(selectedFloor);
  if (selected < 0) return [140, 140, 10];
  const remaining = labels.map((_, index) => index).filter(index => index !== selected);
  return labels.map((_, index) => index === selected ? -380 : remaining.indexOf(index) === 0 ? 390 : 40);
}
