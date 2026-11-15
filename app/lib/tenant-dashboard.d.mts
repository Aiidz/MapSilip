export function tenantDashboardDetails<T extends Record<string, unknown>>(
  summary: T,
  assignment: { roomNumber?: string | null; monthlyRent?: number | string | null },
): T & { room: string | null; monthly_rent: number | string | null };

export function formatTenantMonthlyRent(amount: number | string | null | undefined): string;
