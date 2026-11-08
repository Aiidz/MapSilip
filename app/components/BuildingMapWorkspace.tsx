'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent } from 'react';
import { DollhouseBuilding } from './DollhouseBuilding';
import { Icon } from './Icon';
import { RoomVignette } from './IsometricBuilding';
import { groupRoomsByFloor, modelFloors, modelRoomLabel, pageRooms, ROOMS_PER_SCENE, summarizeRoomIssues } from '../lib/building-map.mjs';
import type { BuildingIssue, BuildingRoom } from '../lib/building-map.mjs';
import { RoomContextPanel } from './RoomContextPanel';

type Assignment = { room_id: string; ended_on: string | null };
type Role = 'owner' | 'caretaker';

async function readAll<T>(resource: string): Promise<T[]> {
  const all: T[] = [];
  for (let page = 1; page <= 100; page++) {
    const response = await fetch(`/api/operations?resource=${resource}&page=${page}&pageSize=100`, { cache: 'no-store' });
    if (!response.ok) throw new Error(`${resource} could not be loaded.`);
    const result = await response.json() as { rows: T[]; count: number };
    all.push(...result.rows);
    if (all.length >= result.count || result.rows.length === 0) return all;
  }
  throw new Error(`${resource} has too many records to display.`);
}

function readable(value: string) { return value.replaceAll('_', ' '); }

export function BuildingMapWorkspace({ role, mode = 'rooms', onOpenRoomRecord, onViewRequests, roomRecords, assignmentRecords, recordsLoading = false, onRecordsChanged }: {
  role: Role;
  onViewRequests?: () => void;
  mode?: 'rooms' | 'maintenance';
  onOpenRoomRecord?: (room: BuildingRoom) => void;
  roomRecords?: BuildingRoom[];
  assignmentRecords?: Assignment[];
  recordsLoading?: boolean;
  onRecordsChanged?: () => Promise<void>;
}) {
  const [loadedRooms, setRooms] = useState<BuildingRoom[]>([]);
  const [issues, setIssues] = useState<BuildingIssue[]>([]);
  const [loadedAssignments, setAssignments] = useState<Assignment[]>([]);
  const rooms = roomRecords ?? loadedRooms;
  const assignments = assignmentRecords ?? loadedAssignments;
  const hasRoomRecords = roomRecords !== undefined;
  const hasAssignmentRecords = assignmentRecords !== undefined;
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [selectedFloor, setSelectedFloor] = useState<string | null>(null);
  const [selectedRoomId, setSelectedRoomId] = useState<string | null>(null);
  const [selectedSlotIndex, setSelectedSlotIndex] = useState<number | null>(null);
  const [roomPage, setRoomPage] = useState(1);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const panFrame = useRef<number | null>(null);
  const pendingPan = useRef<{ x: number; y: number } | null>(null);
  useEffect(() => () => { if (panFrame.current !== null) window.cancelAnimationFrame(panFrame.current); }, []);
  const svgDrag = useRef<{ pointerId: number; x: number; y: number; panX: number; panY: number } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [roomRows, issueRows, assignmentRows] = await Promise.all([
        hasRoomRecords ? Promise.resolve([]) : readAll<BuildingRoom>('rooms'),
        readAll<BuildingIssue>('maintenance'),
        role === 'owner' && !hasAssignmentRecords ? readAll<Assignment>('assignments') : Promise.resolve([]),
      ]);
      setRooms(roomRows);
      setIssues(issueRows);
      setAssignments(assignmentRows);
      setError('');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Building data could not be loaded.');
    } finally { setLoading(false); }
  }, [role, hasRoomRecords, hasAssignmentRecords]);
  useEffect(() => { const timer = window.setTimeout(() => void load(), 0); return () => window.clearTimeout(timer); }, [load]);

  const floors = useMemo(() => groupRoomsByFloor(rooms), [rooms]);
  const displayFloors = useMemo(() => modelFloors(floors), [floors]);
  const issueMap = useMemo(() => summarizeRoomIssues(rooms, issues), [rooms, issues]);
  const heatmap = mode === 'maintenance';
  const occupancy = useMemo(() => {
    if (role !== 'owner') return null;
    const counts = new Map(rooms.map(room => [room.id, 0]));
    for (const row of assignments) if (!row.ended_on && counts.has(row.room_id)) counts.set(row.room_id, (counts.get(row.room_id) ?? 0) + 1);
    return counts;
  }, [role, rooms, assignments]);
  const currentFloor = floors.find(floor => floor.label === selectedFloor);
  const floorRooms = currentFloor?.rooms ?? [];
  const maxPage = Math.max(1, Math.ceil(floorRooms.length / ROOMS_PER_SCENE));
  const visibleRooms = pageRooms(floorRooms, Math.min(roomPage, maxPage));
  const selectedRoom = rooms.find(room => room.id === selectedRoomId) ?? null;
  const selectedSceneIndex = selectedRoom ? Math.max(0, visibleRooms.findIndex(room => room.id === selectedRoom.id)) : selectedSlotIndex ?? 0;
  const affectedRooms = [...issueMap.values()].filter(state => state.openCount > 0).length;
  const occupants = selectedRoom && role === 'owner'
    ? assignments.filter(row => row.room_id === selectedRoom.id && !row.ended_on).length : null;

  function chooseFloor(label: string | null) {
    setSelectedFloor(label);
    setSelectedRoomId(null);
    setSelectedSlotIndex(null);
    setRoomPage(1);
    setPan({ x: 0, y: 0 });
    setZoom(1);
  }
  function chooseRoom(room: BuildingRoom) {
    if (selectedFloor !== room.floor_label) {
      chooseFloor(room.floor_label);
      setSelectedRoomId(room.id);
      return;
    }
    setSelectedRoomId(previous => previous === room.id ? null : room.id);
    setSelectedSlotIndex(null);
    setPan(previous => ({ ...previous, y: -22 }));
  }
  function chooseRoomSpace(index: number) {
    setSelectedRoomId(null);
    setSelectedSlotIndex(previous => previous === index ? null : index);
  }
  function reset() {
    chooseFloor(null);
    setMessage('');
  }
  function pointerDown(event: PointerEvent<SVGSVGElement>) {
    if ((event.target as Element).closest('[data-room-id], [data-room-space], [data-floor-label]')) return;
    svgDrag.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, panX: pan.x, panY: pan.y };
    event.currentTarget.setPointerCapture(event.pointerId);
  }
  function pointerMove(event: PointerEvent<SVGSVGElement>) {
    const drag = svgDrag.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const factor = 480 / Math.max(1, event.currentTarget.clientWidth);
    pendingPan.current = { x: Math.max(-260, Math.min(260, drag.panX + (event.clientX - drag.x) * factor)),
      y: Math.max(-190, Math.min(190, drag.panY + (event.clientY - drag.y) * factor)) };
    if (panFrame.current === null) panFrame.current = window.requestAnimationFrame(() => {
      panFrame.current = null;
      if (pendingPan.current) setPan(pendingPan.current);
      pendingPan.current = null;
    });
  }
  function pointerUp(event: PointerEvent<SVGSVGElement>) {
    if (panFrame.current !== null) window.cancelAnimationFrame(panFrame.current);
    panFrame.current = null;
    if (pendingPan.current) setPan(pendingPan.current);
    pendingPan.current = null;
    if (svgDrag.current?.pointerId === event.pointerId) svgDrag.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  }

  return <div className="building-experience">
    <div className="building-experience__top">
      <div><h2>{heatmap ? 'Maintenance activity' : 'Dormitory view'}</h2><p>{heatmap ? 'Select a floor and room to inspect repair requests.' : 'Select a floor and room to explore the building.'}</p></div>

    </div>
    <div className="building-experience__floors" role="group" aria-label="Select floor">
      <button type="button" aria-pressed={selectedFloor === null} className={selectedFloor === null ? 'is-active' : ''} onClick={() => chooseFloor(null)}>All levels</button>
      {displayFloors.map(floor => <button type="button" key={floor.label} aria-pressed={selectedFloor === floor.label}
        className={selectedFloor === floor.label ? 'is-active' : ''} onClick={() => chooseFloor(floor.label)}>{floor.label}</button>)}
      <button className="building-experience__reset" type="button" onClick={reset} title="Reset building view">Reset view</button>
    </div>
    {error && <p role="alert" className="building-experience__notice">{error} <button type="button" onClick={() => void load()}>Retry</button></p>}
    {message && <p role="status" className="building-experience__notice">{message}</p>}
    <div className="building-experience__layout">
      <div className="building-experience__stage">
        {loading || recordsLoading ? <div className="building-experience__stage-message" role="status">Loading building records…</div> : <>
          <DollhouseBuilding floors={displayFloors} selectedFloor={selectedFloor} visibleRooms={visibleRooms} issues={issueMap}
            selectedRoomId={selectedRoomId} selectedSlotIndex={selectedSlotIndex} heatmap={heatmap} zoom={zoom} pan={pan}
            roofVisible={true} occupancy={occupancy} onSelectFloor={chooseFloor} onSelectRoom={chooseRoom} onSelectRoomSpace={chooseRoomSpace}
            onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={pointerUp} />
          <div className="building-experience__zoom" aria-label="Map zoom controls">
            <button type="button" aria-label="Zoom out" disabled={zoom <= 1} onClick={() => setZoom(value => Math.max(1, value - .25))}>−</button>
            <span aria-live="polite">{Math.round(zoom * 100)}%</span>
            <button type="button" aria-label="Zoom in" disabled={zoom >= 2.25} onClick={() => setZoom(value => Math.min(2.25, value + .25))}>+</button>
          </div>
          {selectedFloor && <button className="building-experience__return" type="button" onClick={() => chooseFloor(null)}>← Building view</button>}
        </>}
      </div>
      <aside className={`building-experience__sheet${selectedRoom || selectedSlotIndex !== null ? ' is-open' : ''}`} aria-label="Room information">
        <div className="building-experience__sheet-head"><div><span>{heatmap ? 'Maintenance Details' : 'Room Details'}</span><h3>{selectedRoom ? `Room ${selectedRoom.room_number}` : selectedSlotIndex !== null ? `Room ${modelRoomLabel(selectedSlotIndex)}` : selectedFloor ?? 'Select a floor'}</h3></div>
          {(selectedRoom || selectedSlotIndex !== null) && <button type="button" aria-label="Close room details" onClick={() => { setSelectedRoomId(null); setSelectedSlotIndex(null); }}>×</button>}</div>
        {selectedRoom ? <div className={`building-experience__sheet-body${!heatmap ? ' room-management-sheet' : ' maintenance-room-sheet'}`}>
          <RoomVignette index={selectedSceneIndex} />
          <dl className="building-experience__facts">
            <div><dt>Floor</dt><dd>{selectedRoom.floor_label}</dd></div>
            <div><dt>Capacity</dt><dd>{selectedRoom.capacity}</dd></div>
            <div><dt>Availability</dt><dd>{readable(selectedRoom.availability)}</dd></div>
            {occupants !== null && <div><dt>Assigned tenants</dt><dd>{occupants}</dd></div>}
          </dl>
          <RoomContextPanel key={selectedRoom.id} roomId={selectedRoom.id} role={role} onChanged={async () => { await Promise.all([load(), onRecordsChanged?.()]); }} presentation={heatmap ? 'maintenance' : 'management'} onViewRequests={onViewRequests} />
          {role === 'owner' && onOpenRoomRecord && <button className="button button--secondary building-experience__record" type="button" onClick={() => onOpenRoomRecord(selectedRoom)}>Open in room list</button>}
        </div> : selectedSlotIndex !== null ? <div className="building-experience__sheet-empty"><RoomVignette index={selectedSlotIndex} /><strong>Room {modelRoomLabel(selectedSlotIndex)} · {selectedFloor}</strong>
          <p>Room records are loading or unavailable. Refresh the room view.</p>

        </div> : <div className="building-experience__sheet-empty"><Icon name="building" /><strong>{rooms.length ? 'Choose a numbered room' : 'No room records yet'}</strong>
          <p>Choose a floor and room to explore the building.</p></div>}
      </aside>
    </div>
    {selectedFloor && floorRooms.length > ROOMS_PER_SCENE && <div className="building-experience__pages" aria-label="Rooms on this floor">
      <button type="button" disabled={roomPage <= 1} onClick={() => { setRoomPage(page => page - 1);setSelectedRoomId(null); }}>Previous rooms</button>
      <span>{(roomPage - 1) * ROOMS_PER_SCENE + 1}–{Math.min(roomPage * ROOMS_PER_SCENE, floorRooms.length)} of {floorRooms.length}</span>
      <button type="button" disabled={roomPage >= maxPage} onClick={() => { setRoomPage(page => page + 1);setSelectedRoomId(null); }}>Next rooms</button>
    </div>}
    {!heatmap && <div className="building-experience__legend" aria-label="Occupancy legend"><small>{role==='owner' ? 'Room badges show assigned tenants / capacity. Green: empty · Amber: partially occupied · Coral: full · Muted coral: unavailable.' : 'Select a room to inspect the information available to your role.'}</small></div>}
    {heatmap && <div className="building-experience__legend" aria-label="Maintenance legend">
      <span><i className="is-pending" />Pending</span><span><i className="is-working" />In progress</span><span><i className="is-clear" />No open issues</span>
      <small>{affectedRooms ? `${affectedRooms} ${affectedRooms === 1 ? 'room has' : 'rooms have'} open issues. A numbered badge shows the count.` : 'No open maintenance issues in the available room records.'}</small>
    </div>}
  </div>;
}
