export function deliveryOutcome(status: number, attempt: number, retryAfter = 0): { kind: 'accepted' | 'gone' | 'invalid_subscription' | 'retry' | 'failed' | 'discarded'; delaySeconds: number } {
  if (status >= 200 && status < 300) return { kind: 'accepted', delaySeconds: 0 };
  if ([404, 410].includes(status)) return { kind: 'gone', delaySeconds: 0 };
  if ([401, 403].includes(status)) return { kind: 'invalid_subscription', delaySeconds: 0 };
  if (status === 0 || status === 429 || status >= 500) {
    if (attempt >= 5) return { kind: 'failed', delaySeconds: 0 };
    return { kind: 'retry', delaySeconds: Math.min(3600, Math.max([30, 120, 600, 1800][Math.max(0, attempt - 1)] ?? 1800, retryAfter)) };
  }
  return { kind: 'discarded', delaySeconds: 0 };
}

export function recipientAuthEnabled(role: string, gates: { staff: boolean; tenant: boolean }) {
  return role === 'tenant' ? gates.tenant : ['owner', 'caretaker'].includes(role) && gates.staff;
}
