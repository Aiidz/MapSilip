import { mapRoomSlots, roomLayoutForFloor } from '../lib/building-map.mjs';
import type { BuildingRoom, RoomIssueSummary } from '../lib/building-map.mjs';
import { useId } from 'react';
import { point } from './IsometricBuilding';

export function MaintenanceGlow({ rooms, floor, issues, overview, selectedRoomId, hoveredRoomId, onSelectFloor }: {
  rooms: BuildingRoom[]; floor: string; issues: Map<string, RoomIssueSummary>; overview: boolean;
  selectedRoomId: string | null; hoveredRoomId: string | null; onSelectFloor: (floor: string) => void;
}) {
  const uid = useId().replaceAll(':', '');
  const slots = mapRoomSlots(rooms, floor);
  return <g className="maintenance-glow-layer" data-glow-floor={floor} data-floor-label={overview ? floor : undefined} pointerEvents={overview ? undefined : 'none'}>
    <defs>
      {['pending','in_progress'].map(status=><radialGradient key={status} id={`${uid}-${status}`}>
        <stop offset="0%" stopColor="#ffffff" stopOpacity="0.95" />
        <stop offset="18%" stopColor={status==='pending'?'#ff2d20':'#ff9f0a'} stopOpacity="1" />
        <stop offset="52%" stopColor={status==='pending'?'#ff4d42':'#ffb726'} stopOpacity="0.85" />
        <stop offset="80%" stopColor={status==='pending'?'#ff6b62':'#ffd54f'} stopOpacity="0.45" />
        <stop offset="100%" stopColor={status==='pending'?'#ff2d20':'#ff9f0a'} stopOpacity="0" />
      </radialGradient>)}
    </defs>
    {roomLayoutForFloor(floor).map(slot => {
      const room = slots[slot.number - 1];
      const state = room && issues.get(room.id);
      if (!room || !state?.openCount || state.status === 'clear') return null;
      const { x, y } = slot;
      const w = slot.width ?? 1.4;
      const p = point(x + w / 2, y + .65, overview ? 65 : 8);
      const size = Math.min(1.2, .7 + Math.log2(state.openCount) * .16);
      const active = selectedRoomId === room.id || hoveredRoomId === room.id;
      return <g key={room.id} className={`maintenance-glow maintenance-glow--${state.status}${active && !overview ? ' is-active' : ''}`}
        data-maintenance-room={room.id} onClick={overview ? () => onSelectFloor(floor) : undefined}>
        <g transform={`translate(${p.x} ${p.y})`}>
          <g transform={`scale(${size})`}>
          <g className="maintenance-hotspot">
            <ellipse rx={w*42} ry="39" fill={`url(#${uid}-${state.status})`} />
            <ellipse className="maintenance-hotspot__ring" rx={w*29} ry="27" />
            <ellipse className="maintenance-hotspot__ring maintenance-hotspot__ring--inner" rx={w*19} ry="18" />
          </g>
          </g>
        </g>
      </g>;
    })}
  </g>;
}
