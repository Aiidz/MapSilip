import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('ManagementConcernsWorkspace imports and integrates MobileDetailSurface for mobile drawer support', () => {
  const file = readFileSync('app/components/ManagementConcernsWorkspace.tsx', 'utf8');
  assert.match(
    file,
    /import\s+\{[^}]*MobileDetailSurface[^}]*\}\s+from\s+['"]\.\/MobileDetailSurface['"]/,
    'ManagementConcernsWorkspace must import MobileDetailSurface'
  );
  assert.match(
    file,
    /<MobileDetailSurface[\s\S]*?open=\{Boolean\(selected\)\}[\s\S]*?title="Concern Details"/,
    'ManagementConcernsWorkspace must wrap concern details in MobileDetailSurface with title "Concern Details"'
  );
});

test('ManagementConcernsWorkspace resolves tenant and room details for resident identity', () => {
  const file = readFileSync('app/components/ManagementConcernsWorkspace.tsx', 'utf8');
  assert.match(
    file,
    /ProfilePhoto/,
    'ManagementConcernsWorkspace should use ProfilePhoto for resident identity'
  );
  assert.match(
    file,
    /fetchOperationRows/,
    'ManagementConcernsWorkspace should fetch operational metadata (tenants, rooms, assignments)'
  );
});

test('ManagementConcernsWorkspace renders card-and-thread structure for full space utilization', () => {
  const file = readFileSync('app/components/ManagementConcernsWorkspace.tsx', 'utf8');
  assert.match(file, /concern-detail-header/, 'Has concern detail header');
  assert.match(file, /concern-status-badge/, 'Uses status badge pill');
  assert.match(file, /concern-body-thread/, 'Uses thread container');
  assert.match(file, /concern-thread-card--resident/, 'Renders resident concern card');
  assert.match(file, /concern-thread-card--management/, 'Renders management response card');
  assert.match(file, /concern-empty-response-prompt/, 'Provides response prompt when pending');
});

test('globals.css applies MOBILE_UI_GUIDE.md rules to mobile-record-details for concerns', () => {
  const css = readFileSync('app/globals.css', 'utf8');
  assert.match(
    css,
    /\.mobile-record-details\s+[^}]*\.concerns-details/,
    'globals.css must include dedicated mobile-record-details rules for concerns-details'
  );
  assert.match(
    css,
    /\.concerns-details\s+[^}]*caretaker-details-close\s*\{[^}]*display:\s*none/,
    'globals.css must hide inner close button in mobile sheet overlay'
  );
  assert.match(
    css,
    /\.concerns-request-row\s*\{[^}]*min-height:\s*76px/,
    'globals.css must specify 76px min-height for list rows per MOBILE_UI_GUIDE.md'
  );
  assert.match(
    css,
    /\.concerns-response-form\s+textarea\s*\{[^}]*font-size:\s*16px/,
    'globals.css must specify 16px font-size on textarea to avoid mobile browser zoom'
  );
  assert.match(
    css,
    /\.mobile-record-details\s+\.concern-respond-cta\s*\{[^}]*min-height:\s*44px/,
    'globals.css must specify 44px minimum touch target for primary action'
  );
});

test('CaretakerMaintenance renders unified concern-style UI for maintenance details in admin view', () => {
  const file = readFileSync('app/caretaker/CaretakerPages.tsx', 'utf8');
  assert.match(file, /concern-detail-header/, 'CaretakerMaintenance uses concern-detail-header');
  assert.match(file, /concern-body-thread/, 'CaretakerMaintenance uses concern-body-thread');
  assert.match(file, /concern-thread-card--resident/, 'CaretakerMaintenance renders resident request card');
  assert.match(file, /concern-thread-card--management/, 'CaretakerMaintenance renders staff update card');
  assert.match(file, /RequestAttachment/, 'CaretakerMaintenance embeds RequestAttachment component');
  assert.match(file, /fetchOperationRows/, 'CaretakerMaintenance fetches metadata for tenant & room identity');
  assert.match(file, /ProfilePhoto/, 'CaretakerMaintenance renders ProfilePhoto for tenant avatar');

  const css = readFileSync('app/globals.css', 'utf8');
  assert.match(css, /:is\(\.management-concerns,\s*\.maintenance-workspace\)\s+\.concerns-maintenance-layout/, 'globals.css scopes concerns-maintenance-layout to maintenance-workspace');
  assert.match(css, /\.concern-status-badge--in_progress/, 'globals.css defines in_progress status badge');
});
