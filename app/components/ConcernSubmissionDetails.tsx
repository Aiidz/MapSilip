import { Icon } from './Icon';

const label = (value: unknown) => value == null || value === '' ? 'Not provided' : String(value).replaceAll('_', ' ');
function date(value: unknown) {
  const parsed = new Date(String(value ?? ''));
  return Number.isNaN(parsed.getTime()) ? 'Not available' : new Intl.DateTimeFormat('en-PH', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Manila' }).format(parsed);
}
export function ConcernSubmissionDetails({ record }: { record: Record<string, unknown> }) {
  const status = String(record.status ?? 'pending');
  const extras = Object.entries(record).filter(([key]) => !['id', 'tenant_id', 'request_key', 'invoice_id', 'room_id', 'category', 'status', 'description', 'staff_response', 'owner_response', 'created_at', 'updated_at', 'attachment_id'].includes(key));
  return <div className="maintenance-request-detail">
    <div className="maintenance-request-detail__summary">
      <span className="maintenance-request-detail__icon"><Icon name="sparkles" /></span>
      <div><span className="maintenance-request-detail__eyebrow">Category</span><h3>{label(record.category)}</h3></div>
      <span className={'maintenance-request-detail__status maintenance-request-detail__status--' + status}>{label(status).replace(/\b\w/g, letter => letter.toUpperCase())}</span>
    </div>
    <dl className="maintenance-request-detail__dates">
      <div><dt>Submitted</dt><dd>{date(record.created_at)}</dd></div>
      <div><dt>Last updated</dt><dd>{date(record.updated_at)}</dd></div>
    </dl>
    <section><h3>Description</h3><p>{String(record.description || 'No description provided.')}</p></section>
    {Boolean(record.attachment_id) && <section><h3>Attachment</h3><a className="button button--secondary" href={`/api/attachments?id=${encodeURIComponent(String(record.attachment_id))}`}><Icon name="fileSearch" />Download attachment</a></section>}
    <section className="maintenance-request-detail__response"><h3>Staff response</h3><p>{String(record.owner_response || record.staff_response || 'No response yet. Updates from the dormitory team will appear here.')}</p></section>
    {extras.length > 0 && <dl className="maintenance-request-detail__dates">{extras.map(([key, value]) => <div key={key}><dt>{label(key)}</dt><dd>{label(value)}</dd></div>)}</dl>}
  </div>;
}
