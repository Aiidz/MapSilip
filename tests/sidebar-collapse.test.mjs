import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const shell = readFileSync('app/components/AppShell.tsx', 'utf8');
const css = readFileSync('app/globals.css', 'utf8');
const sidebar = shell.slice(shell.indexOf('function DesktopSidebar'), shell.indexOf('function PortalPageContent'));
const appShell = shell.slice(shell.indexOf('export function AppShell'));

test('desktop sidebar collapses by dragging or clicking blank space without adding a toggle button', () => {
  assert.ok(sidebar.includes('useState(false)'));
  assert.ok(shell.includes('data-sidebar-collapsed={collapsed}'));
  assert.ok(sidebar.includes('onPointerDown={handlePointerDown}'));
  assert.ok(sidebar.includes('onPointerUp={handlePointerUp}'));
  assert.ok(sidebar.includes('onClick={handleBackgroundClick}'));
  assert.ok(!sidebar.includes('className="sidebar-toggle"'));
  assert.ok(shell.includes('title={collapsed ? item.label : undefined}'));
  assert.ok(!appShell.includes('useState('), 'collapse state must not re-render dashboard content');
});

test('sidebar collapse animates only on desktop and respects reduced motion', () => {
  assert.match(css, /\.desktop-sidebar\[data-sidebar-collapsed="true"\]/);
  assert.match(css, /@media \(min-width: 1000px\)/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)[\s\S]*?\.desktop-sidebar[\s\S]*?transition:\s*none/);
});
