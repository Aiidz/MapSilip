import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const migrations = (await readFile(new URL('../supabase/migrations/20261126154027_monthly_rent_first_week_due.sql', import.meta.url), 'utf8'));
const noticeMigration = await readFile(new URL('../supabase/migrations/20261126154319_monthly_rent_due_notice_sync.sql', import.meta.url), 'utf8');
const universalMigration = await readFile(new URL('../supabase/migrations/20261126154548_rent_due_policy_independent_of_note.sql', import.meta.url), 'utf8');
const dashboard = await readFile(new URL('../app/components/AnalyticsWorkspace.tsx', import.meta.url), 'utf8');

test('monthly rent due dates use move-in for a partial month and the seventh for a full month', () => {
  assert.match(migrations, /greatest\(new\.coverage_start,\s*month_start\s*\+\s*6\)/i);
  assert.match(migrations, /new\.coverage_end\s*<=\s*month_end/i);
  assert.match(migrations, /lower\(btrim\(coalesce\(new\.note,\s*''\)\)\)\s*=\s*'monthly rent'/i);
});

test('existing current and future full-month rent invoices are aligned to the seventh', () => {
  assert.match(migrations, /update\s+public\.invoices[\s\S]*?set\s+due_on\s*=\s*greatest\(coverage_start,\s*date_trunc\('month',\s*coverage_start\)::date\s*\+\s*6\)/i);
  assert.match(migrations, /coverage_start\s*>=\s*date_trunc\('month',\s*\(now\(\)\s*at\s*time\s*zone\s*'Asia\/Manila'\)::date\)::date/i);
  assert.match(migrations, /coverage_end\s*<=\s*\(date_trunc\('month',\s*coverage_start\)\s*\+\s*interval\s+'1 month - 1 day'\)::date/i);
});

test('monthly rent due-date rule is applied to invoice inserts and billing-period edits', () => {
  assert.match(migrations, /create trigger invoices_monthly_rent_due_date\s+before insert or update of coverage_start,\s*coverage_end,\s*due_on,\s*note\s+on public\.invoices/i);
});

test('current and future invoice notifications show the corrected due date', () => {
  assert.match(noticeMigration, /update\s+public\.notifications[\s\S]*?from\s+public\.invoices/i);
  assert.match(noticeMigration, /n\.event_key\s*=\s*'invoice:'\s*\|\|\s*i\.id::text/i);
  assert.match(noticeMigration, /to_char\(i\.due_on,\s*'Mon DD, YYYY'\)/i);
  assert.match(noticeMigration, /coverage_start\s*>=\s*date_trunc\('month',\s*\(now\(\)\s*at\s*time\s*zone\s*'Asia\/Manila'\)::date\)::date/i);
});

test('an unpaid invoice is overdue starting the day after its due date', () => {
  assert.match(dashboard, /outstanding\.filter\(row\s*=>\s*String\(row\.due_on\)\s*<\s*today\)/);
});

test('one-month invoice due dates follow the rent schedule even when the optional note is blank', () => {
  assert.match(universalMigration, /create or replace function mapsilip_private\.set_monthly_rent_due_date/i);
  assert.match(universalMigration, /new\.coverage_end\s*<=\s*month_end/i);
  assert.match(universalMigration, /greatest\(new\.coverage_start,\s*month_start\s*\+\s*6\)/i);
  assert.doesNotMatch(universalMigration, /new\.note/i);
});
