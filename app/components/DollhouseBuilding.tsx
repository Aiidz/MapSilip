'use client';

import { FloorPlate, type BuildingRenderProps } from './IsometricBuilding';
import { iso, polygon } from '../lib/isometric-geometry';

// Architectural dimensions are illustrative; every selectable room retains its persisted ID.
export function DollhouseBuilding({ floors, selectedFloor, visibleRooms, issues, selectedRoomId, heatmap,
  zoom, pan, onSelectRoom, onSelectFloor, onPointerDown, onPointerMove, onPointerUp, roofVisible,
  occupancy }: BuildingRenderProps & { roofVisible: boolean; occupancy: Map<string, number> | null }) {
  const levels = selectedFloor ? floors.filter(floor => floor.label === selectedFloor) : floors;
  // Shallower projection and floor clearance keep every rear room exposed.
  const lift = 190;
  const top = -(levels.length - 1) * lift;
  const raised = (x: number, y: number, height: number) => ({ ...iso(x,y), y: iso(x,y).y-height });
  return <svg className="isometric-building dollhouse-building" viewBox={`100 ${top-25} 520 ${325-top}`}
    aria-label="Interactive cutaway dormitory dollhouse" onPointerDown={onPointerDown} onPointerMove={onPointerMove}
    onPointerUp={onPointerUp} onPointerCancel={onPointerUp}>
    <g transform={`translate(${pan.x} ${pan.y}) translate(360 180) scale(${zoom}) translate(-360 -180)`}>
      <g transform="scale(1 .72)" aria-hidden="true" pointerEvents="none"><ellipse cx="360" cy="337" rx="210" ry="35" fill="#12171a" opacity=".25" />
      <polygon points={polygon([iso(-.25,-.25),iso(4.25,-.25),iso(4.25,3.25),iso(-.25,3.25)])} fill="#536879" stroke="#8299aa" /></g>
      {/* Continuous rear enclosure sits behind every interactive floor. */}
      <g className="dollhouse-rear-wall" transform="scale(1 .72)" aria-hidden="true" pointerEvents="none">
        <polygon points={polygon([iso(0,0),iso(4,0),raised(4,0,-top/.72+48),raised(0,0,-top/.72+48)])} fill="#667e91" stroke="#405566" strokeWidth="2" />
        <polygon points={polygon([iso(0,0),iso(0,1),raised(0,1,-top/.72+32),raised(0,0,-top/.72+48)])} fill="#849aaa" stroke="#526b7e" strokeWidth="2" />
      </g>
      {levels.map((floor,index) => {
        const floorRooms = selectedFloor ? visibleRooms : floor.rooms.slice(0,8);
        return <g key={floor.label} transform={`translate(0 ${-index*lift}) scale(1 .72)`} data-dollhouse-floor={floor.label}>
          <g aria-hidden="true" className="dollhouse-architecture" pointerEvents="none">
            {index < levels.length-1 && [0,4].map(x => <path key={x}
              d={`M${iso(x,0).x} ${iso(x,0).y}v-${lift/.72}`}
              stroke="#526b7e" strokeWidth="5" />)}
            <polygon points={polygon([iso(0,0),iso(4,0),raised(4,0,48),raised(0,0,48)])} fill="#8097a8" stroke="#455c6e" />
            <polygon points={polygon([iso(0,0),iso(0,1),raised(0,1,32),raised(0,0,48)])} fill="#a3b5c1" stroke="#597184" />
            {[0,1,2,3].map(x => <g key={x}><polygon points={polygon([raised(x+.28,0,23),raised(x+.7,0,23),raised(x+.7,0,42),raised(x+.28,0,42)])} fill="#ffd998" stroke="#597184" strokeWidth="3" /><circle cx={iso(x+.85,0).x} cy={iso(x+.85,0).y-30} r="3" fill="#ffe1a1" /></g>)}
          </g>
          <FloorPlate rooms={floorRooms} floorLabel={floor.label} issues={issues} selectedRoomId={selectedRoomId}
            selectedSlotIndex={null} heatmapBoxes heatmap={heatmap} onSelectRoom={onSelectRoom}
            onSelectFloor={selectedFloor ? undefined : () => onSelectFloor(floor.label)} />
          {floor.label === floors[0]?.label && <g className="dollhouse-entrance" aria-hidden="true" pointerEvents="none">
            {/* One illustrative entrance opens directly onto the ground-floor corridor. */}
            {[-.85,-.65,-.45].map((x,step) => <polygon key={x} points={polygon([
              raised(x,1.05,-16+step*5),raised(x+.22,1.05,-16+step*5),
              raised(x+.22,1.95,-16+step*5),raised(x,1.95,-16+step*5),
            ])} fill={['#657d8e','#8298a7','#a0b2be'][step]} stroke="#4b6375" />)}
            <polygon points={polygon([iso(-.25,1.05),iso(.02,1.05),iso(.02,1.95),iso(-.25,1.95)])} fill="#a9bbc7" stroke="#60798c" />
            <polygon points={polygon([iso(0,1.15),iso(0,1.85),raised(0,1.85,39),raised(0,1.15,39)])} fill="#4c6375" stroke="#c1d1db" strokeWidth="3" />
            <polygon points={polygon([raised(0,1.23,9),raised(0,1.77,9),raised(0,1.77,33),raised(0,1.23,33)])} fill="#dbb675" stroke="#493c32" />
            <path d={`M${raised(0,1.5,2).x} ${raised(0,1.5,2).y}v-34`} stroke="#455c6e" strokeWidth="2" />
            <polygon points={polygon([raised(.07,1.02,43),raised(.07,1.98,43),raised(-.45,1.98,40),raised(-.45,1.02,40)])} fill="#536a7d" stroke="#94aaba" strokeWidth="2" />
            {[1.05,1.95].map(y => <g key={y}>
              <path d={`M${iso(-.3,y).x} ${iso(-.3,y).y}v-40`} stroke="#8fa5b6" strokeWidth="3" />
              <circle cx={raised(0,y,27).x} cy={raised(0,y,27).y} r="5" fill="#f4ca80" opacity=".25" />
              <circle cx={raised(0,y,27).x} cy={raised(0,y,27).y} r="2" fill="#ffe3a7" />
            </g>)}
          </g>}
          <g aria-hidden="true" pointerEvents="none">
            {Array.from({length:8},(_,i) => {
              const x=i%4, y=i<4?0:2;
              return <g key={i}>
                <polygon points={polygon([iso(x+.42,y+.22),iso(x+.68,y+.22),iso(x+.68,y+.6),iso(x+.42,y+.6)])} fill={['#ba7365','#829b8b','#c3a16c'][i%3]} stroke="#e8d6b5" strokeWidth=".5" />
                <path d={`M${iso(x+.59,y+.23).x} ${iso(x+.59,y+.23).y}L${iso(x+.59,y+.59).x} ${iso(x+.59,y+.59).y}`} stroke="#f6e8ce" strokeWidth="1.5" opacity=".7" />
                <polygon points={polygon([iso(x+.8,y+.16),iso(x+.88,y+.16),iso(x+.88,y+.27),iso(x+.8,y+.27)])} fill="#eee0bf" />
                <polygon points={polygon([iso(x+.07,y+.1),iso(x+.14,y+.1),raised(x+.14,y+.1,13),raised(x+.07,y+.1,13)])} fill="#6d8496" stroke="#435b6e" strokeWidth=".7" />
              </g>;
            })}

            <text x="135" y="210" className="dollhouse-floor-label">{floor.label}</text>
            {floorRooms.map((room,i) => {
              const pos=iso(i%4+.5,i<4?.5:2.5);
              const count=occupancy?.get(room.id) ?? 0;
              return !heatmap && occupancy ? <g key={room.id}><circle cx={pos.x+13} cy={pos.y-13} r="11" fill={room.availability!=='available'?'#ac766a':count>=room.capacity?'#cf5553':count?'#c4a361':'#81a994'} stroke="#f1dfbd" /><text x={pos.x+13} y={pos.y-10} textAnchor="middle" fontSize="7" fill="#18232a">{count}/{room.capacity}</text></g> : null;
            })}
            <path d={`M${iso(0,2).x} ${iso(0,2).y-12}L${iso(4,2).x} ${iso(4,2).y-12}`} stroke="#526b7e" strokeWidth="3" />
            {[0,.5,1,1.5,2,2.5,3,3.5,4].map(x=><path key={x} d={`M${iso(x,2).x} ${iso(x,2).y}v-12`} stroke="#526b7e" strokeWidth="2" />)}
          </g>
        </g>;
      })}
      {roofVisible && <g className="dollhouse-roof" transform={`translate(0 ${top}) scale(1 .72)`} aria-hidden="true" pointerEvents="none">
        <polygon points={polygon([raised(-.15,-.65,48),raised(4.15,-.65,48),raised(4.15,-.4,72),raised(-.15,-.4,72)])} fill="#3d5062" stroke="#8198aa" strokeWidth="2" />
        <polygon points={polygon([raised(-.15,-.4,72),raised(4.15,-.4,72),raised(4.15,-.1,48),raised(-.15,-.1,48)])} fill="#5c7488" stroke="#9aafbe" strokeWidth="2" />
        {[0,1,2,3,4].map(x=><path key={x} d={`M${raised(x,-.65,48).x} ${raised(x,-.65,48).y}L${raised(x,-.4,72).x} ${raised(x,-.4,72).y}L${raised(x,-.1,48).x} ${raised(x,-.1,48).y}`} stroke="#304354" fill="none" />)}
      </g>}
    </g>
  </svg>;
}
