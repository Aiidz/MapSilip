export function OwnerDashboardLoading() {
  return <div className="owner-insights owner-loading" role="status" aria-label="Loading dashboard" aria-busy="true">
    <div className="dashboard-summary metric-grid" aria-hidden="true">{[0,1,2,3].map(i =>
      <div key={i} className="dashboard-summary__item"><i /><b /><i /></div>)}</div>
    <div className="dorm-overview-lead" aria-hidden="true">
      <div className="dorm-collections"><i /><b /><div className="owner-loading-chart" /></div>
      <div className="dorm-rooms"><i /><b /><div className="owner-loading-rooms">{Array.from({length:18},(_,i) => <i key={i} />)}</div></div>
    </div>
    <div className="dorm-overview-lower" aria-hidden="true">
      <div className="dorm-feed"><i /><b /><i /></div>
      <div className="dashboard-panel dashboard-actions"><i /><b /><i /></div>
    </div>
    <div className="dorm-breakdowns" aria-hidden="true"><div className="dorm-report"><i /><b /></div><div className="dorm-report"><i /><b /></div></div>
  </div>;
}
