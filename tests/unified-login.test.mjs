import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const read = path => readFileSync(path, 'utf8');

test('one login form dispatches automatically to the trusted staff or tenant resolver', () => {
  const page = read('app/login/page.tsx');
  const preview = read('app/components/AuthPreview.tsx');
  const forms = read('app/components/StaffAuthForms.tsx');
  const route = read('app/api/auth/signin/route.ts');
  assert.match(page, /AuthPreview/);
  assert.doesNotMatch(preview, /TenantLoginForm|StaffLoginForm|tenant\s*\?/);
  assert.match(forms, /export function LoginForm\(/);
  assert.match(forms, /fetch\("\/api\/auth\/signin"/);
  assert.doesNotMatch(forms, /api\/tenant\/auth\/signin/);
  assert.match(route, /staffSignIn/);
  assert.match(route, /tenantSignIn/);
  assert.doesNotMatch(route, /role.*request|request.*role/i);
});

test('automatic redirects cover owner, caretaker, tenant, and restricted staff', () => {
  const service = read('app/lib/backend/auth/service.ts');
  assert.match(service, /destinationFor/);
  assert.match(service, /'\/management'/);
  assert.match(service, /'\/caretaker'/);
  assert.match(service, /'\/auth\/change-password'/);
  const route = read('app/api/auth/signin/route.ts');
  assert.match(route, /tenantSignIn\(input\.email/);
});

test('first-login password change enforces the shared 8-character policy in UI and server logic', () => {
  const forms = read('app/components/StaffAuthForms.tsx');
  const service = read('app/lib/backend/auth/service.ts');
  assert.match(forms, /newPassword\.length < 8/);
  assert.match(forms, /minLength=\{8\}/);
  assert.match(forms, /Use at least 8 characters/);
  assert.match(service, /input\.newPassword\.length < 8/);
});

test('unified login does not label a generic forbidden response as staff-only', () => {
  const forms = read('app/components/StaffAuthForms.tsx');
  assert.doesNotMatch(forms, /Staff access could not be confirmed/);
  assert.match(forms, /Sign-in could not be authorized/);
  assert.match(forms, /code === "rate_limited"/);
  assert.match(forms, /Too many recent attempts/);
});

test('unmapped staff falls through to tenant verification without persisting an unverified session', () => {
  const service = read('app/lib/backend/auth/service.ts');
  const route = read('app/api/auth/signin/route.ts');
  assert.match(service, /kind:\s*'unmapped'/);
  assert.match(route, /result\.kind\s*!==\s*'unmapped'/);
  const tenant = read('app/lib/backend/tenant-auth.ts');
  assert.match(tenant, /\.eq\('user_id',\s*user\.id\)/);
  assert.ok(tenant.indexOf(".eq('user_id', user.id)") < tenant.indexOf('auth.setSession('));
  assert.match(tenant, /auth\.signOut\(\{\s*scope:\s*'local'/);
});

test('all obsolete tenant login and recovery URLs return to the shared auth experience', () => {
  assert.match(read('app/tenant-login/page.tsx'), /redirect\(['"]\/login['"]\)/);
  assert.match(read('app/tenant-forgot-password/page.tsx'), /redirect\(['"]\/forgot-password['"]\)/);
  assert.match(read('app/tenant-reset-password/page.tsx'), /redirect\(['"]\/reset-password['"]\)/);
  const layout = read('app/tenant/layout.tsx');
  assert.match(layout, /redirect\("\/login"\)/);
  const tenant = read('app/lib/backend/tenant.ts');
  assert.match(tenant, /redirect\('\/login'\)/);
});

test('one shared recovery endpoint and callback accept password reset only through a fixed path', () => {
  const recovery = read('app/api/auth/recover/route.ts');
  const callback = read('app/auth/callback/route.ts');
  const reset = read('app/api/auth/reset-password/route.ts');
  assert.match(recovery, /resetPasswordForEmail/);
  assert.match(recovery, /next=\/reset-password/);
  assert.match(callback, /\['\/reset-password', '\/login', '\/activate'\]/);
  assert.match(reset, /updateUser\(\{ password \}\)/);
  assert.match(reset, /signOut\(\{\s*scope:\s*'global'/);
});

