import { buildWorkbook, buildWorkbooks } from './workbook.mjs';
import { PART_LIMIT } from './zip.mjs';

const manilaTime = new Intl.DateTimeFormat('en-PH', {
  dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Manila',
});
const time = value => value == null ? '' : manilaTime.format(new Date(value));
const amount = value => value == null ? null : Number(value);
const columns = labels => labels.split('|');
const paymentColumns = columns('Invoice ID|Payment ID|Tenant ID|Room|Billing from|Billing through|Due date|Billed|Payment amount|Approved paid|Outstanding|Currency|Invoice status|Payment status|Method|Reference|Submitted (Manila)|Receipt path');

export function* historyReports(snapshot, { capturedAt, period = 'All available history', paths, complete = true }) {
  const byRoom = new Map(snapshot.rooms.map(row => [row.id, row.room_number]));
  const tenants = new Map(snapshot.tenant_profiles.map(row => [row.user_id, row]));
  const assignments = Map.groupBy(snapshot.room_assignments, row => row.tenant_id);
  const payments = Map.groupBy(snapshot.payments, row => row.invoice_id);
  const invoiceIds = new Set(snapshot.invoices.map(row => row.id));
  const room = id => byRoom.get(id) ?? id;
  const file = id => paths.get(id) ?? '';
  const generated = time(capturedAt) + ' (Manila)';
  const summary = [
    ['Archive status', complete ? 'Complete' : 'Incomplete'],
    ['Invoices', snapshot.invoices.length], ['Payments', snapshot.payments.length],
    ['Rooms', snapshot.rooms.length], ['Room assignments', snapshot.room_assignments.length],
    ['Maintenance requests', snapshot.maintenance_requests.length], ['Concerns', snapshot.concerns.length],
    ['Tenants', snapshot.tenant_profiles.length], ['Original files', paths.size],
  ];
  const totals = new Map();
  function* paymentRows() {
    for (const invoice of snapshot.invoices) {
      const linked = payments.get(invoice.id) ?? [];
      const paid = linked.reduce((cents, payment) => cents + (payment.status === 'approved' ? Math.round(Number(payment.amount) * 100) : 0), 0);
      const billed = Math.round(Number(invoice.amount) * 100);
      const outstanding = Math.max(0, billed - paid);
      const total = totals.get(invoice.currency) ?? { billed: 0, paid: 0, outstanding: 0 };
      total.billed += billed; total.paid += paid; total.outstanding += outstanding;
      totals.set(invoice.currency, total);
      for (const [index, payment] of (linked.length ? linked : [null]).entries()) {
        yield [invoice.id, payment?.id, invoice.tenant_id, room(invoice.room_id), invoice.coverage_start,
          invoice.coverage_end, invoice.due_on, index ? null : billed / 100, amount(payment?.amount),
          index ? null : paid / 100, index ? null : outstanding / 100, invoice.currency, outstanding === 0 ? 'Paid' : paid > 0 ? 'Partially paid' : 'Unpaid',
          payment?.status, payment?.method, payment?.reference_number, time(payment?.created_at), file(payment?.attachment_id)];
      }
    }
    for (const payment of snapshot.payments) {
      if (!invoiceIds.has(payment.invoice_id)) yield [payment.invoice_id, payment.id, payment.tenant_id,
        null,null,null,null,null,amount(payment.amount),null,null,null,null,payment.status,payment.method,
        payment.reference_number,time(payment.created_at),file(payment.attachment_id)];
    }
  }
  const paymentHistory = [...paymentRows()];
  const phpOnly = totals.size === 1 && totals.has('PHP');
  for (const [currency, total] of totals) {
    for (const [label, value] of Object.entries(total)) summary.push([label[0].toUpperCase() + label.slice(1) + ' (' + currency + ')', value / 100]);
  }
  yield* reportFiles('00_Summary', 'Archive summary', ['Measure', 'Value'], summary);
  yield* reportFiles('01_Payment_History', 'Payment history', paymentColumns, paymentHistory,
    phpOnly ? ['Billed', 'Payment amount', 'Approved paid', 'Outstanding'] : [],
    [...totals].map(([currency, total]) => `${currency} · Billed ${(total.billed / 100).toLocaleString('en-PH', { minimumFractionDigits: 2 })} · Approved paid ${(total.paid / 100).toLocaleString('en-PH', { minimumFractionDigits: 2 })} · Outstanding ${(total.outstanding / 100).toLocaleString('en-PH', { minimumFractionDigits: 2 })}`).join(' | ') || 'No invoices in this report');
  const roomAssignments = Map.groupBy(snapshot.room_assignments, row => row.room_id);
  yield* reportFiles('02_Room_History', 'Room history',
    columns('Room ID|Room|Floor|Capacity|Availability|Assignment ID|Tenant ID|Move-in|Move-out'),
    snapshot.rooms.flatMap(row => (roomAssignments.get(row.id) ?? [null]).map(stay =>
      [row.id,row.room_number,row.floor_label,row.capacity,row.availability,stay?.id,stay?.tenant_id,stay?.started_on,stay?.ended_on])));
  yield* maintenanceFiles(snapshot.maintenance_requests);
  yield* reportFiles('04_Concern_History', 'Concern history',
    columns('Concern ID|Submitted (Manila)|Category|Concern details|Status|Response'),
    snapshot.concerns.map(row => [row.id,time(row.created_at),row.category,row.description,statusLabel(row.status),row.owner_response]),
    [], undefined, statusMetrics(snapshot.concerns, 'Concerns'));
  const tenantIds = new Set([...tenants.keys(), ...assignments.keys()]);
  yield* reportFiles('05_Tenant_History', 'Tenant history',
    columns('Tenant ID|Name|Room|Move-in|Move-out|Tenancy status|Original contract path'),
    [...tenantIds].flatMap(id => (assignments.get(id) ?? [null]).map(stay =>
      [id,tenants.get(id)?.display_name,room(stay?.room_id),stay?.started_on,stay?.ended_on,
        stay?.ended_on && tenants.get(id)?.status === 'active' ? 'Previous room' : statusLabel(tenants.get(id)?.status),
        file(stay?.contract_attachment_id)])),
    [], undefined, [
      { label: 'Tenants', value: tenantIds.size },
      { label: 'Active tenants', value: [...tenants.values()].filter(row => row.status === 'active').length },
      { label: 'Inactive tenants', value: [...tenants.values()].filter(row => row.status === 'inactive').length },
    ]);

  function statusLabel(status) {
    return ({ resolved: 'Resolved', in_progress: 'In progress', pending: 'Pending', active: 'Active', inactive: 'Inactive' })[status] ?? status ?? '';
  }

  function statusMetrics(rows, label) {
    const resolved = rows.filter(row => row.status === 'resolved').length;
    return [{ label, value: rows.length }, { label: 'Resolved', value: resolved }, { label: 'Open', value: rows.length - resolved }];
  }

  function* maintenanceFiles(requests) {
    const groups = [...Map.groupBy(requests, row => row.room_id)]
      .sort(([a], [b]) => String(room(a)).localeCompare(String(room(b)), undefined, { numeric: true }) || String(a).localeCompare(String(b)));
    const usedNames = new Set(['rooms overview']);
    const sheets = groups.flatMap(([id, rows]) => {
      const label = 'Room ' + (room(id) ?? 'Unknown');
      const base = label.replace(/[\\/*?:[\]]/g, ' ').replace(/^'+|'+$/g, '').trim().slice(0, 26).replace(/'+$/, '');
      const chunks = [];
      for (let index = 0; index < rows.length; index += 500) {
        let name = base;
        for (let suffix = 2; usedNames.has(name.toLowerCase()); suffix++) name = base + ' ' + suffix;
        usedNames.add(name.toLowerCase());
        chunks.push({ name, label, rows: rows.slice(index, index + 500) });
      }
      return chunks;
    });
    const overviewColumns = columns('Room|Requests|Open|Resolved|Latest request (Manila)');
    const detailColumns = columns('Request ID|Room|Submitted (Manila)|Issue|Status|Resolution|Original photo path');
    function* volume(batch, suffix = '') {
      const overview = batch.map(sheet => {
        const resolved = sheet.rows.filter(row => row.status === 'resolved').length;
        const latest = sheet.rows.reduce((last, row) => Math.max(last, row.created_at ? new Date(row.created_at).getTime() : 0), 0);
        return { Room: sheet.name, Requests: sheet.rows.length, Open: sheet.rows.length - resolved,
          Resolved: resolved, 'Latest request (Manila)': latest ? time(latest) : '' };
      });
      const requestCount = overview.reduce((total, row) => total + row.Requests, 0);
      const bytes = buildWorkbooks([
        { name: 'Rooms Overview', rows: overview, report: {
          columns: overviewColumns, generated, period, rowLinks: batch.map(sheet => sheet.name), emphasizeMetrics: true,
          metrics: [{ label: 'Rooms in workbook', value: new Set(batch.map(sheet => sheet.label)).size },
            { label: 'Requests', value: requestCount }, { label: 'Open requests', value: overview.reduce((total, row) => total + row.Open, 0) }],
        } },
        ...batch.map(sheet => ({ name: sheet.name, rows: sheet.rows.map(row => ({
          'Request ID': row.id, Room: room(row.room_id), 'Submitted (Manila)': time(row.created_at),
          Issue: row.description, Status: statusLabel(row.status), Resolution: row.staff_response,
          'Original photo path': file(row.attachment_id),
        })), report: { columns: detailColumns, generated, period, emphasizeMetrics: true,
          widths: { Issue: 40, Resolution: 40, 'Original photo path': 52 }, metrics: statusMetrics(sheet.rows, 'Requests') } })),
      ]);
      if (bytes.length < PART_LIMIT - 4096) yield { path: '03_Maintenance_History' + suffix + '.xlsx', bytes };
      else {
        if (batch.length < 2) throw new Error('Room history exceeds the report size limit');
        const midpoint = Math.ceil(batch.length / 2);
        yield* volume(batch.slice(0, midpoint), suffix + '_1');
        yield* volume(batch.slice(midpoint), suffix + '_2');
      }
    }
    if (sheets.length <= 10) yield* volume(sheets);
    else for (let index = 0; index < sheets.length; index += 10) {
      yield* volume(sheets.slice(index, index + 10), '_Part_' + String(index / 10 + 1).padStart(4, '0'));
    }
  }

  function* reportFiles(filename, title, headers, rows, money = [], description, metrics) {
    const options = { columns: headers, generated, period, money, summary: description, metrics, emphasizeMetrics: Boolean(metrics) };
    function* bounded(batch, suffix = '') {
      const bytes = buildWorkbook(title, batch.map(row => Object.fromEntries(headers.map((header, index) => [header, row[index]]))), options);
      if (bytes.length < PART_LIMIT - 4096) {
        yield { path: filename + suffix + '.xlsx', bytes };
      } else {
        if (batch.length <= 1) throw new Error('A history row exceeds the report size limit');
        const midpoint = Math.ceil(batch.length / 2);
        yield* bounded(batch.slice(0, midpoint), suffix + '_1');
        yield* bounded(batch.slice(midpoint), suffix + '_2');
      }
    }
    if (rows.length <= 2000) yield* bounded(rows);
    else for (let start = 0; start < rows.length; start += 2000) {
      yield* bounded(rows.slice(start, start + 2000), '_Part_' + String(start / 2000 + 1).padStart(4, '0'));
    }
  }
}

export function historyAttachmentPaths(snapshot) {
  const metadata = new Map(snapshot.attachments.map(row => [row.id, row]));
  const paths = new Map();
  const groups = [
    ['payments', 'attachment_id', 'payment', 'Receipts'],
    ['maintenance_requests', 'attachment_id', 'maintenance', 'Maintenance'],
    ['room_assignments', 'contract_attachment_id', 'contract', 'Contracts'],
  ];
  for (const [source, field, purpose, folder] of groups) {
    for (const row of snapshot[source]) {
      const id = row[field];
      if (!id || paths.has(id)) continue;
      const attachment = metadata.get(id);
      const extension = { 'application/pdf': 'pdf', 'image/jpeg': 'jpg', 'image/png': 'png' }[attachment?.mime_type];
      if (!extension || attachment.purpose !== purpose || attachment.deleted_at) throw new Error('Required attachment unavailable: ' + id);
      paths.set(id, `Attachments/${folder}/${row.id}/${id}.${extension}`);
    }
  }
  return paths;
}
