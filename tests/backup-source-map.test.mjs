import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const fixture = JSON.parse(readFileSync(new URL('./fixtures/backup-source-map.json', import.meta.url), 'utf8'));

test('invoice and payment resolve to the same registered receipt', () => {
  const [invoice] = fixture.invoices;
  const [payment] = fixture.payments;
  const invoiceReceipt = fixture.attachments.find(attachment =>
    attachment.id === fixture.payments.find(row => row.invoice_id === invoice.id)?.attachment_id);
  const paymentReceipt = fixture.attachments.find(attachment => attachment.id === payment.attachment_id);
  assert.equal(payment.tenant_id, invoice.tenant_id);
  assert.equal(invoiceReceipt, paymentReceipt);
  assert.equal(invoiceReceipt?.purpose, 'payment');
});

test('room maintenance follows the recorded request across occupancy changes', () => {
  const [room] = fixture.rooms;
  const [request] = fixture.maintenance_requests;
  const [former, current] = fixture.room_assignments.filter(row => row.room_id === room.id);
  const photo = fixture.attachments.find(attachment => attachment.id === request.attachment_id);
  const submissionDate = request.created_at.slice(0, 10);

  assert.equal(room.room_number, '01');
  assert.equal(request.room_id, room.id);
  assert.ok(former.started_on <= submissionDate && submissionDate < former.ended_on);
  assert.equal(request.tenant_id, former.tenant_id);
  assert.notEqual(request.tenant_id, current.tenant_id);
  assert.equal(photo?.purpose, 'maintenance');
});
