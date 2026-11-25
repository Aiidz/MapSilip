type NotificationDestination = { href: string; event_key?: string | null };
type NotificationArea = 'management' | 'caretaker' | 'tenant';

export function notificationDestination(notice: NotificationDestination, area: NotificationArea) {
  const concern = /^concern:([0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}):/i.exec(notice.event_key ?? '');
  return concern && (area === 'tenant' || area === 'management')
    ? `/${area}/concerns?recordId=${encodeURIComponent(concern[1])}`
    : notice.href;
}
