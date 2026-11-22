export function csv(headers, rows) {
  function cell(value) {
    const text = value instanceof Date ? value.toISOString() : String(value ?? '');
    const safe = typeof value === 'string' && /^[\s\p{Cc}]*[=+@-]/u.test(text) ? "'" + text : text;
    return /[",\r\n]/.test(safe) ? '"' + safe.replaceAll('"', '""') + '"' : safe;
  }

  return '\ufeff' + [headers, ...rows].map(row => row.map(cell).join(',')).join('\r\n') + '\r\n';
}

const extensions = { 'application/pdf': 'pdf', 'image/png': 'png', 'image/jpeg': 'jpg' };
const entry = (path, text) => ({ path, bytes: Buffer.from(text) });

async function* originalEntries(file) {
  if (file.bytes instanceof Uint8Array) yield file;
  else yield* file.bytes;
}

/** Project the invoice, payment, and maintenance navigation views of a frozen snapshot. */
export async function* readableEntries(snapshot, readOriginal, tenantArchiveIds = new Map()) {
  const attachments = new Map(snapshot.attachments.map(row => [row.id, row]));
  const invoices = new Map(snapshot.invoices.map(row => [row.id, row]));
  const rooms = new Map(snapshot.rooms.map(row => [row.id, row]));
  const paths = new Map();
  const missing = [];
  const paymentRows = [];
  const invoiceRows = [];
  const maintenanceRows = [];

  async function original(row, category, purpose, destination) {
    if (row.attachment_id == null) return null;
    const attachment = attachments.get(row.attachment_id);
    const extension = attachment && extensions[attachment.mime_type];
    const fail = reason => {
      missing.push([category, row.id, row.attachment_id, reason]);
      return null;
    };
    if (!extension || attachment.purpose !== purpose) return fail('Missing or incompatible registry entry');
    if (paths.has(attachment.id)) return { path: paths.get(attachment.id) };
    const path = destination(attachment.id, extension);
    const bytes = await readOriginal(attachment.id, path);
    if (!bytes || (!(bytes instanceof Uint8Array) && !bytes[Symbol.asyncIterator]) || bytes.length === 0) return fail('Original unavailable');
    paths.set(attachment.id, path);
    return { path, bytes };
  }

  for (const payment of snapshot.payments) {
    const invoice = invoices.get(payment.invoice_id);
    if (!invoice) missing.push(['Payment', payment.id, payment.attachment_id, 'Invoice unavailable']);
    const submittedAt = payment.created_at && new Date(payment.created_at);
    const year = submittedAt && Number.isFinite(submittedAt.getTime())
      ? new Intl.DateTimeFormat('en', {year:'numeric', timeZone:'Asia/Manila'}).format(submittedAt) : 'Undated';
    const receipt = await original(payment, 'Payment', 'payment', (id, ext) =>
      `05_Financial_Archives/${year}/Receipts/Payment_${payment.id}_${id}_Receipt.${ext}`);
    if (receipt?.bytes) yield* originalEntries(receipt);
    paymentRows.push([payment.id, payment.invoice_id, payment.reference_number, payment.status, receipt?.path]);
  }

  const paymentsByInvoice = new Map();
  for (const [paymentId, invoiceId, , , path] of paymentRows) {
    if (!paymentsByInvoice.has(invoiceId)) paymentsByInvoice.set(invoiceId, []);
    paymentsByInvoice.get(invoiceId).push([paymentId, path]);
  }
  for (const invoice of snapshot.invoices) {
    const linked = paymentsByInvoice.get(invoice.id) ?? [[null, null]];
    for (const [paymentId, path] of linked) invoiceRows.push([invoice.id, invoice.room_id, paymentId, path]);
  }

  for (const request of snapshot.maintenance_requests) {
    const room = rooms.get(request.room_id);
    if (!room) missing.push(['Maintenance', request.id, request.attachment_id, 'Room unavailable']);
    const number = /^[a-z0-9_-]+$/i.test(room?.room_number ?? '') ? room.room_number : 'Unknown';
    const folder = `03_Room_Archives/Room_${number}_${request.room_id}/Maintenance_Requests/MR-${request.id}`;
    const photo = await original(request, 'Maintenance', 'maintenance', (id, ext) =>
      `${folder}/Originals/${id}_Submission.${ext}`);
    if (photo?.bytes) yield* originalEntries(photo);
    const details = `${folder}/Request_Details.json`;
    yield entry(details, JSON.stringify({
      requestId: request.id,
      roomId: request.room_id,
      submittedAtUtc: request.created_at,
      description: request.description,
      status: request.status,
      staffResponse: request.staff_response,
      attachmentId: request.attachment_id,
      originalPath: photo?.path ?? null,
    }, null, 2));
    maintenanceRows.push([request.id, request.room_id, number, details, photo?.path]);
  }

  const tenantPaths = new Map();
  for (const tenant of snapshot.tenant_profiles ?? []) {
    const alias = tenantArchiveIds.get(tenant.user_id);
    if (!alias || !/^[a-z0-9_-]+$/i.test(alias)) {
      missing.push(['Tenant profile', null, null, 'Archive alias unavailable']);
      continue;
    }
    const assignmentRows = (snapshot.room_assignments ?? []).filter(row => row.tenant_id === tenant.user_id);
    const classification = assignmentRows.length > 0 && assignmentRows.every(row => row.ended_on)
      ? 'Former_Tenants' : 'Active_Tenants';
    const folder = `04_Tenant_Archives/${classification}/${alias}`;
    tenantPaths.set(tenant.user_id, folder);
    yield entry(folder + '/Tenant_Profile.json', JSON.stringify({
      archiveId: alias, displayName: tenant.display_name, status: tenant.status,
      phone: tenant.phone, emergencyContact: tenant.emergency_contact, gender: tenant.gender,
    }, null, 2));
    yield entry(folder + '/Rental_History.csv', csv(['Assignment ID', 'Room ID', 'Start Date', 'End Date'],
      assignmentRows.map(row => [row.id, row.room_id, row.started_on, row.ended_on])));
  }

  for (const assignment of snapshot.room_assignments ?? []) {
    if (!assignment.contract_attachment_id) continue;
    const folder = tenantPaths.get(assignment.tenant_id) ?? '04_Tenant_Archives/Unassigned';
    const contract = await original({ id: assignment.id, attachment_id: assignment.contract_attachment_id },
      'Contract', 'contract', (id, ext) => `${folder}/Contracts/Assignment_${assignment.id}_${id}.${ext}`);
    if (contract?.bytes) yield* originalEntries(contract);
  }
  for (const attachment of snapshot.attachments) {
    if (paths.has(attachment.id)) continue;
    const file = await original({ id: attachment.id, attachment_id: attachment.id }, 'Historical evidence',
      attachment.purpose, (id, ext) => `04_Tenant_Archives/Unassigned/Historical_Evidence/${id}.${ext}`);
    if (file?.bytes) yield* originalEntries(file);
  }

  yield entry('06_Indexes/Invoice_Index.csv', csv(['Invoice ID', 'Room ID', 'Payment ID', 'Receipt Path'], invoiceRows));
  yield entry('06_Indexes/Payment_Index.csv', csv(['Payment ID', 'Invoice ID', 'Reference', 'Status', 'Receipt Path'], paymentRows));
  yield entry('06_Indexes/Maintenance_Index.csv', csv(['Request ID', 'Room ID', 'Room Number', 'Request Path', 'Original Path'], maintenanceRows));
  yield entry('06_Indexes/Attachment_Index.csv', csv(['Attachment ID', 'Archive Path'], [...paths]));
  yield entry('06_Indexes/Tenant_Index.csv', csv(['Tenant Archive ID', 'Archive Path'],
    [...tenantPaths].map(([id, path]) => [tenantArchiveIds.get(id), path])));
  yield entry('00_Backup_Reports/Missing_Files.csv', csv(['Category', 'Record ID', 'Attachment ID', 'Reason'], missing));
  yield entry('README.txt', [
    'MapSilip finance and maintenance export',
    'This selection covers invoice, payment and maintenance navigation.',
    'Open 06_Indexes and follow the relative paths to the saved originals.',
    'Import CSV as UTF-8 with comma separators and identifiers as text.',
    `Recorded exceptions: ${missing.length}. See 00_Backup_Reports/Missing_Files.csv.`,
    'Review source coverage separately before relying on this export for recovery.',
  ].join('\n') + '\n');
}

const businessViews = [
  ['rooms', 'Rooms', ['Room ID', 'Room Number', 'Floor', 'Capacity', 'Availability', 'Monthly Rent', 'Gender Policy'],
    row => [row.id, row.room_number, row.floor_label, row.capacity, row.availability, row.monthly_rent, row.gender_policy]],
  ['room_assignments', 'Room_Assignments', ['Assignment ID', 'Tenant Archive ID', 'Room ID', 'Start Date', 'End Date', 'Contract End Date', 'Contract Monthly Rent', 'Contract Attachment ID'],
    (row, alias) => [row.id, alias(row.tenant_id), row.room_id, row.started_on, row.ended_on, row.contract_end_on, row.contract_monthly_rent, row.contract_attachment_id]],
  ['invoices', 'Invoices', ['Invoice ID', 'Tenant Archive ID', 'Room ID', 'Billing Start', 'Billing End', 'Due Date', 'Amount', 'Currency', 'Note', 'Issued At'],
    (row, alias) => [row.id, alias(row.tenant_id), row.room_id, row.coverage_start, row.coverage_end, row.due_on, row.amount, row.currency, row.note, row.created_at]],
  ['payments', 'Payments', ['Payment ID', 'Invoice ID', 'Tenant Archive ID', 'Amount', 'Method', 'Reference', 'Status', 'Receipt Attachment ID', 'Submitted At', 'Reviewed At'],
    (row, alias) => [row.id, row.invoice_id, alias(row.tenant_id), row.amount, row.method, row.reference_number, row.status, row.attachment_id, row.created_at, row.reviewed_at]],
  ['maintenance_requests', 'Maintenance_Requests', ['Request ID', 'Room ID', 'Tenant Archive ID', 'Submitted At', 'Category', 'Description', 'Status', 'Staff Response', 'Original Attachment ID'],
    (row, alias) => [row.id, row.room_id, alias(row.tenant_id), row.created_at, row.category, row.description, row.status, row.staff_response, row.attachment_id]],
  ['concerns', 'Concerns', ['Concern ID', 'Tenant Archive ID', 'Category', 'Description', 'Status', 'Owner Response', 'Submitted At'],
    (row, alias) => [row.id, alias(row.tenant_id), row.category, row.description, row.status, row.owner_response, row.created_at]],
  ['planned_visits', 'Planned_Visits', ['Visit ID', 'Tenant Archive ID', 'Visitor Name', 'Visit Date', 'Expected Arrival', 'Expected Departure', 'Purpose', 'Cancelled At'],
    (row, alias) => [row.id, alias(row.tenant_id), row.visitor_name, row.visit_on, row.arrival_time, row.departure_time, row.purpose, row.cancelled_at]],
  ['operational_audit', 'Audit_History', ['Audit Event ID', 'Record ID', 'Event', 'Reason', 'Event Time'],
    row => [row.id, row.record_id, row.action, row.reason, row.created_at]],
  ['notifications', 'Notifications', ['Notification ID', 'Tenant Archive ID', 'Title', 'Body', 'Read At', 'Created At'],
    (row, alias) => [row.id, alias(row.recipient_id), row.title, row.body, row.read_at, row.created_at]],
];

/** Build category views from the owner-approved, restricted snapshot. Period is a Manila capture label. */
export function* businessCategoryEntries(snapshot, { period, tenantArchiveIds }) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(period)) throw new Error('Invalid archive period');
  const [year, month] = period.split('-');
  const monthName = new Intl.DateTimeFormat('en', { month: 'long', timeZone: 'UTC' })
    .format(new Date(period + '-01T00:00:00Z'));
  const directory = `02_Annual_Archives/${year}/${month}_${monthName}/CSV_Exports`;
  const unmapped = new Set();
  const alias = id => {
    if (id == null) return null;
    const value = tenantArchiveIds.get(id);
    if (!value) unmapped.add(id);
    return value ?? null;
  };
  const coverage = [];
  for (const [source, name, headers, project] of businessViews) {
    const rows = snapshot[source];
    if (!Array.isArray(rows)) {
      coverage.push([source, 'Unavailable', null]);
      continue;
    }
    yield entry(`${directory}/${name}.csv`, csv(headers, rows.map(row => project(row, alias))));
    coverage.push([source, 'Included', rows.length]);
  }
  yield entry('00_Backup_Reports/Category_Coverage.csv', csv(['Source', 'Coverage', 'Records'], coverage));
  yield entry('00_Backup_Reports/Unresolved_Tenant_References.txt', `${unmapped.size} distinct source identities lack an archive alias. Related rows remain included.\n`);
}
