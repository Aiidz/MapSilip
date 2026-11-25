'use client';

import Link from 'next/link';
import { useState } from 'react';
import { ResponsiveOverlay } from './ResponsiveOverlay';
import { Icon } from './Icon';

export type MetricRecord = { id: string; cells: string[]; href: string; status?: string };
export type Metric = { title: string; value: string | number; note: string; columns: string[]; records: MetricRecord[]; breakdown?: { initialTitle: string; metrics: Metric[] } };

export function MetricDetails({ metrics, label }: { metrics: Metric[]; label: string }) {
  const [title, setTitle] = useState('');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [category, setCategory] = useState('');
  const selected = metrics.find(item => item.title === title);
  const breakdown = selected?.breakdown;
  const metric = breakdown?.metrics.find(item => item.title === (category || breakdown.initialTitle)) ?? selected;

  function resetFilters() {
    setSearch('');
    setStatus('');
  }
  const statuses = Array.from(new Set(metric?.records.map(row => row.status).filter(Boolean)));
  const rows = metric?.records.filter(row => (!status || row.status === status) &&
    row.cells.join(' ').toLowerCase().includes(search.trim().toLowerCase())) ?? [];
  return <>
    <section className="dashboard-summary metric-grid" aria-label={label}>{metrics.map((item, index) =>
      <button key={item.title} type="button" aria-haspopup="dialog"
        className={'dashboard-summary__item' + (index === 0 ? ' dashboard-summary__item--financial' : '')}
        onClick={() => { resetFilters(); setCategory(''); setTitle(item.title); }}>
        <strong>{item.title}</strong><span className="dashboard-summary__value">{item.value}</span>
        <small>{item.note}</small><span className="dashboard-summary__mark" aria-hidden="true"><Icon name="arrow" /></span>
      </button>)}</section>
    <ResponsiveOverlay className="dashboard-record-drawer" description={selected?.note} open={!!metric} title={title} variant="drawer" onClose={() => setTitle('')}>
      {metric && <div className="metric-records">
        {breakdown && <div className="metric-breakdown" role="group" aria-label="Contract categories">
          {breakdown.metrics.map(item => <button key={item.title} type="button" aria-pressed={metric.title === item.title}
            onClick={() => { resetFilters(); setCategory(item.title); }}>
            <span>{item.title}</span><strong>{item.value}</strong>
          </button>)}
        </div>}
        {metric.records.length > 0 && <div className="metric-tools">
          <label><Icon name="search" /><input type="search" aria-label="Search records" placeholder="Search records…" value={search} onChange={e => setSearch(e.target.value)} /></label>
          {statuses.length > 1 && <select aria-label="Filter by status" value={status} onChange={e => setStatus(e.target.value)}>
            <option value="">All statuses</option>{statuses.map(value => <option key={value}>{value}</option>)}</select>}
        </div>}
        {rows.length > 0 ? <>
          <small className="metric-count" role="status">{rows.length} {rows.length === 1 ? 'record' : 'records'}</small>
          <ul className="metric-list">{rows.map(row => <li key={row.id}>
            <Link href={row.href}><strong>{row.cells[0]}</strong><Icon name="arrow" /></Link>
            <dl>{row.cells.slice(1).map((value,index) => {
              const label = metric.columns[index + 1];
              return <div key={label} className={label === 'Description' ? 'metric-description' : undefined}>
                <dt>{label}</dt><dd>{label === 'Status' ? <span className="metric-status">{value}</span> : value}</dd>
              </div>;
            })}</dl>
          </li>)}</ul>
        </> : <div className="metric-empty"><Icon name={metric.records.length ? 'search' : 'fileSearch'} />
          <p>{metric.records.length ? 'No matching records.' : metric.value === '—' ? metric.note : 'No records for this metric.'}</p>
          {metric.records.length > 0 && <button type="button" onClick={() => { setSearch(''); setStatus(''); }}>Clear filters</button>}
        </div>}
      </div>}
    </ResponsiveOverlay>
  </>;
}
