type Report = {
  columns: string[];
  period: string;
  generated: string;
  money?: string[];
  summary?: string;
  widths?: Record<string, number>;
  metrics?: { label: string; value: string | number; money?: boolean }[];
  emphasizeMetrics?: boolean;
};
export function buildWorkbook(name: string, rows: Record<string, unknown>[], report?: Report): Uint8Array<ArrayBuffer>;
export function buildWorkbooks(sheets: { name: string; rows: Record<string, unknown>[]; report?: Report }[]): Uint8Array<ArrayBuffer>;
