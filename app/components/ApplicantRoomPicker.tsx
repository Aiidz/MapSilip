'use client';

import { useEffect, useState } from 'react';
import { FloorPlate } from './IsometricBuilding';
import type { ReviewRoom } from '../lib/access-review.mjs';
export type ApplicantRoom = Omit<ReviewRoom, 'availability'> & { availability: 'available' | 'reserved' | 'maintenance'; vacancies: number };
export function ApplicantRoomPicker({ gender, selected, onSelect, reload }: { gender: string; selected: string; onSelect: (id: string) => void; reload: number }) {
  const [rooms, setRooms] = useState<ApplicantRoom[]>([]);
  const [floor, setFloor] = useState('2nd Floor');
  const [inspected, setInspected] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      setLoading(true); setError('');
      try {
        const response = await fetch('/api/account-requests/rooms', { signal: controller.signal, cache: 'no-store' });
        const result = await response.json();
        if (!response.ok || !Array.isArray(result.rooms)) throw new Error(result.message || 'Rooms could not be loaded.');
        if (!controller.signal.aborted) setRooms(result.rooms);
      } catch (caught) { if (!controller.signal.aborted) setError(caught instanceof Error ? caught.message : 'Rooms could not be loaded.'); }
      finally { if (!controller.signal.aborted) setLoading(false); }
    }
    void load(); return () => controller.abort();
  }, [retry, reload]);
  function reason(room: ApplicantRoom) {
    return room.availability !== 'available' ? 'Currently unavailable' : room.vacancies < 1 ? 'Full' : room.gender_policy !== 'any' && room.gender_policy !== gender ? room.gender_policy === 'male' ? 'Boys only' : 'Girls only' : '';
  }
  const current = rooms.find(room => room.id === inspected);
  const floorRooms = rooms.filter(room => room.floor_label === floor);
  return <section className="applicant-picker" aria-label="Room preference" aria-busy={loading}>
    <div className="applicant-picker__floors" role="group" aria-label="Floor">{['2nd Floor', '3rd Floor'].map(label => <button type="button" key={label} aria-pressed={floor === label} onClick={() => { setFloor(label); setInspected(''); }}>{label}</button>)}</div>
    {selected && <p className="applicant-picker__hint" role="status">Preferred room: Room {rooms.find(room => room.id === selected)?.room_number}</p>}
    {loading ? <p role="status">Loading rooms…</p> : error ? <p role="alert">{error} <button type="button" onClick={() => setRetry(value => value + 1)}>Retry</button></p> : <>
      <p className="applicant-picker__map-hint">Swipe the map to explore rooms.</p>
      <div className={`applicant-picker__workspace${current ? " applicant-picker__workspace--selected" : ""}`}>
      <div className="applicant-picker__map">
        <svg key={floor} className="isometric-building dorm-building" viewBox="-35 -15 1060 490" aria-label={`${floor} floor plan`}>
          <FloorPlate rooms={floorRooms} floorLabel={floor} issues={new Map()} selectedRoomId={inspected || null} selectedSlotIndex={null} heatmap={false} onSelectRoom={room => setInspected(room.id)} roof={false} />
        </svg>
      </div>
      {current ? <div key={current.id} className="applicant-picker__info"><h3>Room {current.room_number}</h3><dl><div><dt>Monthly rent / tenant</dt><dd>{current.monthly_rent == null ? 'Not set' : `₱${Number(current.monthly_rent).toLocaleString('en-PH')}`}</dd></div><div><dt>Available spaces</dt><dd>{current.vacancies} / {current.capacity}</dd></div><div><dt>Room policy</dt><dd>{current.gender_policy === 'male' ? 'Boys only' : current.gender_policy === 'female' ? 'Girls only' : 'Unrestricted'}</dd></div></dl>{reason(current) ? <p>{reason(current)}</p> : <button type="button" className="button button--secondary" onClick={() => onSelect(current.id)}>{selected === current.id ? 'Preferred room selected' : 'Prefer this room'}</button>}</div> : null}
      </div>
      {!floorRooms.length && <p>No rooms available on this floor.</p>}
    </>}
  </section>;
}
