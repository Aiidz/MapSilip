'use client';

import { useId, type KeyboardEvent, type CSSProperties } from 'react';
import { mapRoomSlots, roomDisplayNumber, roomLayoutForFloor } from '../lib/building-map.mjs';
import type { BuildingRoom, RoomIssueSummary, RoomPosition } from '../lib/building-map.mjs';

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

// A shallow axonometric projection keeps the real L footprint and room labels readable.
export const point = (x: number, y: number, z = 0) => ({ x: 115 + x * 100 - y * 26, y: 60 + x * 8 + y * 68 - z });
export const poly = (vertices: number[][]) => vertices.map(([x, y, z]) => { const p = point(x, y, z); return `${p.x},${p.y}`; }).join(' ');
export const rect = (x: number, y: number, w: number, d: number, z = 0) => poly([[x,y,z],[x+w,y,z],[x+w,y+d,z],[x,y+d,z]]);
const footprint = [[0,0],[4.35,0],[4.35,2.5],[8.7,2.5],[8.7,4.45],[0,4.45]];

function keySelect(event: KeyboardEvent<SVGGElement>, action: () => void) {
  if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); action(); }
}
function Wall({ a, b, height = 40, fill = '#314c60' }: { a: number[]; b: number[]; height?: number; fill?: string }) {
  const length=Math.hypot(b[0]-a[0],b[1]-a[1]);
  const dx=-(b[1]-a[1])/length*.055, dy=(b[0]-a[0])/length*.055;
  const c=[b[0]+dx,b[1]+dy], d=[a[0]+dx,a[1]+dy];
  return <g className="dorm-wall">
    <polygon points={poly([a,b,[b[0],b[1],height],[a[0],a[1],height]])} fill={fill} />
    <polygon points={poly([b,c,[c[0],c[1],height],[b[0],b[1],height]])} fill="#192e40" />
    <polygon points={poly([[a[0],a[1],height],[b[0],b[1],height],[c[0],c[1],height],[d[0],d[1],height]])} fill="#76909d" stroke="#486173" strokeWidth=".5" />
  </g>;
}
function Box({ x, y, w, d, h = 8, fill = '#c5a47b' }: { x: number; y: number; w: number; d: number; h?: number; fill?: string }) {
  return <g>
    <polygon points={poly([[x,y+d],[x+w,y+d],[x+w,y+d,h],[x,y+d,h]])} fill={fill} />
    <polygon points={poly([[x+w,y],[x+w,y+d],[x+w,y+d,h],[x+w,y,h]])} fill="#172d40" opacity=".4" />
    <polygon points={rect(x,y,w,d,h)} fill={fill} stroke="#ffffff" strokeOpacity=".32" strokeWidth=".8" />
  </g>;
}
function Interior({ slot }: { slot: RoomPosition }) {
  const { x, y, beds } = slot;
  return <g aria-hidden="true" pointerEvents="none">
    {beds && <>
      {/* Furnishings indicate use, not surveyed bed count or approved room capacity. */}
      <polygon points={rect(x+.12,y+.35,.78,.78)} fill="#baaa96" opacity=".3" />
      {[slot.door === 'left' ? .43 : .16].map((offset) => <g key={offset} data-furniture="bed">
        <Box x={x+offset} y={y+.36} w={.39} d={.69} h={9} fill="#9c7756" />
        <polygon points={rect(x+offset+.025,y+.38,.34,.63,12)} fill="#f5eee1" stroke="#cfc2ac" />
        <polygon points={rect(x+offset+.025,y+.62,.34,.39,13)} fill="#536e80" />
        <polygon points={rect(x+offset+.05,y+.4,.29,.15,15)} fill="#fffaf0" stroke="#d9cebd" strokeWidth=".6" />
        <Wall a={[x+offset,y+.36]} b={[x+offset+.39,y+.36]} height={20} fill="#b89368" />
      </g>)}
      <Box x={x+.76} y={y+.07} w={.22} d={.27} h={29} fill="#b99a71" />
      <path d={`M${point(x+.87,y+.34,3).x} ${point(x+.87,y+.34,3).y}v-23`} stroke="#8f765a" />
      <Box x={x+(slot.door === 'left' ? 1.1 : .81)} y={y+.59} w={.2} d={.22} h={13} fill="#cfb88f" />
      <Box x={x+(slot.door === 'left' ? 1.12 : .82)} y={y+.87} w={.14} d={.13} h={7} fill="#9e7b55" />
      <Box x={x+.1} y={y+.06} w={.6} d={.19} h={12} fill="#d7c1a0" />
      <polygon points={rect(x+.15,y+.09,.18,.1,13)} fill="#879ca5" stroke="#edf3f1" />
      {[.47,.59].map(dx => { const p=point(x+dx,y+.15,13); return <ellipse key={dx} cx={p.x} cy={p.y} rx="4" ry="2.6" fill="#314353" stroke="#77868c" />; })}
      <polygon points={rect(x+1.04,y+.04,.34,.43)} fill="#d1dedb" stroke="#7f9a9c" />
      <Wall a={[x+1.02,y+.04]} b={[x+1.02,y+.51]} height={15} fill="#8eaaa9" />
      <Wall a={[x+1.02,y+.51]} b={[x+1.39,y+.51]} height={7} fill="#a6bcb7" />
      <Box x={x+1.12} y={y+.08} w={.15} d={.1} h={9} fill="#faf7ed" />
      <ellipse cx={point(x+1.2,y+.26,6).x} cy={point(x+1.2,y+.26,6).y} rx="6" ry="5" fill="#faf7ed" stroke="#a5b3af" />
    </>}
    {!beds && <g data-furniture="kitchen-side-room">
      <polygon points={rect(x+.09,y+.08,1.22,1.04)} fill="#e1d9c7" opacity=".24" />
      <Box x={x+.12} y={y+.12} w={.46} d={.21} h={13} fill="#c7a77d" />
      <polygon points={rect(x+.2,y+.16,.15,.1,14)} fill="#849aa2" stroke="#e6ece8" strokeWidth="1" />
      <Box x={x+.16} y={y+.57} w={.36} d={.28} h={13} fill="#b4936c" />
      <Box x={x+.64} y={y+.12} w={.25} d={.22} h={24} fill="#a68362" />
      <polygon points={rect(x+1.03,y+.08,.34,.4)} fill="#d5dedb" stroke="#82999a" />
      <Wall a={[x+1.01,y+.07]} b={[x+1.01,y+.49]} height={15} fill="#8eaaa9" />
      <Wall a={[x+1.01,y+.49]} b={[x+1.39,y+.49]} height={8} fill="#a6bcb7" />
      <Box x={x+1.12} y={y+.12} w={.14} d={.1} h={9} fill="#faf7ed" />
      <ellipse cx={point(x+1.2,y+.3,6).x} cy={point(x+1.2,y+.3,6).y} rx="6" ry="5" fill="#faf7ed" stroke="#a5b3af" />
    </g>}
  </g>;
}
function DoorPanel({ hinge, leaf, jamb, height = 31 }: { hinge: [number,number]; leaf: [number,number]; jamb: [number,number]; height?: number }) {
  const [hx,hy]=hinge, [lx,ly]=leaf;
  const knob=point(hx+(lx-hx)*.78,hy+(ly-hy)*.78,height*.48);
  return <g className="dorm-door" aria-hidden="true" pointerEvents="none">
    <path d={`M${point(hx,hy).x} ${point(hx,hy).y}L${point(hx,hy,height).x} ${point(hx,hy,height).y}L${point(jamb[0],jamb[1],height).x} ${point(jamb[0],jamb[1],height).y}L${point(jamb[0],jamb[1]).x} ${point(jamb[0],jamb[1]).y}`} fill="none" stroke="#dce7e7" strokeWidth="4" />
    <polygon points={poly([[hx,hy],[lx,ly],[lx,ly,height-2],[hx,hy,height-2]])} fill="#dce8e9" stroke="#819ba6" strokeWidth="1.5" />
    <polygon points={poly([[hx+(lx-hx)*.12,hy+(ly-hy)*.12,5],[hx+(lx-hx)*.88,hy+(ly-hy)*.88,5],[hx+(lx-hx)*.88,hy+(ly-hy)*.88,height-7],[hx+(lx-hx)*.12,hy+(ly-hy)*.12,height-7]])} fill="#c5dbe2" stroke="#9fb7c0" strokeWidth="1" />
    <circle cx={knob.x} cy={knob.y} r="2.4" fill="#e9d8ae" stroke="#68543d" strokeWidth=".7" />
  </g>;
}
function RoomTile({ slot, room, state, selected, heatmap, floorLabel, onSelect, onSelectEmpty, overview = false }: {
  slot: RoomPosition; room?: BuildingRoom; state?: RoomIssueSummary; selected: boolean; heatmap: boolean;
  floorLabel: string; onSelect: (room: BuildingRoom) => void; onSelectEmpty?: (index: number) => void; overview?: boolean;
}) {
  const {x,y,door,number} = slot;
  const roomWidth = slot.width ?? 1.4;
  const scale = roomWidth / 1.4;
  const origin = point(x,y);
  const delta = scale - 1;
  const squeeze = slot.width ? `translate(${origin.x} ${origin.y}) matrix(${scale} ${delta*.08} 0 1 0 0) translate(${-origin.x} ${-origin.y})` : undefined;
  const displayNumber = roomDisplayNumber(floorLabel, number - 1);
  const action = () => room ? onSelect(room) : onSelectEmpty?.(number-1);
  const interactive = !overview && Boolean(room || onSelectEmpty);
  const status = heatmap ? state?.status ?? 'clear' : room?.availability ?? 'unregistered';
  const frontDoor = [.54,.89];
  const tallWall = overview ? (floorLabel === '2nd Floor' ? 200 : 175) : 40;
  const doorHeight = overview ? 130 : 31;
  const lowWall = overview ? tallWall : 14;
  const rightWallHeight = door === 'right' ? null : [1,5,6,9].includes(number) || (floorLabel === '3rd Floor' && [16,19].includes(displayNumber)) ? tallWall : lowWall;
  return <g className={`dorm-room dorm-room--${status}`} data-room-id={room?.id} data-room-space={room ? undefined : number-1}
    data-right-wall-height={rightWallHeight}
    transform={squeeze}
    role={interactive ? 'button' : undefined} tabIndex={interactive ? 0 : undefined} aria-pressed={interactive ? selected : undefined}
    aria-label={`${floorLabel}, Room ${displayNumber}${room ? `, ${room.availability}${state?.openCount ? `, ${state.openCount} open maintenance issues` : ''}` : ', no linked record'}`}
    onClick={interactive ? action : undefined} onKeyDown={interactive ? e => keySelect(e,action) : undefined}>
    {!overview && <title>{`Room ${displayNumber}${room ? ` · ${room.room_number}` : ' · No linked record'}`}</title>}
    <polygon points={rect(x,y,1.4,1.2)} className="dorm-room-floor" />
    <polygon points={rect(x,y,1.4,1.2)} fill="var(--dorm-grout, transparent)" pointerEvents="none" />
    <Wall a={[x,y]} b={[x+1.4,y]} height={tallWall} />
    {door === 'left' ? <><Wall a={[x,y]} b={[x,y+.57]} height={tallWall} /><Wall a={[x,y+.94]} b={[x,y+1.2]} height={tallWall} /><DoorPanel height={doorHeight} hinge={[x,y+.57]} leaf={[x+.24,y+.82]} jamb={[x,y+.94]} /></> : <Wall a={[x,y]} b={[x,y+1.2]} height={tallWall} />}
    <polygon points={poly([[x+.25,y,9],[x+.73,y,9],[x+.73,y,24],[x+.25,y,24]])} fill="#9ec4d1" stroke="#d3e1de" strokeWidth="2" />
    <path d={`M${point(x+.49,y,9).x} ${point(x+.49,y,9).y}v-15`} stroke="#334d60" />
    <Interior slot={slot} />
    {door === 'right' ? <><Wall a={[x+1.4,y]} b={[x+1.4,y+.57]} height={tallWall} /><Wall a={[x+1.4,y+.94]} b={[x+1.4,y+1.2]} height={tallWall} /><DoorPanel height={doorHeight} hinge={[x+1.4,y+.57]} leaf={[x+1.16,y+.82]} jamb={[x+1.4,y+.94]} /></> : <Wall a={[x+1.4,y]} b={[x+1.4,y+1.2]} height={rightWallHeight ?? lowWall} />}
    {door === 'front' ? <><Wall a={[x,y+1.2]} b={[x+frontDoor[0],y+1.2]} height={lowWall} /><Wall a={[x+frontDoor[1],y+1.2]} b={[x+1.4,y+1.2]} height={lowWall} /><DoorPanel height={doorHeight} hinge={[x+frontDoor[0],y+1.2]} leaf={[x+.62,y+.94]} jamb={[x+frontDoor[1],y+1.2]} /></> : <Wall a={[x,y+1.2]} b={[x+1.4,y+1.2]} height={lowWall} />}
    {overview && <g aria-hidden="true" pointerEvents="none">
      {door === 'front' ? <polygon points={poly([[x+frontDoor[0],y+1.2,doorHeight],[x+frontDoor[1],y+1.2,doorHeight],[x+frontDoor[1],y+1.2,tallWall],[x+frontDoor[0],y+1.2,tallWall]])} fill="#314c60" /> : <polygon points={poly([[door==='left'?x:x+1.4,y+.57,doorHeight],[door==='left'?x:x+1.4,y+.94,doorHeight],[door==='left'?x:x+1.4,y+.94,tallWall],[door==='left'?x:x+1.4,y+.57,tallWall]])} fill="#314c60" />}
      {[[.12,.34,98,125],[.99,1.3,42,125]].map(([a,b,bottom,top],i)=>{
        const face=(u:number,z:number)=>[x+u,y+1.2,z];
        return <g key={i} data-facade-window={i===0?'square':'rectangle'}>
          <polygon points={poly([face(a,bottom),face(b,bottom),face(b,top),face(a,top)])} fill="#182e3e" stroke="#7d969f" strokeWidth="3" />
          <polygon points={poly([face(a+.025,bottom+4),face(b-.025,bottom+4),face(b-.025,top-4),face(a+.025,top-4)])} fill="#557681" />
          {[.25,.5,.75].map(t=><polyline key={t} points={poly([face(a+(b-a)*t,bottom),face(a+(b-a)*t,top)])} fill="none" stroke="#233e4e" strokeWidth="1.5" />)}
        </g>;
      })}
    </g>}
    <polygon points={rect(x,y,1.4,1.2)} className={`dorm-room-outline${selected && !overview ? ' is-selected' : ''}`} />
  </g>;
}
function Kitchen({ roof, overview = false }: { roof: boolean; overview?: boolean }) {
  return <g aria-hidden="true" pointerEvents="none">
    <Box x={.04} y={.06} w={.3} d={3.56} h={17} fill="#294b66" />
    <polygon points={rect(.02,.04,.35,3.6,19)} fill="#e7dfca" stroke="#b6bcb5" />
    {[.3,.86,1.42,1.98,2.54,3.1].map((y,i) => { const p=point(.19,y,24); return <g key={y}>
      {i===2 ? <polygon points={rect(.07,y-.13,.23,.28,20)} fill="#8ba1a6" stroke="#eff4ef" strokeWidth="2" /> : <><ellipse cx={p.x+2} cy={p.y+4} rx="9" ry="5" fill="#283b45" opacity=".22" /><rect x={p.x-7} y={p.y-8} width="14" height="10" rx="3" fill={i%2 ? '#b5c4c9' : '#ede9dd'} stroke="#81949d" /><ellipse cx={p.x} cy={p.y-8} rx="7" ry="3" fill="#d6e0df" stroke="#81949d" /><path d={`M${p.x-2} ${p.y-12}h4`} stroke="#405564" strokeWidth="2" /></>}
    </g>; })}
    {!overview && [.5,1.7,2.9].map(y => <g key={y}>
      <polygon points={poly([[.81,y,31],[.81,y+.34,31],[.81,y+.34,53],[.81,y,53]])} fill="#c6a479" stroke="#8d7357" />
      <path d={`M${point(.81,y+.17,34).x} ${point(.81,y+.17,34).y}v-16`} stroke="#9f815e" />
    </g>)}
    {[.1,1.2,2.3,3.6].map(y => <Wall key={y} a={[.01,y]} b={[.035,y]} height={51} fill="#b96856" />)}
    {roof && <>
      <polygon points={poly([[-.08,-.08,56],[.84,-.08,50],[.84,.85,50],[-.08,.85,56]])} fill="#a5b3b9" stroke="#526878" />
      {Array.from({length: 9},(_,i)=>i*.1).map(y=><path key={y} d={`M${point(-.08,y,56).x} ${point(-.08,y,56).y}L${point(.84,y,50).x} ${point(.84,y,50).y}`} stroke="#dce3e3" strokeWidth="1.5" />)}
      {[1.2,2.3,3.6].map(y=><path key={y} d={`M${point(0,y,52).x} ${point(0,y,52).y}L${point(.83,y,48).x} ${point(.83,y,48).y}`} stroke="#6a7d84" strokeWidth="3" />)}
    </>}
    {!overview && <text transform={`translate(${point(.56,2.1).x} ${point(.56,2.1).y}) rotate(-69)`} className="dorm-kitchen-label" textAnchor="middle">Outdoor shared kitchen</text>}
  </g>;
}
export function FloorPlate({ rooms, floorLabel, issues, selectedRoomId, selectedSlotIndex, heatmap, onSelectRoom, onSelectRoomSpace, onSelectFloor, roof = true, occupancy, showRoomLabels = true, overview = false }: {
  rooms: BuildingRoom[]; floorLabel: string; issues: Map<string, RoomIssueSummary>; selectedRoomId: string | null;
  selectedSlotIndex: number | null; heatmap: boolean; onSelectRoom: (room: BuildingRoom) => void;
  onSelectRoomSpace?: (index: number) => void; onSelectFloor?: () => void; roof?: boolean; occupancy?: Map<string, number> | null; showRoomLabels?: boolean; overview?: boolean;
}) {
  const uid=useId().replaceAll(':','');
  const layout=roomLayoutForFloor(floorLabel);
  const frontEnd=8.7;
  const stairX=frontEnd - 1.07;
  const slots=mapRoomSlots(rooms, floorLabel);
  const confirmed=['2nd Floor','3rd Floor'].includes(floorLabel);
  if (!confirmed) return <g><text x="80" y="160" className="dorm-level-label">{floorLabel}</text><text x="80" y="190" className="dorm-unmapped-label">Layout not confirmed · room records remain available below</text></g>;
  return <g className="dorm-floor" style={{ '--dorm-floor': `url(#${uid}-tile)`, '--dorm-grout': `url(#${uid}-grid)` } as CSSProperties}>
    <defs>
      <linearGradient id={`${uid}-tile`} x1="0" y1="0" x2="1" y2="1"><stop stopColor="#deded4" /><stop offset="1" stopColor="#b2b8b6" /></linearGradient>
      <pattern id={`${uid}-grid`} width="24" height="18" patternUnits="userSpaceOnUse" patternTransform="matrix(1 .08 -.38 1 0 0)"><path d="M24 0H0V18" stroke="#767f7c" strokeOpacity=".2" fill="none" strokeWidth=".8" /></pattern>
    </defs>
    <polygon points={poly(footprint.map(([x,y])=>[x===8.7?frontEnd:x,y, -18]))} fill="#122536" opacity=".12" transform="translate(5 8)" />
    <polygon points={poly([[0,4.45],[frontEnd,4.45],[frontEnd,4.45,-16],[0,4.45,-16]])} fill="#7e8a8c" stroke="#526370" />
    <polygon points={poly([[frontEnd,2.5],[frontEnd,4.45],[frontEnd,4.45,-16],[frontEnd,2.5,-16]])} fill="#314c60" />
    <polygon points={poly(footprint.map(([x,y])=>[x===8.7?frontEnd:x,y]))} fill={`url(#${uid}-tile)`} stroke="#71818a" strokeWidth="2" />
    <polygon points={poly(footprint.map(([x,y])=>[x===8.7?frontEnd:x,y]))} fill={`url(#${uid}-grid)`} pointerEvents="none" />
    <g data-floor-label={onSelectFloor ? floorLabel : undefined} role={onSelectFloor ? 'button' : undefined} tabIndex={onSelectFloor ? 0 : undefined}
      onClick={onSelectFloor} onKeyDown={onSelectFloor ? e=>keySelect(e,onSelectFloor) : undefined} aria-label={onSelectFloor ? `Isolate ${floorLabel}` : undefined} className="dorm-floor-control">
      <rect x="650" y="75" width="146" height="32" rx="6" className="dorm-level-plaque" /><text x="663" y="97" className="dorm-level-label">{floorLabel}</text>
    </g>
    {/* Paint rear to front; each room is bound by its number, never array position. */}
    {[...layout].sort((a,b)=>a.y-b.y || a.x-b.x).map(slot=><RoomTile key={slot.number} slot={slot} room={slots[slot.number-1]} state={issues.get(slots[slot.number-1]?.id ?? '')}
      selected={slots[slot.number-1] ? slots[slot.number-1]?.id === selectedRoomId : selectedSlotIndex === slot.number-1}
      heatmap={heatmap} floorLabel={floorLabel} onSelect={onSelectRoom} onSelectEmpty={onSelectRoomSpace} overview={overview} />)}
    <Kitchen roof={roof} overview={overview} />
    <g aria-hidden="true" pointerEvents="none">
      {/* Stair opening is beyond the front walking lane, directly in front of Room 1. */}
      <polygon points={rect(stairX,4.18,.72,.55)} fill="#233e53" stroke="#c5c7b9" />
      {[0,1,2,3,4,5].map(i=><polygon key={i} points={rect(stairX+.03,4.2+i*.085,.66,.065,-i*2)} fill="#e0d6c0" stroke="#8b9291" strokeWidth=".5" />)}
      {[[0,stairX-.08],[stairX+.77,frontEnd]].map(([start,end])=><g key={start} data-corridor-barrier="true">
        <Wall a={[start,4.43]} b={[end,4.43]} height={24} />
        {[0,24,34,44].map(z=><path key={z} d={`M${point(start,4.43,z).x} ${point(start,4.43,z).y}L${point(end,4.43,z).x} ${point(end,4.43,z).y}`} stroke="#b95149" strokeWidth={z===0?6:3} />)}
        {Array.from({length:Math.ceil((end-start)/.5)+1},(_,i)=>start+(end-start)*i/Math.ceil((end-start)/.5)).map(x=><path key={x} d={`M${point(x,4.43,24).x} ${point(x,4.43,24).y}L${point(x,4.43,44).x} ${point(x,4.43,44).y}`} stroke="#b95149" strokeWidth="3" />)}
        {[start,...[2.3,4.35,6.5].filter(x=>x>start&&x<end),end].map(x=><path key={x} d={`M${point(x,4.43).x} ${point(x,4.43).y}L${point(x,4.43,44).x} ${point(x,4.43,44).y}`} stroke="#b95149" strokeWidth="6" />)}
      </g>)}
      {showRoomLabels && layout.map(slot=>{ const room=slots[slot.number-1]; const state=issues.get(room?.id ?? ''); const p=point(slot.x+.72*(slot.width ?? 1.4)/1.4,slot.y+.94); const count=room ? occupancy?.get(room.id) ?? 0 : 0;
        return <g key={slot.number}>
          <rect x={p.x-31} y={p.y-7} width="62" height="19" rx="4" fill="#182f42" fillOpacity=".94" />
          <text x={p.x} y={p.y+6} textAnchor="middle" className="dorm-room-label">Room {roomDisplayNumber(floorLabel, slot.number - 1)}</text>
          {room && ((heatmap && Boolean(state?.openCount)) || (!heatmap && occupancy)) && <g>
            <rect x={p.x-20} y={p.y+14} width="40" height="16" rx="8" fill={heatmap ? state?.status==='pending' ? '#a53938' : '#8a641a' : room.availability!=='available' ? '#865851' : count>=room.capacity ? '#a53938' : count ? '#7d641f' : '#35634e'} />
            <text x={p.x} y={p.y+25} textAnchor="middle" className="dorm-badge">{heatmap ? state?.openCount : `${count}/${room.capacity}`}</text>
          </g>}
        </g>;
      })}
    </g>
  </g>;
}
export function RoomVignette({ index, floorLabel = '2nd Floor' }: { index: number; floorLabel?: string }) {
  const slot=roomLayoutForFloor(floorLabel)[index];
  if (!slot) return null;
  const p=point(slot.x,slot.y);
  return <svg className="room-vignette dorm-building" viewBox={`${p.x-38} ${p.y-40} 190 160`} role="img" aria-label={`Room ${roomDisplayNumber(floorLabel, index)}, illustrative interior`}>
    <RoomTile slot={slot} selected={false} heatmap={false} floorLabel={floorLabel} onSelect={()=>{}} />
  </svg>;
}
export function IsometricBuilding(props: BuildingRenderProps & { roofVisible?: boolean; occupancy?: Map<string, number> | null }) {
  const levels=props.selectedFloor ? props.floors.filter(f=>f.label===props.selectedFloor) : [...props.floors].reverse();
  const height=Math.max(1,levels.length)*490;
  return <svg className="isometric-building dorm-building" viewBox={`-35 -15 1060 ${height}`} aria-label="Interactive dormitory floor plan"
    onPointerDown={props.onPointerDown} onPointerMove={props.onPointerMove} onPointerUp={props.onPointerUp} onPointerCancel={props.onPointerUp}>
    <g transform={`translate(${props.pan.x} ${props.pan.y}) translate(495 ${height/2}) scale(${props.zoom}) translate(-495 ${-height/2})`}>
      {levels.map((floor,i)=><g key={floor.label} transform={`translate(0 ${i*490})`} data-dollhouse-floor={floor.label}>
        <FloorPlate rooms={props.selectedFloor ? props.visibleRooms : floor.rooms} floorLabel={floor.label} issues={props.issues}
          selectedRoomId={props.selectedRoomId} selectedSlotIndex={props.selectedFloor ? props.selectedSlotIndex : null} heatmap={props.heatmap}
          onSelectRoom={props.onSelectRoom} onSelectRoomSpace={props.selectedFloor ? props.onSelectRoomSpace : undefined}
          onSelectFloor={props.selectedFloor ? undefined : ()=>props.onSelectFloor(floor.label)} roof={props.roofVisible ?? true} occupancy={props.occupancy} />
      </g>)}
    </g>
  </svg>;
}
