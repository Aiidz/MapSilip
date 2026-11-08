export function WorkspaceLoading() {
  return <section className="workspace-loading" role="status" aria-label="Loading page" aria-busy="true">
    <span className="sr-only">Loading page…</span>
    <div className="workspace-loading__title" aria-hidden="true" />
    <div className="workspace-loading__summary" aria-hidden="true">{[0, 1, 2, 3].map(key => <div key={key} />)}</div>
    <div className="workspace-loading__panel" aria-hidden="true" />
  </section>;
}
