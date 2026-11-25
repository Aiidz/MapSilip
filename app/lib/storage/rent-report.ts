import { buildWorkbooks } from './workbook.mjs';

type Row = Record<string, unknown>;
const day = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Manila' });
const stamp = new Intl.DateTimeFormat('en-PH', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Manila' });
const text = (value: unknown) => value == null ? '' : String(value);
const localDate = (value: unknown) => {
  const date = new Date(text(value));
  return Number.isFinite(date.getTime()) ? day.format(date) : '';
};
const cents = (value: unknown) => Math.round(Number(value) * 100);
const method: Record<string, string> = { cash: 'Cash', gcash: 'GCash', bank_transfer: 'Bank transfer' };
const statuses: Record<string, string> = { approved: 'Verified', pending: 'For review', rejected: 'Rejected' };

export function rentCollectionReport({ tenants, rooms, invoices, payments, month, search, status, now }: {
  tenants: Row[]; rooms: Row[]; invoices: Row[]; payments: Row[];
  month: string; search: string; status: string; now: Date;
}) {
  const cutoff = day.format(now);
  const names = new Map(tenants.map(row => [row.user_id, text(row.display_name)]));
  const numbers = new Map(rooms.map(row => [row.id, text(row.room_number)]));
  const byInvoice = new Map(invoices.map(row => [row.id, row]));
  const paymentGroups = new Map<unknown, Row[]>();
  const totals = new Map<string, { billed: number; collections: number; applied: number; outstanding: number; overdue: number; pending: number }>();
  function forCurrency(currency: string) {
    if (!totals.has(currency)) totals.set(currency, { billed: 0, collections: 0, applied: 0, outstanding: 0, overdue: 0, pending: 0 });
    return totals.get(currency)!;
  }
  for (const payment of payments) {
    const group = paymentGroups.get(payment.invoice_id) ?? [];
    group.push(payment);
    paymentGroups.set(payment.invoice_id, group);
    const verified = localDate(payment.reviewed_at);
    const invoice = byInvoice.get(payment.invoice_id);
    if (!invoice) throw new Error('An invoice is missing. Refresh and try the report again.');
    if (payment.status === 'approved' && verified && verified <= cutoff && (!month || verified.startsWith(month))) {
      forCurrency(text(invoice.currency)).collections += cents(payment.amount);
    }
  }

  const balances = [];
  const followUp = new Map<string, { tenant: string; rooms: Set<string>; currency: string; due: string; balance: number; overdue: number; pending: number }>();
  for (const invoice of invoices) {
    if (localDate(invoice.created_at) > cutoff) continue;
    if (month && (text(invoice.coverage_start).slice(0, 7) > month || text(invoice.coverage_end).slice(0, 7) < month)) continue;
    const currency = text(invoice.currency);
    const billed = cents(invoice.amount);
    const group = paymentGroups.get(invoice.id) ?? [];
    const paid = group.reduce((sum, payment) => payment.status === 'approved' && localDate(payment.reviewed_at) &&
      localDate(payment.reviewed_at) <= cutoff ? sum + cents(payment.amount) : sum, 0);
    const pending = group.reduce((sum, payment) => payment.status === 'pending' ? sum + cents(payment.amount) : sum, 0);
    const due = text(invoice.due_on);
    const balance = Math.max(0, billed - paid);
    const overdue = balance > 0 && due < cutoff;
    const total = forCurrency(currency);
    total.billed += billed;
    total.applied += Math.min(billed, paid);
    total.outstanding += balance;
    total.overdue += overdue ? balance : 0;
    total.pending += pending;
    const tenant = names.get(invoice.tenant_id) || 'Name unavailable';
    const room = numbers.get(invoice.room_id) ?? '';
    const paymentState = !balance ? 'Paid in full' : overdue
      ? paid ? 'Overdue · Partially paid' : 'Overdue · Unpaid'
      : paid ? 'Partially paid · Not yet due' : 'Unpaid · Not yet due';
    balances.push({ tenant, room, currency, due, billed, paid, balance, pending, overdue, paymentState, invoice });
    if (balance) {
      const key = JSON.stringify([invoice.tenant_id, currency]);
      const entry = followUp.get(key) ?? { tenant, rooms: new Set<string>(), currency, due, balance: 0, overdue: 0, pending: 0 };
      if (room) entry.rooms.add(room);
      if (due < entry.due) entry.due = due;
      entry.balance += balance;
      entry.overdue += overdue ? balance : 0;
      entry.pending += pending;
      followUp.set(key, entry);
    }
  }

  const php = !totals.size || (totals.size === 1 && totals.has('PHP') && payments.every(row => byInvoice.get(row.invoice_id)?.currency === 'PHP'));
  const currencyColumn = php ? [] : ['Currency'];
  const period = (month || 'All billing periods') + ' · Current balances as of ' + cutoff;
  const generated = stamp.format(now) + ' (Manila)';
  const billingPeriod = (invoice: Row) => text(invoice.coverage_start) + ' to ' + text(invoice.coverage_end);
  const query = search.trim().toLocaleLowerCase();
  const transactionRows = payments.filter(payment => {
    return (!month || localDate(payment.created_at).startsWith(month)) && (!status || status === payment.status)
      && (!query || [payment.reference_number, names.get(payment.tenant_id)].some(value => text(value).toLocaleLowerCase().includes(query)));
  }).toSorted((a, b) => text(b.created_at).localeCompare(text(a.created_at))).map(payment => {
    const invoice = byInvoice.get(payment.invoice_id)!;
    return { Tenant: names.get(payment.tenant_id) || 'Name unavailable', Invoice: invoice.id, 'Billing period': billingPeriod(invoice),
      Amount: cents(payment.amount) / 100, Currency: invoice.currency, Submitted: localDate(payment.created_at),
      Method: method[text(payment.method)] ?? payment.method, Reference: payment.reference_number,
      Verification: statuses[text(payment.status)] ?? payment.status, 'Verified on': payment.status === 'approved' ? localDate(payment.reviewed_at) : '' };
  });
  const summaryRows = [...totals].flatMap(([currency, value]) => [
    { Measure: 'Rent billed', Value: value.billed / 100, Currency: currency },
    { Measure: 'Verified collections in period', Value: value.collections / 100, Currency: currency },
    { Measure: 'Applied to selected invoices', Value: value.applied / 100, Currency: currency },
    { Measure: 'Outstanding balance', Value: value.outstanding / 100, Currency: currency },
    { Measure: 'Overdue balance', Value: value.overdue / 100, Currency: currency },
    { Measure: 'Awaiting verification', Value: value.pending / 100, Currency: currency },
    { Measure: 'Collection rate', Value: value.billed ? (value.applied / value.billed * 100).toFixed(1) + '%' : '—', Currency: '' },
  ]);
  summaryRows.push({ Measure: 'Tenants with a balance', Value: new Set(balances.filter(row => row.balance).map(row => row.invoice.tenant_id)).size, Currency: '' },
    { Measure: 'Tenants overdue', Value: new Set(balances.filter(row => row.overdue).map(row => row.invoice.tenant_id)).size, Currency: '' });
  const total = totals.get('PHP');
  const metrics = php ? [
    { label: 'Rent billed', value: (total?.billed ?? 0) / 100, money: true },
    { label: 'Verified collections', value: (total?.collections ?? 0) / 100, money: true },
    { label: 'Outstanding', value: (total?.outstanding ?? 0) / 100, money: true },
    { label: 'Overdue', value: (total?.overdue ?? 0) / 100, money: true },
  ] : [];
  return buildWorkbooks([
    { name: 'Collection Summary', rows: summaryRows, report: { period, generated,
      summary: 'Current snapshot. Includes full invoices overlapping the billing period. Transaction filters apply only to the transaction sheet.',
      columns: ['Measure', 'Value', 'Currency'], widths: { Measure: 40, Value: 24, Currency: 23 }, metrics, emphasizeMetrics: true } },
    { name: 'Rent Follow-Up', rows: [...followUp.values()].sort((a, b) => Number(b.overdue > 0) - Number(a.overdue > 0) || a.due.localeCompare(b.due)).map(row => ({
      Tenant: row.tenant, Room: [...row.rooms].join(', '), 'Oldest due date': row.due, 'Balance due': row.balance / 100,
      'Overdue amount': row.overdue / 100, 'Pending verification': row.pending / 100, Currency: row.currency,
      'Follow-up status': (row.overdue ? 'Overdue' : 'Not yet due') + (row.pending ? ' · Proof for review' : ''),
    })), report: { period, generated, columns: ['Tenant', 'Room', 'Oldest due date', 'Balance due', 'Overdue amount', 'Pending verification', ...currencyColumn, 'Follow-up status'],
      money: php ? ['Balance due', 'Overdue amount', 'Pending verification'] : [], widths: { 'Follow-up status': 33 } } },
    { name: 'Tenant Balances', rows: balances.sort((a, b) => Number(b.overdue) - Number(a.overdue) || a.due.localeCompare(b.due)).map(row => ({
      Tenant: row.tenant, Room: row.room, 'Billing period': billingPeriod(row.invoice), Invoice: row.invoice.id,
      'Due date': row.due, Billed: row.billed / 100, Verified: row.paid / 100, 'Balance due': row.balance / 100,
      'Pending verification': row.pending / 100, Currency: row.currency, Status: row.paymentState,
    })), report: { period, generated, columns: ['Tenant', 'Room', 'Billing period', 'Invoice', 'Due date', 'Billed', 'Verified', 'Balance due', 'Pending verification', ...currencyColumn, 'Status'],
      money: php ? ['Billed', 'Verified', 'Balance due', 'Pending verification'] : [], widths: { Status: 33, Invoice: 39, 'Billing period': 28 } } },
    { name: 'Payment Transactions', rows: transactionRows, report: { period: (month || 'All dates') + ' · Submission date (Manila)', generated,
      columns: ['Tenant', 'Invoice', 'Billing period', 'Amount', ...currencyColumn, 'Submitted', 'Method', 'Reference', 'Verification', 'Verified on'],
      money: php ? ['Amount'] : [], widths: { Invoice: 39, 'Billing period': 28 } } },
  ]);
}
