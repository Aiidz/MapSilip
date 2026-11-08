export const ROOMS_PER_SCENE = 8;

export function modelRoomLabel(index) {
  return String(index + 1).padStart(2, '0');
}

export function modelFloors(floors) {
  const labels = ['1st Floor', '2nd Floor', '3rd Floor'];
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
