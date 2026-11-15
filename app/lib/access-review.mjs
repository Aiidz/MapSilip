export function reviewRoomOptions(rooms, assignments, gender) {
  const occupied = new Map();
  for (const assignment of assignments) if (!assignment.ended_on) occupied.set(assignment.room_id, (occupied.get(assignment.room_id) || 0) + 1);
  return [...rooms].sort((a, b) => a.room_number.localeCompare(b.room_number, undefined, { numeric: true })).map(room => {
    const vacancies = Math.max(0, room.capacity - (occupied.get(room.id) || 0));
    const reason = room.availability !== 'available' ? room.availability.replaceAll('_', ' ') : !vacancies ? 'Full' : room.gender_policy !== 'any' && room.gender_policy && room.gender_policy !== gender ? room.gender_policy === 'male' ? 'Boys only' : 'Girls only' : '';
    return { ...room, vacancies, reason, eligible: !reason };
  });
}
