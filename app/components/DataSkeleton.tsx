/** Layout placeholders only: no requests, timers or client state. */
export function DataSkeleton({ label = 'Loading records', variant = 'list', count = 3 }: {
  label?: string; variant?: 'list' | 'table' | 'details' | 'chart'; count?: number;
}) {
  return <div className={`data-skeleton data-skeleton--${variant}`} role="status" aria-label={label} aria-busy="true">
    <span className="sr-only">{label}</span>
    <div className="data-skeleton__visual" aria-hidden="true">
      {variant === 'chart' ? <div className="data-skeleton__chart">{[0,1,2,3,4,5,6].map(key => <span className="data-skeleton__shape" key={key} />)}</div>
        : Array.from({ length: count }, (_, key) => <div className="data-skeleton__row" key={key}>
          {variant === 'list' && <span className="data-skeleton__shape data-skeleton__avatar" />}
          <div className="data-skeleton__lines"><span className="data-skeleton__shape data-skeleton__title" /><span className="data-skeleton__shape data-skeleton__line" /></div>
          {variant !== 'details' && <span className="data-skeleton__shape data-skeleton__badge" />}
        </div>)}
    </div>
  </div>;
}
