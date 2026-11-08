'use client';

import type { KeyboardEvent } from 'react';
import { floorOutline, iso, polygon, tile } from '../lib/isometric-geometry';
import { modelRoomLabel } from '../lib/building-map.mjs';
import type { BuildingRoom, RoomIssueSummary } from '../lib/building-map.mjs';

type Floor = { label: string; rooms: BuildingRoom[] };
export type BuildingRenderProps = {
  floors: Floor[];
  selectedFloor: string | null;
  visibleRooms: BuildingRoom[];
  issues: Map<string, RoomIssueSummary>;
  selectedRoomId: string | null;
  selectedSlotIndex: number | null;
  heatmap: boolean;
  zoom: number;
  pan: { x: number; y: number };
  onSelectFloor: (floor: string) => void;
  onSelectRoom: (room: BuildingRoom) => void;
  onSelectRoomSpace: (index: number) => void;
  onPointerDown: React.PointerEventHandler<SVGSVGElement>;
  onPointerMove: React.PointerEventHandler<SVGSVGElement>;
  onPointerUp: React.PointerEventHandler<SVGSVGElement>;
};

function keySelect(event: KeyboardEvent<SVGGElement>, action: () => void) {
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault();
    action();
  }
}

function RoomTile({ room, index, floorLabel, state, selected, heatmap, onSelect, onSelectEmpty }: {
  room: BuildingRoom | undefined;
  index: number;
  floorLabel: string;
  state?: RoomIssueSummary;
  selected: boolean;
  heatmap: boolean;
  onSelect: (room: BuildingRoom) => void;
  onSelectEmpty?: (index: number) => void;
}) {
  const x = index % 4;
  const y = index < 4 ? 0 : 2;
  const corner = iso(x, y);
  const status = heatmap ? state?.status ?? 'clear' : room?.availability ?? 'unregistered';
  const bed = polygon([iso(x + .16, y + .18), iso(x + .72, y + .18), iso(x + .72, y + .66), iso(x + .16, y + .66)]);
  const pillow = polygon([iso(x + .2, y + .22), iso(x + .39, y + .22), iso(x + .39, y + .58), iso(x + .2, y + .58)]);
  const rug = polygon([iso(x + .68, y + .33), iso(x + .87, y + .33), iso(x + .87, y + .72), iso(x + .68, y + .72)]);
  const windowLeft = iso(x + .24, y);
  const windowRight = iso(x + .72, y);
  const plant = iso(x + .86, y + .82);
  const content = <>
    <polygon className={`iso-tile iso-tile--${status}`} points={tile(x, y)} />
    {[.24, .49, .74].map(line => <path key={line} className="iso-floorboard"
      d={`M${iso(x + line, y + .03).x} ${iso(x + line, y + .03).y}L${iso(x + line, y + .96).x} ${iso(x + line, y + .96).y}`} />)}
    <polygon className="iso-wall iso-wall--back" points={polygon([corner, iso(x + 1, y), { ...iso(x + 1, y), y: iso(x + 1, y).y - 19 }, { ...corner, y: corner.y - 19 }])} />
    <polygon className="iso-wall iso-wall--side" points={polygon([corner, iso(x, y + 1), { ...iso(x, y + 1), y: iso(x, y + 1).y - 19 }, { ...corner, y: corner.y - 19 }])} />
    <polygon className="iso-window" points={polygon([
      { x: windowLeft.x, y: windowLeft.y - 15 }, { x: windowRight.x, y: windowRight.y - 15 },
      { x: windowRight.x, y: windowRight.y - 5 }, { x: windowLeft.x, y: windowLeft.y - 5 },
    ])} />
    <path className="iso-window-frame" d={`M${iso(x + .48, y).x} ${iso(x + .48, y).y - 15}v10`} />
    <polygon className="iso-rug" points={rug} />
    <polygon className="iso-bed-frame" points={bed} />
    <polygon className="iso-mattress" points={polygon([iso(x + .19, y + .2), iso(x + .69, y + .2), iso(x + .69, y + .61), iso(x + .19, y + .61)])} />
    <polygon className="iso-pillow" points={pillow} />
    <path className="iso-bed-leg" d={`M${iso(x + .19, y + .61).x} ${iso(x + .19, y + .61).y}v5 M${iso(x + .69, y + .61).x} ${iso(x + .69, y + .61).y}v5`} />
    <polygon className="iso-desk" points={polygon([iso(x + .74, y + .12), iso(x + .93, y + .12), iso(x + .93, y + .38), iso(x + .74, y + .38)])} />
    <path className="iso-desk-leg" d={`M${iso(x + .76, y + .38).x} ${iso(x + .76, y + .38).y}v5 M${iso(x + .92, y + .38).x} ${iso(x + .92, y + .38).y}v5`} />
    <ellipse className="iso-plant-pot" cx={plant.x} cy={plant.y} rx="5" ry="3" />
    <path className="iso-plant-leaf" d={`M${plant.x} ${plant.y - 2}q-7 -10 -8 -7 M${plant.x} ${plant.y - 2}q6 -12 9 -9 M${plant.x} ${plant.y - 2}q0 -13 2 -14`} />
    <path className="iso-door" d={`M${iso(x + .77, y + 1).x} ${iso(x + .77, y + 1).y}l11 -6`} />
    {selected && <polygon className="iso-selected" points={tile(x, y)} />}
  </>;
  if (!room && onSelectEmpty) return <g data-room-space={index} role="button" tabIndex={0}
    aria-label={`${floorLabel}, room ${modelRoomLabel(index)}, no linked record`} aria-pressed={selected}
    onClick={() => onSelectEmpty(index)} onKeyDown={event => keySelect(event, () => onSelectEmpty(index))}
    className={`iso-room-interactive iso-room--variant-${index % 3}`}><title>{`${floorLabel}, room ${modelRoomLabel(index)}`}</title>{content}</g>;
  if (!room) return <g aria-hidden="true" className={`iso-decorative-room iso-room--variant-${index % 3}`}>{content}</g>;
  return <g data-room-id={room.id} role="button" tabIndex={0}
    aria-label={`Room ${room.room_number}${state?.openCount ? `, ${state.openCount} open maintenance ${state.openCount === 1 ? 'issue' : 'issues'}` : ''}`}
    aria-pressed={selected} onClick={() => onSelect(room)} onKeyDown={event => keySelect(event, () => onSelect(room))}
    className={`iso-room-interactive iso-room--variant-${index % 3}`}><title>{`Room ${room.room_number}`}</title>{content}</g>;
}

export function FloorPlate({ rooms, floorLabel, issues, selectedRoomId, selectedSlotIndex, heatmap, onSelectRoom, onSelectRoomSpace, onSelectFloor, compact = false, heatmapBoxes = false }: {
  rooms: BuildingRoom[];
  floorLabel: string;
  issues: Map<string, RoomIssueSummary>;
  selectedRoomId: string | null;
  selectedSlotIndex: number | null;
  heatmap: boolean;
  onSelectRoom: (room: BuildingRoom) => void;
  onSelectRoomSpace?: (index: number) => void;
  onSelectFloor?: () => void;
  compact?: boolean;
  heatmapBoxes?: boolean;
}) {
  const top = [iso(-.1, -.1), iso(4.1, -.1), iso(4.1, 3.1), iso(-.1, 3.1)];
  return <g className={`iso-floor${compact ? ' iso-floor--compact' : ''}`}>
    <polygon className="iso-floor-side" points={polygon([top[3], top[2], { ...top[2], y: top[2].y + 21 }, { ...top[3], y: top[3].y + 21 }])} />
    <polygon className="iso-floor-front" points={polygon([top[1], top[2], { ...top[2], y: top[2].y + 21 }, { ...top[1], y: top[1].y + 21 }])} />
    <polygon className="iso-floor-base" points={floorOutline()} />
    <polygon className={`iso-corridor${onSelectFloor ? ' iso-overview-level' : ''}`} points={polygon([iso(0, 1), iso(4, 1), iso(4, 2), iso(0, 2)])}
      data-floor-label={onSelectFloor ? floorLabel : undefined} role={onSelectFloor ? 'button' : undefined}
      tabIndex={onSelectFloor ? 0 : undefined} aria-label={onSelectFloor ? `Isolate ${floorLabel}, ${rooms.length} recorded rooms` : undefined}
      onClick={onSelectFloor} onKeyDown={onSelectFloor ? event => keySelect(event, onSelectFloor) : undefined} />
    {[0, 1, 2, 3, 4].map(step => <path className="iso-corridor-seam" key={step} aria-hidden="true" pointerEvents="none"
      d={`M${iso(step, 1).x} ${iso(step, 1).y}L${iso(step, 2).x} ${iso(step, 2).y}`} />)}
    {Array.from({ length: 8 }, (_, index) => <RoomTile key={rooms[index]?.id ?? `empty-${index}`}
      room={compact ? undefined : rooms[index]} index={index} floorLabel={floorLabel} state={issues.get(rooms[index]?.id ?? '')}
      selected={rooms[index] ? rooms[index].id === selectedRoomId : !compact && selectedSlotIndex === index}
      heatmap={heatmap} onSelect={onSelectRoom} onSelectEmpty={compact ? undefined : onSelectRoomSpace} />)}
    <g className="iso-stairs" aria-hidden="true">
      <polygon points={polygon([iso(3.6, 1.05), iso(3.96, 1.05), iso(3.96, 1.9), iso(3.6, 1.9)])} />
      {[1.22, 1.42, 1.62].map(step => <path key={step} d={`M${iso(3.6, step).x} ${iso(3.6, step).y}L${iso(3.96, step).x} ${iso(3.96, step).y}`} />)}
    </g>
    {Array.from({ length: 8 }, (_, index) => {
      const room = rooms[index];
      const x = index % 4;
      const y = index < 4 ? 0 : 2;
      const center = iso(x + .5, y + .5);
      const state = room ? issues.get(room.id) : undefined;
      return <g key={`label-${index}`} aria-hidden="true" className="iso-room-overlay">
        {heatmapBoxes && heatmap && state && state.openCount > 0 && <g className={`iso-heatmap-box iso-heatmap-box--${state.status}`}>
          <polygon points={polygon([iso(x,y),iso(x+1,y),iso(x+1,y+1),iso(x,y+1)])} />
          {[ [[x,y],[x+1,y]], [[x+1,y],[x+1,y+1]], [[x+1,y+1],[x,y+1]], [[x,y+1],[x,y]] ].map((edge,i) =>
            <polygon key={i} points={polygon([iso(edge[0][0],edge[0][1]),iso(edge[1][0],edge[1][1]),
              {...iso(edge[1][0],edge[1][1]),y:iso(edge[1][0],edge[1][1]).y-28},
              {...iso(edge[0][0],edge[0][1]),y:iso(edge[0][0],edge[0][1]).y-28}])} />)}
          <polygon points={polygon([iso(x,y),iso(x+1,y),iso(x+1,y+1),iso(x,y+1)].map(point=>({...point,y:point.y-28})))} />
        </g>}
        <text className="iso-room-label" x={center.x + 5} y={center.y + 22} textAnchor="middle">{room?.room_number ?? modelRoomLabel(index)}</text>
        {!heatmapBoxes && !compact && heatmap && Boolean(state?.openCount) && <g className={`iso-issue-marker iso-issue-marker--${state?.status}`}>
          <circle cx={center.x + 13} cy={center.y - 13} r="13" />
          <text x={center.x + 13} y={center.y - 9} textAnchor="middle">{state?.openCount}</text>
        </g>}
      </g>;
    })}
  </g>;
}

export function RoomVignette({ index }: { index: number }) {
  const x = index % 4;
  const y = index < 4 ? 0 : 2;
  const corner = iso(x, y);
  return <svg className="room-vignette" viewBox={`${corner.x - 76} ${corner.y - 29} 152 126`}
    role="img" aria-label="Room interior view">
    <RoomTile room={undefined} index={index} floorLabel="" selected={false} heatmap={false} onSelect={() => {}} />
  </svg>;
}

export function IsometricBuilding({ floors, selectedFloor, visibleRooms, issues, selectedRoomId, heatmap,
  selectedSlotIndex, zoom, pan, onSelectFloor, onSelectRoom, onSelectRoomSpace, onPointerDown, onPointerMove, onPointerUp }: BuildingRenderProps) {
  const overview = floors.slice(0, 3);
  while (overview.length < 3) overview.push({ label: '', rooms: [] });
  return <svg className={`isometric-building${selectedFloor ? '' : ' isometric-building--overview'}${heatmap ? ' isometric-building--maintenance' : ''}`}
    viewBox={selectedFloor ? '120 58 480 300' : '0 0 520 820'} role="img"
    aria-label={selectedFloor ? `${selectedFloor} dormitory view` : 'Three-floor dormitory view'}
    onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp}>
    <defs>
      <filter id="iso-shadow" x="-25%" y="-25%" width="150%" height="160%"><feDropShadow dx="0" dy="13" stdDeviation="14" floodColor="#25313b" floodOpacity=".18" /></filter>
    </defs>
    <ellipse className="iso-ground-shadow" cx={selectedFloor ? 360 : 260} cy={selectedFloor ? 333 : 785} rx="205" ry="27" />
    {selectedFloor ? <g transform={`translate(${pan.x} ${pan.y}) translate(360 208) scale(${zoom}) translate(-360 -208)`}>
      <FloorPlate rooms={visibleRooms} floorLabel={selectedFloor} issues={issues} selectedRoomId={selectedRoomId} selectedSlotIndex={selectedSlotIndex}
        heatmapBoxes heatmap={heatmap} onSelectRoom={onSelectRoom} onSelectRoomSpace={onSelectRoomSpace} />
    </g> : overview.reverse().map((floor, index) => <g key={`${floor.label}-${index}`} className="iso-overview-level"
      transform={`translate(-65 ${index * 245 + 5}) scale(.9)`}
      data-floor-label={floor.label || undefined} role={floor.label ? 'button' : undefined} tabIndex={floor.label ? 0 : undefined}
      aria-label={floor.label ? `Isolate ${floor.label}, ${floor.rooms.length} recorded rooms` : undefined}
      onClick={floor.label ? () => onSelectFloor(floor.label) : undefined}
      onKeyDown={floor.label ? event => keySelect(event, () => onSelectFloor(floor.label)) : undefined}>
      <FloorPlate rooms={floor.rooms} floorLabel={floor.label} issues={issues} selectedRoomId={null} selectedSlotIndex={null}
        heatmapBoxes heatmap={heatmap} onSelectRoom={onSelectRoom} onSelectRoomSpace={onSelectRoomSpace} compact />
      {floor.label && <text className="iso-level-label" x="145" y="77">{floor.label}</text>}
    </g>)}
  </svg>;
}
