type Row = Record<string, unknown>;

export async function fetchOperationRows(resource: string, signal?: AbortSignal): Promise<Row[]> {
  const rows: Row[] = [];
  for (let page = 1; ; page++) {
    const query = new URLSearchParams({ resource, page: String(page), pageSize: '100' });
    const response = await fetch(`/api/operations?${query}`, { signal });
    if (!response.ok) throw new Error('Records could not be loaded.');
    const result = await response.json();
    rows.push(...result.rows);
    if (rows.length >= result.count) return rows;
    if (!result.rows.length) throw new Error('Records changed while loading. Please refresh.');
  }
}

export function createLatestRequest() {
  let controller: AbortController | undefined;
  return {
    start() {
      controller?.abort();
      const current = controller = new AbortController();
      return { signal: current.signal, isCurrent: () => controller === current && !current.signal.aborted };
    },
    cancel() { controller?.abort(); },
  };
}
