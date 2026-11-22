type Category = { category?: unknown };

function CategoryRanking({ title, records }: { title: string; records: Category[] }) {
  const counts = new Map<string, number>();
  for (const row of records) {
    const label = String(row.category ?? '').trim() || 'Uncategorized';
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }
  const top = [...counts].sort(([a,x],[b,y]) => y - x || a.localeCompare(b)).slice(0,3);
  return <div className="category-ranking"><h3>{title}</h3>
    {top.length ? <ol>{top.map(([name,count]) => <li key={name}>
      <span>{name}</span><strong>{count}</strong>
      <div aria-hidden="true"><i style={{ width: 100 * count / records.length + '%' }} /></div>
    </li>)}</ol> : <p>No reports yet.</p>}
  </div>;
}

export function DashboardBreakdown({ paid, overdue, total, repairs, concerns }: {
  paid: number; overdue: number; total: number; repairs: Category[]; concerns: Category[];
}) {
  const parts = [
    { label: 'Paid', count: paid, color: 'var(--status-success)' },
    { label: 'Not yet due', count: total - overdue - paid, color: 'var(--status-info)' },
    { label: 'Overdue', count: overdue, color: 'var(--brand)' },
  ];
  const paidEnd = total ? 100 * paid / total : 0;
  const unpaidEnd = total ? 100 * (total - overdue) / total : 0;
  return <div className="dorm-breakdowns">
    <section className="dorm-report"><h2>Payment overview</h2>
      <div className="invoice-breakdown"><div aria-hidden="true" className="invoice-ring" style={{ background: total
        ? `conic-gradient(${parts[0].color} 0 ${paidEnd}%, ${parts[1].color} ${paidEnd}% ${unpaidEnd}%, ${parts[2].color} ${unpaidEnd}% 100%)`
        : 'var(--border)' }}><div><strong>{total}</strong><small>Invoices</small></div></div>
        <dl>{parts.map(part => <div key={part.label}><dt><i style={{background:part.color}} />{part.label}</dt><dd>{part.count}</dd></div>)}</dl>
      </div>
    </section>
    <section className="dorm-report"><h2>Most reported issues</h2><div className="issue-rankings">
      <CategoryRanking title="Maintenance" records={repairs} /><CategoryRanking title="Tenant concerns" records={concerns} />
    </div></section>
  </div>;
}
