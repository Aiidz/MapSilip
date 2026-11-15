'use client';

import { CloseIcon } from "./CloseIcon";

import { MapLoading } from './MapLoading';
import { ResponsiveOverlay } from './ResponsiveOverlay';

const mobileQuery = '(max-width: 899px)';
function subscribeViewport(callback: () => void) {
  const query = window.matchMedia(mobileQuery);
  query.addEventListener('change', callback);
  return () => query.removeEventListener('change', callback);
}
const mobileSnapshot = () => window.matchMedia(mobileQuery).matches;
const serverSnapshot = () => false;

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type PointerEvent } from 'react';
import { Icon } from './Icon';
import { DollhouseBuilding } from './DollhouseBuilding';
import { RoomVignette } from './IsometricBuilding';
import { groupRoomsByFloor, modelFloors, mapRoomSlots, roomSlotIndex, roomDisplayNumber, summarizeRoomIssues } from '../lib/building-map.mjs';
import { pinchView } from '../lib/map-gestures.mjs';
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
function svgPointFromClient(svg: SVGSVGElement, x: number, y: number) {
  const matrix = svg.getScreenCTM();
  if (!matrix) return null;
  try {
    const point = svg.createSVGPoint();
    point.x = x;
    point.y = y;
    const result = point.matrixTransform(matrix.inverse());
    return { x: result.x, y: result.y };
  } catch {
    return null;
  }
}

export function BuildingMapWorkspace({ role, mode = 'rooms', onOpenRoomRecord, onViewRequests, roomRecords, assignmentRecords, recordsLoading = false, onRecordsChanged, initialSelectedRoomId }: {
  role: Role;
  onViewRequests?: () => void;
  mode?: 'rooms' | 'maintenance';
  onOpenRoomRecord?: (room: BuildingRoom) => void;
  roomRecords?: BuildingRoom[];
  assignmentRecords?: Assignment[];
  recordsLoading?: boolean;
  onRecordsChanged?: () => Promise<void>;
  initialSelectedRoomId?: string | null;
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
  const appliedInitialRoomId = useRef<string | null>(null);
  const [selectedSlotIndex, setSelectedSlotIndex] = useState<number | null>(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const panFrame = useRef<number | null>(null);
  const pendingPan = useRef<{ x: number; y: number } | null>(null);
  const pendingZoom = useRef<number | null>(null);
  useEffect(() => () => { if (panFrame.current !== null) window.cancelAnimationFrame(panFrame.current); }, []);
  const svgDrag = useRef<{ pointerId: number; x: number; y: number; panX: number; panY: number; moved: boolean } | null>(null);
  const activePointers = useRef(new Map<number, { x: number; y: number }>());
  const pinchGesture = useRef<{ pointerIds: [number, number]; distance: number; zoom: number; anchor: { x: number; y: number } } | null>(null);
  const suppressMapClick = useRef(false);

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
      if (initialSelectedRoomId && appliedInitialRoomId.current !== initialSelectedRoomId) {
        const selectedRoom = roomRows.find(room => room.id === initialSelectedRoomId);
        if (selectedRoom) {
          appliedInitialRoomId.current = initialSelectedRoomId;
          setSelectedFloor(selectedRoom.floor_label);
          setSelectedRoomId(selectedRoom.id);
          setSelectedSlotIndex(null);
          setPan({ x: 0, y: 0 });
          setZoom(1);
        }
      }
      setError('');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Building data could not be loaded.');
    } finally { setLoading(false); }
  }, [role, hasRoomRecords, hasAssignmentRecords, initialSelectedRoomId]);
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
  const selectorFloors = displayFloors.filter(floor => floor.label !== '1st Floor');
  const currentFloor = floors.find(floor => floor.label === selectedFloor);
  const floorRooms = currentFloor?.rooms ?? [];
  const visibleRooms = floorRooms;
  const unmappedRooms = (selectedFloor ? [currentFloor].filter(Boolean) : floors).flatMap(floor => {
    if (!floor) return [];
    const mapped = ['2nd Floor', '3rd Floor'].includes(floor.label) ? mapRoomSlots(floor.rooms, floor.label) : [];
    return floor.rooms.filter(room => !mapped.includes(room));
  });
  const selectedRoom = rooms.find(room => room.id === selectedRoomId) ?? null;
  const selectedSceneIndex = selectedRoom ? roomSlotIndex(selectedRoom) : selectedSlotIndex ?? 0;
  const affectedRooms = [...issueMap.values()].filter(state => state.openCount > 0).length;
  const occupants = selectedRoom && role === 'owner'
    ? assignments.filter(row => row.room_id === selectedRoom.id && !row.ended_on).length : null;

  const isMobile = useSyncExternalStore(subscribeViewport, mobileSnapshot, serverSnapshot);
  const minZoom = isMobile ? 1.25 : 1;
  const mapZoom = Math.max(zoom, minZoom);

  function chooseFloor(label: string | null) {
    setSelectedFloor(label);
    setSelectedRoomId(null);
    setSelectedSlotIndex(null);
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
    setPan({ x: 0, y: 0 });
    setZoom(1);
  }
  function chooseRoomSpace(index: number) {
    setPan({ x: 0, y: 0 });
    setZoom(1);
    setSelectedRoomId(null);
    setSelectedSlotIndex(previous => previous === index ? null : index);
  }
  function reset() {
    chooseFloor(null);
    setMessage('');
  }
  function queueView(nextPan: { x: number; y: number }, nextZoom?: number) {
    pendingPan.current = nextPan;
    if (nextZoom !== undefined) pendingZoom.current = nextZoom;
    if (panFrame.current === null) panFrame.current = window.requestAnimationFrame(() => {
      panFrame.current = null;
      if (pendingPan.current) setPan(pendingPan.current);
      if (pendingZoom.current !== null) setZoom(pendingZoom.current);
      pendingPan.current = null;
      pendingZoom.current = null;
    });
  }
  function flushView() {
    if (panFrame.current !== null) window.cancelAnimationFrame(panFrame.current);
    panFrame.current = null;
    if (pendingPan.current) setPan(pendingPan.current);
    if (pendingZoom.current !== null) setZoom(pendingZoom.current);
    pendingPan.current = null;
    pendingZoom.current = null;
  }
  function pointerDown(event: PointerEvent<SVGSVGElement>) {
    const touch = event.pointerType === 'touch';
    if (!touch && (!event.isPrimary || event.button !== 0)) return;
    if (!activePointers.current.size) suppressMapClick.current = false;
    activePointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (touch && activePointers.current.size >= 2) {
      const pointerIds = [...activePointers.current.keys()].slice(0, 2) as [number, number];
      const first = activePointers.current.get(pointerIds[0])!;
      const second = activePointers.current.get(pointerIds[1])!;
      const midpoint = svgPointFromClient(event.currentTarget, (first.x + second.x) / 2, (first.y + second.y) / 2);
      const distance = Math.hypot(second.x - first.x, second.y - first.y);
      svgDrag.current = null;
      if (midpoint && distance > 0) {
        const center = { x: 495, y: 250 };
        pinchGesture.current = {
          pointerIds,
          distance,
          zoom: mapZoom,
          anchor: { x: center.x + (midpoint.x - pan.x - center.x) / mapZoom, y: center.y + (midpoint.y - pan.y - center.y) / mapZoom },
        };
        suppressMapClick.current = true;
        event.currentTarget.classList.add('is-panning');
        for (const pointerId of pointerIds) {
          try { event.currentTarget.setPointerCapture(pointerId); } catch { /* Pointer ended before capture; continue with the active gesture. */ }
        }
      }
      return;
    }
    pinchGesture.current = null;
    svgDrag.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, panX: pan.x, panY: pan.y, moved: false };
  }
  function pointerMove(event: PointerEvent<SVGSVGElement>) {
    if (event.pointerType === 'touch' && activePointers.current.has(event.pointerId)) {
      activePointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    }
    const pinch = pinchGesture.current;
    if (pinch) {
      const first = activePointers.current.get(pinch.pointerIds[0]);
      const second = activePointers.current.get(pinch.pointerIds[1]);
      if (!first || !second) return;
      const midpoint = svgPointFromClient(event.currentTarget, (first.x + second.x) / 2, (first.y + second.y) / 2);
      if (!midpoint) return;
      const next = pinchView({ startZoom: pinch.zoom, startDistance: pinch.distance, currentDistance: Math.hypot(second.x - first.x, second.y - first.y), minZoom, maxZoom: 4,
        anchor: pinch.anchor, currentPoint: midpoint, center: { x: 495, y: 250 } });
      const limit = event.currentTarget.viewBox.baseVal.width * next.zoom / 2;
      queueView({ x: Math.max(-limit, Math.min(limit, next.pan.x)), y: Math.max(-limit, Math.min(limit, next.pan.y)) }, next.zoom);
      return;
    }
    const drag = svgDrag.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    if (!drag.moved) {
      if (Math.hypot(event.clientX - drag.x, event.clientY - drag.y) < 6) return;
      drag.moved = true;
      suppressMapClick.current = true;
      event.currentTarget.setPointerCapture(event.pointerId);
      event.currentTarget.classList.add('is-panning');
    }
    const matrix = event.currentTarget.getScreenCTM();
    const factor = matrix ? 1 / matrix.a : 1;
    const limit = event.currentTarget.viewBox.baseVal.width * mapZoom / 2;
    queueView({ x: Math.max(-limit, Math.min(limit, drag.panX + (event.clientX - drag.x) * factor)),
      y: Math.max(-limit, Math.min(limit, drag.panY + (event.clientY - drag.y) * factor)) });
  }
  function pointerUp(event: PointerEvent<SVGSVGElement>) {
    activePointers.current.delete(event.pointerId);
    if (pinchGesture.current?.pointerIds.includes(event.pointerId)) {
      pinchGesture.current = null;
      svgDrag.current = null;
      flushView();
    } else if (svgDrag.current?.pointerId === event.pointerId) {
      svgDrag.current = null;
      flushView();
    }
    if (!activePointers.current.size || !pinchGesture.current) event.currentTarget.classList.remove('is-panning');
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  }

  const hasSelection = Boolean(selectedRoom) || selectedSlotIndex !== null;
  const closeDetails = useCallback(() => { setSelectedRoomId(null); setSelectedSlotIndex(null); }, []);
  useEffect(() => {
    if (!hasSelection || isMobile) return;
    const dismiss = (event: KeyboardEvent) => { if (event.key === 'Escape') closeDetails(); };
    window.addEventListener('keydown', dismiss);
    return () => window.removeEventListener('keydown', dismiss);
  }, [hasSelection, isMobile, closeDetails]);
  const details = (
      <aside className={`building-experience__sheet${selectedRoom || selectedSlotIndex !== null ? ' is-open' : ''}`} aria-label="Room information">
        <div className="building-experience__sheet-head"><div><span>{heatmap ? 'Maintenance Details' : 'Room Details'}</span><h3>{selectedRoom ? `Room ${selectedSceneIndex >= 0 ? roomDisplayNumber(selectedRoom.floor_label, selectedSceneIndex) : selectedRoom.room_number}` : selectedSlotIndex !== null ? `Room ${roomDisplayNumber(selectedFloor ?? '', selectedSlotIndex)}` : selectedFloor ?? 'Select a floor'}</h3></div>
          {(selectedRoom || selectedSlotIndex !== null) && <button type="button" aria-label="Close room details" onClick={closeDetails}><CloseIcon /></button>}</div>
        {selectedRoom ? <div className={`building-experience__sheet-body${!heatmap ? ' room-management-sheet' : ' maintenance-room-sheet'}`}>
          <RoomVignette index={selectedSceneIndex} floorLabel={selectedRoom.floor_label} />
          <dl className="building-experience__facts">
            <div><dt>Floor</dt><dd>{selectedRoom.floor_label}</dd></div>
            <div><dt>Capacity</dt><dd>{selectedRoom.capacity}</dd></div>
            <div><dt>Availability</dt><dd>{readable(selectedRoom.availability)}</dd></div>
            {occupants !== null && <div><dt>Assigned tenants</dt><dd>{occupants}</dd></div>}
          </dl>
          <RoomContextPanel key={selectedRoom.id} roomId={selectedRoom.id} displayRoomNumber={selectedSceneIndex >= 0 ? String(roomDisplayNumber(selectedRoom.floor_label, selectedSceneIndex)) : undefined} role={role} onChanged={async () => { await Promise.all([load(), onRecordsChanged?.()]); }} presentation={heatmap ? 'maintenance' : 'management'} onViewRequests={onViewRequests} />
          {role === 'owner' && onOpenRoomRecord && <button className="button button--secondary building-experience__record" type="button" onClick={() => onOpenRoomRecord(selectedRoom)}>Open in room list</button>}
        </div> : selectedSlotIndex !== null ? <div className="building-experience__sheet-empty"><RoomVignette index={selectedSlotIndex} floorLabel={selectedFloor ?? '2nd Floor'} /><strong>Room {roomDisplayNumber(selectedFloor ?? '', selectedSlotIndex)} · {selectedFloor}</strong>
          <p>No unique room record is linked to this position.</p>

        </div> : <div className="building-experience__sheet-empty"><Icon name="building" /><strong>{rooms.length ? 'Choose a numbered room' : 'No room records yet'}</strong>
          <p>Choose a floor and room to explore the building.</p></div>}
      </aside>
  );

  return <div className="building-experience">
    <div className="building-experience__top">
      <div><h2>{heatmap ? 'Maintenance activity' : 'Building View'}</h2><p>{heatmap ? 'Select a floor and room to inspect repair requests.' : 'Select a floor and room to explore the building.'}</p></div>

    </div>
    <div className="building-experience__floors" role="group" aria-label="Select floor">
      <button type="button" aria-pressed={selectedFloor === null} className={selectedFloor === null ? 'is-active' : ''} onClick={() => chooseFloor(null)}>All levels</button>
      {selectorFloors.map(floor => <button type="button" key={floor.label} aria-pressed={selectedFloor === floor.label}
        className={selectedFloor === floor.label ? 'is-active' : ''} onClick={() => chooseFloor(floor.label)}>{floor.label}</button>)}
      <button className="building-experience__reset" type="button" onClick={reset} title="Reset building view">Reset view</button>
    </div>
    {error && <p role="alert" className="building-experience__notice">{error} <button type="button" onClick={() => void load()}>Retry</button></p>}
    {message && <p role="status" className="building-experience__notice">{message}</p>}
    <div className={`building-experience__layout building-experience__layout--selectable${hasSelection && !isMobile ? ' has-details' : ''}`}>
      <div className="building-experience__stage" onClickCapture={event => {
        if (event.detail > 0 && suppressMapClick.current) {
          event.preventDefault(); event.stopPropagation(); suppressMapClick.current = false;
        }
      }}>
        {loading || recordsLoading ? <MapLoading label="Loading building records…" /> : <>
          <DollhouseBuilding floors={displayFloors} selectedFloor={selectedFloor} visibleRooms={visibleRooms} issues={issueMap}
            selectedRoomId={selectedRoomId} selectedSlotIndex={selectedSlotIndex} heatmap={heatmap} zoom={mapZoom} pan={pan}
            roofVisible={true} occupancy={occupancy} onSelectFloor={chooseFloor} onSelectRoom={chooseRoom} onSelectRoomSpace={chooseRoomSpace}
            onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={pointerUp} />
          {!isMobile && <div className="building-experience__zoom" aria-label="Map zoom controls">
            <button type="button" aria-label="Zoom out" disabled={mapZoom <= 1} onClick={() => setZoom(value => Math.max(1, value - .25))}>−</button>
            <span aria-live="polite">{Math.round(mapZoom * 100)}%</span>
            <button type="button" aria-label="Zoom in" disabled={mapZoom >= 4} onClick={() => setZoom(value => Math.min(4, value + .25))}>+</button>
          </div>}
          {selectedFloor && <button className="building-experience__return" type="button" onClick={() => chooseFloor(null)}>← Building view</button>}
        </>}
      </div>
      {hasSelection && !isMobile && details}
      <ResponsiveOverlay open={hasSelection && isMobile} onClose={closeDetails} title={heatmap ? 'Maintenance Details' : 'Room Details'} className="building-details-popup">
        {hasSelection && isMobile && details}
      </ResponsiveOverlay>
    </div>
    {unmappedRooms.length > 0 && <div className="building-experience__unmapped">
      <p>Room records awaiting a confirmed map position</p>
      <div>{unmappedRooms.map(room => <button type="button" key={room.id} className="button button--secondary" onClick={() => chooseRoom(room)}>
        {room.floor_label} · Room {room.room_number}
      </button>)}</div>
    </div>}
    {!heatmap && <div className="building-experience__legend" aria-label="Occupancy legend"><small>{role==='owner' ? 'Room badges show assigned tenants / capacity. Green: empty · Amber: partially occupied · Coral: full · Muted coral: unavailable.' : 'Select a room to inspect the information available to your role.'}</small></div>}
    {heatmap && <div className="building-experience__legend" aria-label="Maintenance legend">
      <span><i className="is-pending" />Pending</span><span><i className="is-working" />In progress</span><span><i className="is-clear" />No open issues</span>
      <small>{affectedRooms ? `${affectedRooms} ${affectedRooms === 1 ? 'room has' : 'rooms have'} open issues. A numbered badge shows the count.` : 'No open maintenance issues in the available room records.'}</small>
    </div>}
  </div>;
}
