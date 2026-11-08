const noticeId = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export function noticeContinuation(value: unknown) {
  return typeof value === 'string' && noticeId.test(value) ? `/notifications/open?id=${value}` : null;
}
const allowed: Record<'owner' | 'caretaker' | 'tenant', readonly string[]> = {
  owner: ['/management', '/management/tenants', '/management/rooms', '/management/maintenance', '/management/payments', '/management/visitors', '/management/concerns', '/management/notifications'],
  caretaker: ['/caretaker', '/caretaker/maintenance', '/caretaker/notifications'],
  tenant: ['/tenant', '/tenant/details', '/tenant/maintenance', '/tenant/payments', '/tenant/visitors', '/tenant/concerns', '/tenant/notifications'],
};
export function safeNoticeDestination(value: unknown, role: keyof typeof allowed) {
  return typeof value === 'string' && allowed[role].includes(value) ? value : null;
}
