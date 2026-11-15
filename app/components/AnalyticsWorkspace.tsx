'use client';

import { DataSkeleton } from './DataSkeleton';

import { useEffect, useState } from 'react';
import { Icon } from './Icon';
import { PageHeader } from './ui';

type RecordRow = { created_at: string; category?: string; room_id?: string; ended_on?: string | null; started_on?: string | null; contract_end_on?: string | null; contract_attachment_id?: string | null };
async function loadRecords(resource: string): Promise<RecordRow[]> {
  const rows: RecordRow[] = [];
  for (let page = 1; ; page++) {
    const response = await fetch(`/api/operations?resource=${resource}&page=${page}&pageSize=100`);
    if (!response.ok) throw new Error('Analytics could not be loaded.');
    const result = await response.json();
    rows.push(...result.rows);
    if (rows.length >= result.count || !result.rows.length) return rows;
  }
}
function categories(rows: RecordRow[], tone: string): [string, number][] {
  const groups = tone === 'repair'
    ? [['Water Supply', /water|plumb/i], ['Furniture & Fixtures', /furniture|fixture/i], ['Electrical', /electrical|hvac|air|ac\//i], ['Structural', /structur|lock/i], ['Other Repairs', /./]] as const
    : [['Roommate & Visitor Concerns', /roommate|visitor/i], ['Cleanliness & Sanitation', /clean|sanit/i], ['Rules & Regulations', /rule|regulat/i], ['Safety & Privacy', /safe|privacy|secur/i], ['Suggestions & Other', /./]] as const;
  const counts = groups.map(() => 0);
  rows.forEach(row => { const index = groups.findIndex(([, pattern]) => pattern.test(row.category ?? '')); counts[index < 0 ? groups.length - 1 : index]++; });
  return groups.map(([label], index) => [label, counts[index]]);
}
export function AnalyticsWorkspace() {
  const [records, setRecords] = useState<{ maintenance: RecordRow[]; concerns: RecordRow[] } | null>(null);
  const [contracts, setContracts] = useState<RecordRow[] | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    Promise.all([loadRecords('maintenance'), loadRecords('concerns'), loadRecords('assignments')]).then(([maintenance, concerns, assignments]) => {
      if (active) { setRecords({ maintenance, concerns }); setContracts(assignments); }
    }).catch(() => { if (active) setError('Analytics could not be loaded. Refresh to try again.'); });
    return () => { active = false; };
  }, []);
  const year = new Date().getFullYear();
  const monthly = Array.from({ length: 12 }, (_, month) => ({
    label: new Date(year, month, 1).toLocaleDateString(undefined, { month: 'short' }),
    count: records?.maintenance.filter(row => { const date = new Date(row.created_at); return date.getFullYear() === year && date.getMonth() === month; }).length || 0,
  }));
  const max = Math.max(10, Math.ceil(Math.max(0, ...monthly.map(month => month.count)) / 10) * 10);
  const recurring = new Map<string, number>();
  records?.maintenance.forEach(row => { if (row.room_id) { const key = `${row.room_id}:${row.category}`; recurring.set(key, (recurring.get(key) || 0) + 1); } });
  const cards = [
    ['Total Requests', records ? records.maintenance.length : '—', 'All recorded requests'],
    ['Avg Response Time', '—', 'Response timing not tracked'],
    ['Avg Resolution Time', '—', 'Resolution timing not tracked'],
    ['Recurring Issues', records ? [...recurring.values()].filter(count => count > 1).length : '—', 'Repeated room and category'],
  ];
  const now = new Date();
  const deadline = new Date(now); deadline.setDate(deadline.getDate() + 30);
  const activeContracts = contracts?.filter(row => !row.ended_on) ?? [];
  const expiringSoon = activeContracts.filter(row => row.contract_end_on && new Date(`${row.contract_end_on}T00:00:00`) >= new Date(now.toDateString()) && new Date(`${row.contract_end_on}T00:00:00`) <= deadline).length;
  const newContracts = activeContracts.filter(row => row.started_on && Date.now() - new Date(row.started_on).getTime() <= 30 * 86400000).length;
  function exportReport() {
    if (!records) return;
    const csv = ['Month,Requests', ...monthly.map(month => `${month.label} ${year},${month.count}`)].join('\r\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a'); link.href = url; link.download = `maintenance-report-${year}.csv`; link.click(); URL.revokeObjectURL(url);
  }
  return <div className="analytics-workspace management-dashboard">
    <PageHeader title="Analytics" description="Performance metrics, repair turnaround, and maintenance history." action={<button className="dashboard-export" type="button" disabled={!records} onClick={exportReport}><Icon name="download" />Export Report</button>} />
    {error && <p role="alert">{error}</p>}
    <section className="dashboard-summary" aria-label="Maintenance metrics">{cards.map(([label, value, note], index) => <article className={`dashboard-summary__item${index === 0 ? ' dashboard-summary__item--financial' : ''}`} key={label}><h2>{label}</h2><span className="dashboard-summary__value">{value}</span><p>{note}</p><span className="dashboard-summary__mark" aria-hidden="true"><Icon name="arrow" /></span></article>)}</section>
    <div className="analytics-top">
      <section className="dashboard-panel analytics-monthly"><h2>Maintenance Requests Over Time</h2>{!records && !error ? <DataSkeleton label="Loading monthly chart" variant="chart" /> : <div className="analytics-months" role="group" aria-label={`Monthly maintenance requests for ${year}`}>{monthly.map(month => <div key={month.label}><span className="analytics-month-track"><span style={{ height: `${month.count / max * 100}%` }} /></span><span>{month.label}</span><small className="sr-only">{records ? month.count : '—'} requests</small></div>)}</div>}<p>Monthly requests over 12 months · {year}</p></section>
      <section className="dashboard-panel analytics-contracts"><h2>Contract Overview</h2>{contracts === null && !error ? <DataSkeleton label="Loading contract overview" variant="details" count={3} /> : <><div>{[['Active Contracts', activeContracts.length], ['Expiring Soon', expiringSoon], ['With contract file', activeContracts.filter(row => row.contract_attachment_id).length], ['New · 30 days', newContracts]].map(([label, value], index) => <article key={label}><h3><span className={`analytics-contract-dot analytics-contract-dot--${index}`} />{label}</h3><strong>{value}</strong></article>)}</div><p>Expiring within 30 days · Active assignments with uploaded contract files</p></>}</section>
    </div>
    <div className="analytics-bottom">{[{ title: 'Common Repair Issues', rows: records?.maintenance, tone: 'repair' }, { title: 'Common Tenant Concerns', rows: records?.concerns, tone: 'concern' }].map(group => { const values = categories(group.rows || [], group.tone); const largest = Math.max(1, ...values.map(([, count]) => count)); return <section className={`dashboard-panel analytics-categories analytics-categories--${group.tone}`} key={group.title}><h2>{group.title}</h2>{!records && !error ? <DataSkeleton label="Loading analytics" variant="details" count={3} /> : values.length ? values.map(([label, count]) => <div className="analytics-category" key={label}><div><span>{label.replaceAll('_', ' ')}</span><span>{records ? count : '—'}</span></div><div className="analytics-category-track"><span style={{ width: `${count / largest * 100}%` }} /></div></div>) : <p>{records ? 'No records to display.' : 'Loading analytics…'}</p>}</section>; })}</div>
  </div>;
}
