import Link from 'next/link';
import { Icon } from './Icon';

type Row = Record<string, unknown>;
const monthLabel = new Intl.DateTimeFormat('en-PH', { month: 'short', timeZone: 'UTC' });
const localMonth = new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', timeZone: 'Asia/Manila' });
const currency = new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP', maximumFractionDigits: 2, minimumFractionDigits: 0 });

export function DormOverview({ today, payments, invoices, rooms, roomCounts, repairs, tenantNames, children }: {
  today: string; payments: Row[]; invoices: Map<unknown, Row>; rooms: Row[]; roomCounts: Map<string, number>;
  repairs: Row[]; tenantNames: Map<unknown, string>; children: React.ReactNode;
}) {
  const start = new Date(today.slice(0,7) + '-01T00:00:00Z');
  const months = Array.from({ length: 6 }, (_, i) => {
    const date = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + i - 5, 1));
    return { key: date.toISOString().slice(0,7), label: monthLabel.format(date), cents: 0 };
  });
  for (const payment of payments) {
    if (payment.status !== 'approved' || invoices.get(payment.invoice_id)?.currency !== 'PHP') continue;
    const date = new Date(String(payment.reviewed_at ?? payment.created_at));
    if (!Number.isFinite(date.getTime())) continue;
    const month = months.find(item => item.key === localMonth.format(date));
    if (month) month.cents += Math.round(Number(payment.amount) * 100);
  }
  const peak = Math.max(0, ...months.map(m => m.cents));
  const sortedRooms = [...rooms].sort((a,b) => String(a.room_number).localeCompare(String(b.room_number), undefined, { numeric: true }));
  const occupied = rooms.filter(room => roomCounts.has(String(room.id))).length;
  const activity = [
    ...payments.map(row => ({ id: 'pay-' + row.id, date: String(row.created_at), title: 'Payment submitted', detail: tenantNames.get(row.tenant_id) ?? 'Tenant', href: '/management/payments?search=' + encodeURIComponent(String(row.reference_number ?? '')), icon: 'wallet' as const })),
    ...repairs.map(row => ({ id: 'repair-' + row.id, date: String(row.created_at), title: String(row.category ?? 'Maintenance request'), detail: tenantNames.get(row.tenant_id) ?? 'Maintenance request', href: '/management/maintenance?roomId=' + encodeURIComponent(String(row.room_id)), icon: 'wrench' as const })),
  ].filter(row => Number.isFinite(Date.parse(row.date))).sort((a,b) => Date.parse(b.date) - Date.parse(a.date)).slice(0,5);
  return <>
    <div className="dorm-overview-lead">
      <section className="dorm-collections">
        <header><h2>Rent collections</h2><Link href="/management/payments" aria-label="Open payment records"><Icon name="arrow" /></Link></header>
        <strong className="dorm-total">{currency.format(months[5].cents / 100)}</strong>
        <p>Verified this month</p>
        {peak > 0 ? <div className="dorm-bars" aria-label="Monthly verified collections in Philippine pesos">
          {months.map(month => <div key={month.key}><small>{currency.format(month.cents / 100)}</small>
            <div className="dorm-bar-track"><i style={{ height: (100 * month.cents / peak) + '%' }} /></div><span>{month.label}</span></div>)}
        </div> : <p className="dorm-collections-empty">No verified peso payments in the past six months.</p>}
      </section>
      <section className="dorm-rooms">
        <header><h2>Room occupancy</h2><Link href="/management/rooms" aria-label="Open building view"><Icon name="arrow" /></Link></header>
        <p className="dorm-room-total"><strong>{occupied}</strong> of {rooms.length} rooms occupied</p>
        <div className="dorm-room-grid">{sortedRooms.map(room => {
          const count = roomCounts.get(String(room.id)) ?? 0;
          return <span key={String(room.id)} data-occupied={count > 0} title={'Room ' + room.room_number + ' · ' + count + ' assigned'} aria-label={'Room ' + room.room_number + ', ' + count + ' assigned'}>{String(room.room_number)}</span>;
        })}</div>
        {rooms.length > 0 ? <div className="dorm-key"><span>Occupied</span><span>Unoccupied</span></div> : <p>No rooms recorded yet.</p>}
      </section>
    </div>
    <div className="dorm-overview-lower">
      <section className="dorm-feed"><header><h2>Recent activity</h2></header>
        {activity.length ? <ul>{activity.map(item => <li key={item.id}><Link href={item.href}><Icon name={item.icon} /><span><strong>{item.title}</strong><small>{item.detail}</small></span><time dateTime={item.date}>{new Date(item.date).toLocaleDateString('en-PH',{month:'short',day:'numeric',timeZone:'Asia/Manila'})}</time></Link></li>)}</ul> : <p>No payments or repair requests yet.</p>}
      </section>
      {children}
    </div>
  </>;
}
