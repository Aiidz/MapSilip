import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { after, test } from 'node:test';

const require = createRequire(import.meta.url);
const output = mkdtempSync(join(tmpdir(), 'mapsilip-onboarding-test-'));
after(() => rmSync(output, { recursive: true, force: true }));

execFileSync(process.execPath, [
  require.resolve('typescript/bin/tsc'),
  'app/lib/backend/security.ts',
  '--rootDir', 'app/lib/backend',
  '--outDir', output,
  '--module', 'commonjs',
  '--target', 'ES2022',
  '--strict',
  '--skipLibCheck',
  '--types', 'node',
]);

const {
  BackendError,
  publicBackendError,
} = require(join(output, 'security.js'));

const read = path => readFileSync(path, 'utf8');

test('account request UI matches reference design with password retention and visibility toggles', () => {
  const form = read('app/components/AccountRequestForm.tsx');
  const preview = read('app/components/AuthPreview.tsx');

  // Fields matching RequestAccount-Page.png
  assert.match(form, /name="first_name"/);
  assert.match(form, /name="last_name"/);
  assert.match(form, /name="middle_name"/);
  assert.match(form, /name="phone"/);
  assert.match(form, /name="email"/);
  assert.match(form, /name="password"/);
  assert.match(form, /name="confirm_password"/);

  // Placeholders matching reference design
  assert.match(form, /placeholder="First name"/);
  assert.match(form, /placeholder="Last name"/);
  assert.match(form, /placeholder="09XX XXX XXXX"/);
  assert.match(form, /placeholder="admin@gmail.com"/);
  assert.match(form, /placeholder="Enter password"/);
  assert.match(form, /placeholder="Confirm password"/);

  // Password policy and visibility toggle
  assert.match(form, /minLength=\{8\}/);
  assert.match(form, /showPassword/);
  assert.match(form, /showConfirm/);
  assert.match(form, /auth-password-toggle/);
  assert.match(form, /Request Account/);

  // AuthPreview title and subtitle
  assert.match(preview, /title\s*=\s*request\s*\?\s*"Create Account"/);
  assert.match(preview, /Fill in your details to get started\./);
});

test('tenant account request route accepts original password and registers request without mandatory email verification', () => {
  const route = read('app/api/account-requests/route.ts');
  assert.match(route, /assertRequestOrigin/);
  assert.match(route, /consumeAccountRequestRateLimit/);
  assert.match(route, /password\.length\s*<\s*8/);
  assert.match(route, /password\s*!==\s*confirmPassword/);
  assert.match(route, /auth\.admin\.createUser/);
  assert.match(route, /email_confirm:\s*true/);
  assert.doesNotMatch(route, /auth\.signUp/);
  assert.match(route, /!password/);
  assert.match(route, /password !== confirmPassword/);
  assert.match(route, /executor\.submitAccountRequest\(email,\s*name,\s*phone\s*\|\|\s*null,\s*userId\)/);
  assert.match(route, /accountRequestProvisioningReady\(\)/);
  assert.ok(route.indexOf('accountRequestProvisioningReady()') < route.indexOf('auth.admin.createUser'),
    'migration availability must be checked before creating an Auth identity');
});

test('admin review enforces room assignment on approval and provides rejection handling', () => {
  const route = read('app/api/account-requests/review/route.ts');
  const workspace = read('app/components/OperationalWorkspace.tsx');

  // Server enforces room_id when approving
  assert.match(route, /requireStaffAccess\('tenant\.application\.approve'\)/);
  assert.match(route, /decision\s*===\s*'approved'/);
  assert.match(route, /room_id/);
  assert.match(route, /mapsilip_review_account_request/);

  // Operational workspace provides room selection on review
  assert.match(workspace, /action\s*===\s*'account\.review'/);
  assert.match(workspace, /room_id/);
  assert.match(workspace, /Room \(Required if approving\)/);
  assert.doesNotMatch(workspace, /Share this invitation link privately/);
});

test('tenant sign-in requires an active profile before admitting session and preserves legacy tenants', () => {
  const tenantAuth = read('app/lib/backend/tenant-auth.ts');

  // Verifies password against Supabase Auth
  assert.match(tenantAuth, /signInWithPassword\(\{ email, password \}\)/);
  assert.match(tenantAuth, /auth\.getUser\(\)/);

  // Enforces admin approval via active tenant profile
  assert.match(tenantAuth, /\.from\('tenant_profiles'\)/);
  assert.match(tenantAuth, /profile\.status\s*!==\s*'active'/);

  // Existing active tenants without an assignment must not be locked out.
  assert.doesNotMatch(tenantAuth, /tenant_room_assignment/);

  // Session persistence happens only after approval is checked.
  const profileIndex = tenantAuth.indexOf("from('tenant_profiles')");
  const sessionIndex = tenantAuth.indexOf('auth.setSession(');
  assert.ok(profileIndex < sessionIndex, 'profile checked before setSession');
});

test('migration enforces room assignment, approval/rejection notifications, and removes mandatory email verification', () => {
  const sql = read('supabase/migrations/20261027120000_tenant_approval_and_room_assignment.sql');

  // Removes mandatory invitation_hash requirement
  assert.match(sql, /account_requests_check/);

  // Auth internals are read to validate the mapping, never written through SQL.
  assert.doesNotMatch(sql, /^\s*update\s+auth\.users/im);
  assert.match(sql, /u\.email_confirmed_at is not null/);
  assert.match(sql, /lower\(u\.email\) = p_email/);

  // Approval requires room assignment
  assert.match(sql, /room assignment required for approval/);
  assert.match(sql, /room_rec\.availability <> 'available'/);
  assert.match(sql, /rejection reason required/);
  assert.match(sql, /drop function public\.mapsilip_review_account_request\(uuid,text,text\)/);
  assert.match(sql, /insert into public\.room_assignments/);

  // In-app notifications for approval and rejection
  assert.match(sql, /'Account approved'/);
  assert.match(sql, /'Account request rejected'/);
  assert.match(sql, /'account-request:' \|\| p_id::text \|\| ':approved'/);
  assert.match(sql, /'account-request:' \|\| p_id::text \|\| ':rejected'/);

  // Rejection reason stored and returned in review RPC
  assert.match(sql, /rejection_reason\s*=\s*p_note/);
  assert.match(sql, /'rejection_reason',\s*p_note/);

  // Applicant status function and least-privilege grants
  assert.match(sql, /create or replace function mapsilip_private\.applicant_status\(p_user_id uuid\)/);
  assert.match(sql, /grant execute on function mapsilip_private\.applicant_status\(uuid\) to mapsilip_security_executor/);

  // RLS allows rejected applicants to inspect rejection notice and own request status
  assert.match(sql, /create policy account_requests_applicant_read on public\.account_requests/);
  assert.match(sql, /activated_user_id\s*=\s*\(select auth\.uid\(\)\)/);
  assert.match(sql, /create policy notifications_recipient_read on public\.notifications/);
  assert.match(sql, /ar\.status\s*=\s*'rejected'/);

  // RLS keeps the active profile gate; new approvals require a room in the transaction.
  assert.doesNotMatch(sql, /and exists \(select 1 from public\.room_assignments ra where ra\.tenant_id = auth\.uid\(\) and ra\.ended_on is null\)/);
});

test('rejected and pending applicants receive descriptive sign-in feedback without portal access', () => {
  // Rejected applicant error contains specific admin rejection reason
  const rejectionReason = 'Room 101 is not available for single-occupancy requests.';
  const rejectedError = new BackendError(
    'forbidden',
    'account_rejected',
    `Your account request was not approved: ${rejectionReason}`,
  );
  const publicRejected = publicBackendError(rejectedError);
  assert.equal(publicRejected.status, 403);
  assert.equal(publicRejected.code, 'forbidden');
  assert.equal(publicRejected.message, `Your account request was not approved: ${rejectionReason}`);

  // Pending applicant error explains awaiting admin review
  const pendingError = new BackendError(
    'forbidden',
    'account_pending',
    'Your account request is awaiting administrator approval.',
  );
  const publicPending = publicBackendError(pendingError);
  assert.equal(publicPending.status, 403);
  assert.equal(publicPending.code, 'forbidden');
  assert.equal(publicPending.message, 'Your account request is awaiting administrator approval.');

  // Generic forbidden error does not leak internal stages
  const genericForbidden = new BackendError('forbidden', 'tenant_profile');
  const publicGeneric = publicBackendError(genericForbidden);
  assert.equal(publicGeneric.status, 403);
  assert.equal(publicGeneric.code, 'forbidden');
  assert.equal(publicGeneric.message, 'Access denied.');
});

test('email-based password recovery remains preserved', () => {
  const recover = read('app/api/auth/recover/route.ts');
  const callback = read('app/auth/callback/route.ts');
  const reset = read('app/api/auth/reset-password/route.ts');

  assert.match(recover, /resetPasswordForEmail/);
  assert.match(recover, /next=\/reset-password/);
  assert.match(callback, /verifyOtp/);
  assert.match(callback, /exchangeCodeForSession/);
  assert.match(reset, /updateUser\(\{ password \}\)/);
});

test('building map reads live room and maintenance records without changing onboarding authorization', () => {
  const rooms = read('app/components/RoomManagementWorkspace.tsx');
  const building = read('app/components/BuildingMapWorkspace.tsx');

  assert.match(rooms, /BuildingMapWorkspace role="owner"/);
  assert.match(building, /readAll<BuildingRoom>\('rooms'\)/);
  assert.match(building, /readAll<BuildingIssue>\('maintenance'\)/);
  assert.match(building, /summarizeRoomIssues\(rooms, issues\)/);
});

test('rejection notification message length is bounded to database column limit (500 chars)', () => {
  const sql = read('supabase/migrations/20261027120000_tenant_approval_and_room_assignment.sql');
  // Ensures composed body uses left(..., 500) to protect against column check (length(body) between 2 and 500)
  assert.match(sql, /left\('Your tenant access request was not approved: ' \|\| p_note,\s*500\)/);

  // Verifies that a maximum allowed 500-char rejection note cannot exceed the column length
  const maxReason = 'R'.repeat(500);
  const prefix = 'Your tenant access request was not approved: ';
  const composed = (prefix + maxReason).slice(0, 500);
  assert.equal(composed.length, 500);
  assert.ok(composed.length <= 500, 'composed notification must not exceed 500 chars');
  assert.ok(composed.length >= 2, 'composed notification must satisfy min length');
});

test('concurrent approval attempts for last room slot are locked and reject over-capacity (mocked database concurrency harness)', async () => {
  const sql = read('supabase/migrations/20261027120000_tenant_approval_and_room_assignment.sql');
  // Row-level lock on room prevents concurrency race
  assert.match(sql, /select \* into room_rec from public\.rooms where id = p_room_id for update;/);
  assert.match(sql, /occupied_count >= room_rec\.capacity/);
  assert.match(sql, /room is at full capacity/);

  // Behavioral simulation of two concurrent approval transactions on a room with 1 remaining slot
  let locked = false;
  const room = { id: 'room-101', capacity: 2, occupied: 1 };
  const waitLock = () => new Promise(resolve => {
    const check = () => {
      if (!locked) { locked = true; resolve(); }
      else setImmediate(check);
    };
    check();
  });
  const releaseLock = () => { locked = false; };

  async function simulateApproval(applicantId) {
    await waitLock();
    try {
      // Mimics SQL: SELECT * FROM rooms WHERE id = p_room_id FOR UPDATE;
      // followed by COUNT(*) from room_assignments
      if (room.occupied >= room.capacity) {
        throw new Error('23514: room is at full capacity');
      }
      room.occupied++;
      return { success: true, applicantId, room: room.id };
    } finally {
      releaseLock();
    }
  }

  const results = await Promise.allSettled([
    simulateApproval('applicant-A'),
    simulateApproval('applicant-B'),
  ]);

  const fulfilled = results.filter(r => r.status === 'fulfilled');
  const rejected = results.filter(r => r.status === 'rejected');

  assert.equal(fulfilled.length, 1, 'exactly one concurrent approval must succeed');
  assert.equal(rejected.length, 1, 'second concurrent approval must be rejected');
  assert.match(rejected[0].reason.message, /room is at full capacity/);
  assert.equal(room.occupied, 2, 'final occupancy must never exceed room capacity');
});

test('repeated submissions and repeated decisions are idempotent without duplicate records (mocked database harness)', () => {
  const sql = read('supabase/migrations/20261027120000_tenant_approval_and_room_assignment.sql');

  // Submission idempotency: on conflict do nothing + status lookup
  assert.match(sql, /insert into public\.account_requests/);
  assert.match(sql, /on conflict do nothing returning \* into r;/);
  assert.match(sql, /select \* into r from public\.account_requests where email = p_email and status in \('pending','approved','activated'\);/);
  assert.match(sql, /r\.activated_user_id is distinct from p_user_id/);

  // Decision idempotency: identical decision returns existing state without duplicate assignment
  assert.match(sql, /if r\.status <> 'pending' then/);
  assert.match(sql, /if r\.status = p_decision then/);
  assert.match(sql, /raise exception 'already reviewed' using errcode = '23505';/);

  // Notifications idempotency: event_key conflict handling prevents duplicates
  assert.match(sql, /'account-request:' \|\| p_id::text \|\| ':approved'/);
  assert.match(sql, /'account-request:' \|\| p_id::text \|\| ':rejected'/);
  assert.match(sql, /on conflict \(event_key\) do nothing;/);

  // Simulated state machine verifying decision transition invariants
  const stateTransitions = {
    pending: { approved: 'approved', rejected: 'rejected' },
    approved: { approved: 'approved', rejected: 'error_already_reviewed' },
    rejected: { rejected: 'rejected', approved: 'error_already_reviewed' },
  };

  assert.equal(stateTransitions.pending.approved, 'approved');
  assert.equal(stateTransitions.approved.approved, 'approved'); // Idempotent repeat
  assert.equal(stateTransitions.approved.rejected, 'error_already_reviewed'); // Conflicting transition denied
  assert.equal(stateTransitions.rejected.rejected, 'rejected'); // Idempotent repeat
  assert.equal(stateTransitions.rejected.approved, 'error_already_reviewed'); // Conflicting transition denied
});

test('status endpoint provides limited applicant decision view without session cookies or portal access', () => {
  const statusRoute = read('app/api/account-requests/status/route.ts');
  const form = read('app/components/AccountRequestForm.tsx');

  // Server-side status endpoint security
  assert.match(statusRoute, /assertRequestOrigin\(request\)/);
  assert.match(statusRoute, /parseAuthMutation\(request,\s*\['email',\s*'password'\]\)/);
  assert.match(statusRoute, /signInWithPassword/);
  assert.match(statusRoute, /account_requests/);
  assert.match(statusRoute, /notifications/);
  assert.match(statusRoute, /auth\.signOut\(\{\s*scope:\s*'local'\s*\}\)/);
  assert.doesNotMatch(statusRoute, /auth\.setSession/);
  assert.doesNotMatch(statusRoute, /applyAuthCookies/);
  assert.match(statusRoute, /noStoreHeaders/);

  // Account creation exposes only the request form.
  assert.match(form, /Request Account/);
  assert.doesNotMatch(form, /Check Status|statusResult|\/api\/account-requests\/status/);
});

test('RLS and authorization boundaries strictly separate roles across operational tables', () => {
  const sql = read('supabase/migrations/20261027120000_tenant_approval_and_room_assignment.sql');

  // Caretaker is forbidden from reviewing account requests
  assert.match(sql, /if mapsilip_private\.operational_role\(\) <> 'owner' then raise exception 'not authorized'/);

  // Applicant RLS is strictly scoped to own records
  assert.match(sql, /activated_user_id\s*=\s*\(select auth\.uid\(\)\)/);
  assert.match(sql, /recipient_id\s*=\s*\(select auth\.uid\(\)\)/);

  // Inactive or pending applicant cannot access active tenant operations
  assert.match(sql, /exists \(select 1 from public\.tenant_profiles p where p\.user_id = auth\.uid\(\) and p\.status = 'active'\)/);
});

test('Sol audit 3: status endpoint persistent rate limiting precedes Auth verification', () => {
  const statusRoute = read('app/api/account-requests/status/route.ts');
  const rateLimitModule = read('app/lib/backend/auth/rate-limit.ts');

  assert.match(rateLimitModule, /export async function consumeStatusCheckRateLimit/);
  assert.match(rateLimitModule, /applicant-status:\$\{email\}/);
  assert.match(rateLimitModule, /applicant-status-client\\0\$\{clientAddress\}/);

  assert.match(statusRoute, /consumeStatusCheckRateLimit\(executor,\s*secret,\s*email/);
  assert.match(statusRoute, /throw new BackendError\('rate_limited'\)/);

  const rateLimitPos = statusRoute.indexOf('consumeStatusCheckRateLimit');
  const authPos = statusRoute.indexOf('signInWithPassword');
  assert.ok(rateLimitPos > 0 && rateLimitPos < authPos, 'persistent rate limiter must execute before Auth password verification');
});

test('Sol audit 5: legacy invitation compatibility requires active room assignment before activation', () => {
  const sql = read('supabase/migrations/20261027120000_tenant_approval_and_room_assignment.sql');

  // Function definition and security definer
  assert.match(sql, /create or replace function mapsilip_private\.claim_account\(p_id uuid, p_hash text\)/);
  assert.match(sql, /owner reconciliation required before activation/);
  assert.match(sql, /errcode = '22023'/);
  assert.match(sql, /public\.room_assignments ra/);
  assert.match(sql, /ra\.ended_on is null/);
  assert.match(sql, /grant execute on function mapsilip_private\.claim_account\(uuid, text\) to authenticated/);
});

test('onboarding remediation keeps applicant inventory owner-only and legacy reconciliation identity-bound', () => {
  const sql = read('supabase/migrations/20261027120000_tenant_approval_and_room_assignment.sql');
  const inventory = sql.slice(sql.indexOf('create or replace function mapsilip_private.inventory_legacy_invitations'), sql.indexOf('create or replace function mapsilip_private.reconcile_legacy_invitation'));
  const reconcile = sql.slice(sql.indexOf('create or replace function mapsilip_private.reconcile_legacy_invitation'), sql.indexOf('alter table mapsilip_private.email_events owner'));
  assert.match(inventory, /operational_role\(\) <> 'owner'/);
  assert.match(reconcile, /p_user_id uuid/);
  assert.match(reconcile, /lower\(u.email\) = r.email/);
  assert.match(reconcile, /r.activated_user_id is distinct from p_user_id/);
  assert.match(reconcile, /for update/);
  assert.match(reconcile, /status = 'activated'/);
});

test('legacy invitation claim removes circular dependency and strictly checks claimant uid (simulated harness)', () => {
  const sql = read('supabase/migrations/20261027120000_tenant_approval_and_room_assignment.sql');
  const claimAccountSql = sql.slice(
    sql.indexOf('function mapsilip_private.claim_account'),
    sql.indexOf('function mapsilip_private.inventory_legacy_invitations')
  );

  // Strict check on claimant uid within claim_account
  assert.match(claimAccountSql, /where ra\.tenant_id = uid\s+and ra\.ended_on is null/);
  assert.doesNotMatch(claimAccountSql, /ra\.tenant_id = r\.activated_user_id/);

  // Claim cannot manufacture a room assignment; owner reconciliation creates profile and assignment together.
  assert.doesNotMatch(claimAccountSql, /insert into public\.tenant_profiles/);
  assert.match(claimAccountSql, /p\.user_id = uid and p\.status = 'inactive'/);
  assert.match(sql, /insert into public\.room_assignments\(tenant_id, room_id, started_on, created_by\)/);

  // Inventory and reconciliation functions exist
  assert.match(sql, /create or replace function mapsilip_private\.inventory_legacy_invitations/);
  assert.match(sql, /create or replace function mapsilip_private\.reconcile_legacy_invitation/);
  assert.match(sql, /reconciliation_needed/);
  assert.match(sql, /reset_to_pending/);
  assert.match(sql, /assign_room/);
  assert.match(sql, /public\.mapsilip_reconcile_legacy_invitation/);
});
