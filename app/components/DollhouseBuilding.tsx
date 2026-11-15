'use client';

import { useState } from 'react';
import { MaintenanceGlow } from './MaintenanceGlow';
import { FloorPlate, point, poly, rect, type BuildingRenderProps } from './IsometricBuilding';
import { dollhouseLevelOffsets, roomLayoutForFloor, roomSlotIndex } from '../lib/building-map.mjs';

function BuildingPlatform() {
  const left = -.65, right = 9.35, back = -.65, front = 6.35;
  const ground = -180, bottom = -198;
  return <g data-building-platform="true" aria-hidden="true" pointerEvents="none">
    <polygon points={poly([[left,back,bottom-5],[right,back,bottom-5],[right,front,bottom-5],[left,front,bottom-5]])} fill="#122635" opacity=".24" transform="translate(9 10)" />
    <polygon points={poly([[left,back,ground],[right,back,ground],[right,front,ground],[left,front,ground]])} fill="#73964d" stroke="#56783a" strokeWidth="1.5" />
    <polygon points={poly([[left,front,ground],[right,front,ground],[right,front,bottom],[left,front,bottom]])} fill="#7b6848" stroke="#5d513b" />
    <polygon points={poly([[right,back,ground],[right,front,ground],[right,front,bottom],[right,back,bottom]])} fill="#63553d" stroke="#4d4534" />
    <polyline points={poly([[left,front,ground],[right,front,ground],[right,back,ground]])} fill="none" stroke="#98b569" strokeWidth="2" />
  </g>;
}

function BusinessBase() {
  return <g aria-label="First floor businesses, exterior only" className="dollhouse-business" >
    <polygon points={poly([[0,0],[4.35,0],[4.35,2.5],[8.7,2.5],[8.7,4.45],[0,4.45]])} fill="#7e9199" stroke="#3e5667" />
    <polygon points={poly([[0,0],[0,4.45],[0,4.45,-180],[0,0,-180]])} fill="#20384b" />
    <polygon points={poly([[0,4.45],[8.7,4.45],[8.7,4.45,-180],[0,4.45,-180]])} fill="#314c60" stroke="#20384b" />
    <polygon data-business-side-wall="true" points={poly([[8.7,2.5,-180],[8.7,4.45,-180],[8.7,4.45],[8.7,2.5]])} fill="#20384b" />
    {[.3,3.05,5.8].map((x,i)=><g key={x}>
      <polygon points={poly([[x,4.46,-35],[x+2.25,4.46,-35],[x+2.25,4.46,-162],[x,4.46,-162]])} fill="#304a5a" stroke="#92795d" strokeWidth="5" />
      {[0,1,2].map(n=><polygon key={n} points={poly([[x+.07+n*.73,4.47,-45],[x+.68+n*.73,4.47,-45],[x+.68+n*.73,4.47,-155],[x+.07+n*.73,4.47,-155]])} fill={n===1?'#b4c9c9':'#83a4ae'} stroke="#d6d4c7" strokeWidth="1.5" />)}
      <polygon points={poly([[x-.08,4.45,-20],[x+2.33,4.45,-20],[x+2.33,4.72,-29],[x-.08,4.72,-29]])} fill={i===1?'#344e65':'#9c5046'} stroke="#603e36" />
      <path d={`M${point(x+1.12,4.48,-103).x} ${point(x+1.12,4.48,-103).y}v16`} stroke="#f6e2ba" strokeWidth="3" />
    </g>)}
    <polygon points={rect(-.04,4.45,7.49,.25,-180)} fill="#a8afaa" stroke="#72838a" />
  </g>;
}

function StairAnnex({ upperFloorHeight }: { upperFloorHeight: number }) {
  // Shares the hallway edge, right exterior wall and slab elevations with the main building.
  const left=7.45, right=8.7, back=4.45, front=5.65;
  const center=(left+right)/2, ground=-180, eave=upperFloorHeight+175, ridge=upperFloorHeight+192;
  const roofLeft=left-.06, roofRight=right+.06, roofFront=front+.06;
  const mainRidgeY=3.45, mainEaveY=4.57;
  const face=(x0:number,x1:number,z0:number,z1:number,y=front)=>poly([[x0,y,z0],[x1,y,z0],[x1,y,z1],[x0,y,z1]]);
  return <g data-stair-annex="true" aria-hidden="true" pointerEvents="none">
    <polygon points={poly([[left,back,ground],[right,back,ground],[right,front,ground],[left,front,ground]])} fill="#536574" stroke="#263e50" />
    {[[ground,0,'1st Floor'],[0,upperFloorHeight,'2nd Floor'],[upperFloorHeight,eave,'3rd Floor']].map(([bottom,top,label],index) => {
      const low=Number(bottom), high=Number(top), windowBase=low+55;
      return <g key={label} data-annex-floor={label}>
        <polygon data-annex-side-wall="true" points={poly([[right,back,low],[right,front,low],[right,front,high],[right,back,high]])} fill="#20384b" />
        <polygon points={face(left,right,low,high)} fill="#314c60" stroke="#172e40" strokeWidth="2" />
        {[left,right-.07].map(x=><polygon key={x} points={face(x,x+.07,low,high)} fill="#b95149" />)}
        {index===0 ? <>
          <polygon points={face(left+.19,right-.19,ground+4,-30,front+.01)} fill="#162b3a" stroke="#a45148" strokeWidth="4" />
          {Array.from({length:6},(_,i)=>ground+17+i*22).map(z=><polygon key={z} points={face(left+.23,right-.23,z,z+6,front+.02)} fill="#a9a9a2" stroke="#62737a" />)}
        </> : <>
          <g data-annex-landing={low}>
            <polygon points={poly([[left,back,low],[left,front,low],[left,front,low-12],[left,back,low-12]])} fill="#b95149" />
            <polygon points={face(left,right,low-12,low)} fill="#b95149" />
            <polygon points={poly([[right,back,low],[right,front,low],[right,front,low-12],[right,back,low-12]])} fill="#9b4742" />
          </g>
          <polygon points={face(left+.23,right-.23,windowBase,windowBase+67,front+.02)} fill="#8ba8ae" stroke="#162e40" strokeWidth="5" />
          <path d={`M${point(center,front+.03,windowBase).x} ${point(center,front+.03,windowBase).y}L${point(center,front+.03,windowBase+67).x} ${point(center,front+.03,windowBase+67).y}`} stroke="#263f50" strokeWidth="3" />
        </>}
        {index===2 && <>
    <polygon points={poly([[left,front,eave],[center,front,ridge],[right,front,eave]])} fill="#314c60" stroke="#b95149" strokeWidth="6" />
    {/* Valley edges meet the main roof surface; both ridges share one elevation. */}
    <g data-annex-roof="true">
      <polygon points={poly([[roofLeft,roofFront,eave],[center,roofFront,ridge],[center,mainRidgeY,ridge],[roofLeft,mainEaveY,eave]])} fill="#3d5667" stroke="#20394d" />
      <polygon points={poly([[center,roofFront,ridge],[roofRight,roofFront,eave],[roofRight,mainEaveY,eave],[center,mainRidgeY,ridge]])} fill="#273f52" stroke="#20394d" />
      {Array.from({length:10},(_,i)=>3.65+i*.2).map(y=>{
        const width=Math.min(1,(y-mainRidgeY)/(mainEaveY-mainRidgeY));
        return <polyline key={y} points={poly([[center-(center-roofLeft)*width,y,ridge-17*width],[center,y,ridge],[center+(roofRight-center)*width,y,ridge-17*width]])} fill="none" stroke="#9eb2ba" strokeOpacity=".25" strokeWidth="1.2" />;
      })}
    </g>
    <path d={`M${point(left,front,eave).x} ${point(left,front,eave).y}L${point(center,front,ridge).x} ${point(center,front,ridge).y}L${point(right,front,eave).x} ${point(right,front,eave).y}`} fill="none" stroke="#b95149" strokeWidth="5" />
        </>}
      </g>;
    })}
  </g>;
}

function DormRoof() {
  const planes = [
    { x0: -.12, x1: 4.47, back: -.12, ridge: 2.2, front: 4.57, peak: 78 },
    { x0: 4.47, x1: 8.82, back: 2.38, ridge: 3.45, front: 4.57, peak: 72 },
  ];
  const leftSlope=(y:number)=>78-(y-2.2)*23/2.37;
  const joinY=(78+2.2*23/2.37-55+2.38*17/1.07)/(23/2.37+17/1.07);
  return <g data-dollhouse-roof="true" aria-hidden="true" className="dollhouse-roof">
    <polygon data-roof-side-wall="true" points={poly([[4.35,0,40],[4.35,2.38,40],[4.35,2.38,175],[4.35,0,175]])} fill="#304a5d" stroke="#20394d" strokeWidth="1.5" />
    {[[0,0],[4.35,0],[4.35,2.5],[8.7,2.5],[0,4.43],[2.3,4.43],[4.35,4.43],[6.5,4.43],[8.7,4.43]].map(([x,y])=><path key={`${x}-${y}`}
      d={`M${point(x,y).x} ${point(x,y).y}L${point(x,y,175).x} ${point(x,y,175).y}`} stroke="#874c47" strokeWidth="4" />)}
    <g transform="translate(0 -120)">
    {planes.map(({x0,x1,back,ridge,front,peak})=><g key={x0}>
      <polygon points={poly([[x0,back,55],[x1,back,55],[x1,ridge,peak],[x0,ridge,peak]])} fill="#273f52" stroke="#20394d" strokeWidth="2" />
      <polygon points={poly([[x0,ridge,peak],[x1,ridge,peak],[x1,front,55],[x0,front,55]])} fill="#3d5667" stroke="#20394d" strokeWidth="2" />
      <polygon points={poly([[x0,front,55],[x1,front,55],[x1,front,49],[x0,front,49]])} fill="#253f52" stroke="#172c3a" />
      {Array.from({length:Math.ceil((x1-x0)*4)},(_,i)=>x0+.2+i*.25).filter(x=>x<x1).map(x=><g key={x}>
        <path d={`M${point(x,back,55).x} ${point(x,back,55).y}L${point(x,ridge,peak).x} ${point(x,ridge,peak).y}`} stroke="#9eb2ba" strokeOpacity=".25" strokeWidth="1.2" />
        <path d={`M${point(x,ridge,peak).x} ${point(x,ridge,peak).y}L${point(x,front,55).x} ${point(x,front,55).y}`} stroke="#9eb2ba" strokeOpacity=".25" strokeWidth="1.2" />
      </g>)}
    </g>)}
    <g data-roof-center-join="true" fill="#273f52" stroke="#20394d">
      <polygon points={poly([[4.47,2.38,55],[4.47,2.38,leftSlope(2.38)],[4.47,joinY,leftSlope(joinY)]])} />
      <polygon points={poly([[4.47,joinY,leftSlope(joinY)],[4.47,3.45,72],[4.47,4.57,55],[4.47,3.45,leftSlope(3.45)]])} />
    </g>
    <polygon points={poly([[4.47,-.12,55],[4.47,2.2,78],[4.47,2.38,leftSlope(2.38)],[4.47,2.38,45],[4.47,-.12,45]])} fill="#273f52" stroke="#20394d" />
    <polygon points={poly([[8.82,2.38,55],[8.82,3.45,72],[8.82,4.57,55],[8.82,4.57,45],[8.82,2.38,45]])} fill="#304a5d" stroke="#20394d" />
    </g>
  </g>;
}

export function DollhouseBuilding(props: BuildingRenderProps & { roofVisible: boolean; occupancy: Map<string, number> | null }) {
  const [hoveredRoomId, setHoveredRoomId] = useState<string | null>(null);
  const labels=['1st Floor','2nd Floor','3rd Floor'];
  const inspection=labels.includes(props.selectedFloor ?? '');
  const selectedRecord = props.floors.flatMap(floor => floor.rooms).find(room => room.id === props.selectedRoomId);
  const focusIndex = selectedRecord ? roomSlotIndex(selectedRecord) : props.selectedSlotIndex;
  const focusSlot = inspection && focusIndex !== null && focusIndex >= 0
    ? roomLayoutForFloor(props.selectedFloor ?? '')[focusIndex] : undefined;
  const focus = focusSlot ? point(focusSlot.x + (focusSlot.width ?? 1.4) / 2, focusSlot.y + .6) : null;
  const offsets=inspection ? labels.map((label,index)=>label===props.selectedFloor ? 0 : index<2 ? 390 : 740) : dollhouseLevelOffsets(null);
  return <svg className={`isometric-building dorm-building architectural-building${inspection ? ' is-inspecting' : ''}${props.heatmap ? ' is-maintenance' : ''}`}
    onFocus={e=>setHoveredRoomId((e.target as Element).closest('[data-room-id]')?.getAttribute('data-room-id') ?? null)} onBlur={()=>setHoveredRoomId(null)}
    onPointerOver={e=>setHoveredRoomId((e.target as Element).closest('[data-room-id]')?.getAttribute('data-room-id') ?? null)} onPointerLeave={()=>setHoveredRoomId(null)}
    viewBox={inspection ? "-35 -15 1060 490" : "-235 -410 1610 1250"} aria-label="Interactive three-level dormitory dollhouse"
    onPointerDown={props.onPointerDown} onPointerMove={props.onPointerMove} onPointerUp={props.onPointerUp} onPointerCancel={props.onPointerUp}>
    <g transform={`translate(${props.pan.x} ${props.pan.y}) translate(495 250) scale(${props.zoom}) translate(-495 -250)`}>
      <g className={`dollhouse-camera${focus ? ' is-room-focused' : ''}`} style={{transform:focus ? `translate(495px, 230px) scale(var(--room-focus-scale, 1.65)) translate(${-focus.x}px, ${-focus.y}px)` : inspection?'translate(0px, 0px) scale(1)':'translate(-49.5px, -55px) scale(1.18)'}}>
        {!inspection && <g transform={`translate(0 ${offsets[1]}) scale(1 .65)`}><BuildingPlatform /></g>}
        {labels.map((label,index)=>{
          const floor=props.floors.find(f=>f.label===label);
          const selected=props.selectedFloor===label;
          const sideWallHeight=index===1?(offsets[1]-offsets[2])/.65:175;
          return <g key={label} className="dollhouse-level" data-dollhouse-floor={label} data-selected={selected}
            onClick={e=>{if(index > 0 && !(e.target as Element).closest('[data-floor-label]') && (!inspection || !(e.target as Element).closest('[data-room-id], [data-room-space]'))) props.onSelectFloor(label);}}
            style={{transform:`translateY(${offsets[index]}px)`,opacity:inspection && !selected ? 0 : 1,pointerEvents:inspection && !selected ? 'none' : 'auto'}}>
            <g transform={inspection && selected && index > 0 ? undefined : "scale(1 .65)"}>

              {index===0 ? <BusinessBase /> : <>
                <g aria-hidden="true" pointerEvents="none" className="dollhouse-structure">
                  {[0,2.3,4.35,8.64].map(x=><polygon key={x} points={poly([[x,4.43],[x+.06,4.43],[x+.06,4.43,index===1?-180:-200],[x,4.43,index===1?-180:-200]])} fill="#854b45" />)}
                  <polygon points={poly([[0,4.45],[8.7,4.45],[8.7,4.45,-25],[0,4.45,-25]])} fill="#314c60" />
                </g>
                <FloorPlate rooms={floor?.rooms ?? []} floorLabel={label} issues={props.issues} selectedRoomId={props.selectedRoomId}
                  selectedSlotIndex={selected ? props.selectedSlotIndex : null} heatmap={props.heatmap} onSelectRoom={inspection ? props.onSelectRoom : ()=>props.onSelectFloor(label)}
                  onSelectRoomSpace={selected ? props.onSelectRoomSpace : undefined} roof={props.roofVisible} occupancy={props.occupancy} showRoomLabels={selected} overview={!inspection} />
                {!inspection && <g>
                  <polygon data-dollhouse-side-wall={label} points={poly([[8.7,2.5],[8.7,4.45],[8.7,4.45,sideWallHeight],[8.7,2.5,sideWallHeight]])} fill="#20384b" />
                  <polygon points={poly([[8.7,2.5,-12],[8.7,4.45,-12],[8.7,4.45],[8.7,2.5]])} fill="#9b4742" />
                  {index===2 && props.roofVisible && <polygon points={poly([[8.7,2.5,175],[8.7,3.45,192],[8.7,4.45,175]])} fill="#20384b" />}
                </g>}
                {index===2 && !inspection && props.roofVisible && <DormRoof />}
              </>}
            </g>
            {!inspection && index > 0 && <g data-floor-label={label} role="button" tabIndex={0} aria-label={`Inspect ${label}`} className="dollhouse-floor-control"
              onClick={()=>props.onSelectFloor(label)} onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();props.onSelectFloor(label);}}}>
              <rect x={inspection?890:1060} y={index===0?315:260} width="125" height={index===0?47:35} rx="6" />
              <text x={inspection?902:1072} y={index===0?334:283}>{label}</text>
            </g>}
          </g>;
        })}
        {!inspection && <g transform={`translate(0 ${offsets[1]}) scale(1 .65)`}><StairAnnex upperFloorHeight={(offsets[1]-offsets[2])/.65} /></g>}
        {props.heatmap && labels.slice(1).map((label,i)=> {
          if (inspection && label !== props.selectedFloor) return null;
          const rooms=props.floors.find(f=>f.label===label)?.rooms ?? [];
          const pending=rooms.reduce((sum,r)=>sum+(props.issues.get(r.id)?.issues.filter(issue=>issue.status==='pending').length ?? 0),0);
          const ongoing=rooms.reduce((sum,r)=>sum+(props.issues.get(r.id)?.issues.filter(issue=>issue.status==='in_progress').length ?? 0),0);
          return <g key={label} className="maintenance-floor-overlay" data-overlay-floor={label} style={{transform:`translateY(${inspection?0:offsets[i+1]}px)`}}>
            <g transform={inspection?undefined:'scale(1 .65)'}>
              <MaintenanceGlow rooms={rooms} floor={label} issues={props.issues} overview={!inspection} selectedRoomId={props.selectedRoomId} hoveredRoomId={hoveredRoomId} onSelectFloor={props.onSelectFloor} />
            </g>
            {!inspection && <text className="maintenance-floor-summary" x="1060" y="312" pointerEvents="none">{pending} pending · {ongoing} ongoing</text>}
          </g>;
        })}
      </g>
    </g>
  </svg>;
}
