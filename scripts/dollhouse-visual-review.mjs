// Isolated renderer checks with synthetic records; never signs in or writes backend data.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const require = createRequire(import.meta.url);
const root = fileURLToPath(new URL('../', import.meta.url));
const ts = require('typescript');
for (const extension of ['.ts', '.tsx']) {
  require.extensions[extension] = (module, filename) => module._compile(ts.transpileModule(
    readFileSync(filename, 'utf8'), { compilerOptions: {
      module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022,
    } },
  ).outputText, filename);
}
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const { DollhouseBuilding } = require('../app/components/DollhouseBuilding.tsx');
const { IsometricBuilding } = require('../app/components/IsometricBuilding.tsx');
const noop = () => {};
const floors = ['1st Floor', '2nd Floor', '3rd Floor'].map((label, floor) => ({
  label, rooms: Array.from({ length: 8 }, (_, i) => ({
    id: `fixture-${floor}-${i}`, room_number: `${floor+1}0${i+1}`,
    floor_label: label, capacity: 4, availability: 'available',
  })),
}));
const props = {
  floors, selectedFloor: null, visibleRooms: [], issues: new Map(), selectedRoomId: null,
  selectedSlotIndex: null, heatmap: false, zoom: 1, pan: { x: 0, y: 0 },
  onSelectFloor: noop, onSelectRoom: noop, onSelectRoomSpace: noop,
  onPointerDown: noop, onPointerMove: noop, onPointerUp: noop,
  roofVisible: true, occupancy: new Map(),
};
const output = process.env.DOLLHOUSE_REVIEW_DIR ?? '/tmp/mapsilip-dollhouse-review';
mkdirSync(output, { recursive: true });
const css = readFileSync(path.join(root, 'app/globals.css'), 'utf8');
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ colorScheme: 'dark', reducedMotion: 'reduce' });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  for (const width of [390, 1200]) {
    await page.setViewportSize({ width, height: 760 });
    for (const scenario of ['all', 'isolated', 'maintenance', '2d']) {
      const isolated = scenario !== 'all';
      const values = { ...props,
        selectedFloor: isolated ? floors[1].label : null,
        visibleRooms: isolated ? floors[1].rooms : [],
        roofVisible: scenario !== 'isolated',
        heatmap: scenario === 'maintenance',
        selectedRoomId: scenario === 'maintenance' ? 'fixture-1-0' : null,
        issues: scenario === 'maintenance'
          ? new Map([['fixture-1-0', {status:'pending',openCount:2,totalCount:3,issues:[]}]]) : new Map(),
      };
      const markup = renderToStaticMarkup(React.createElement(
        scenario === '2d' ? IsometricBuilding : DollhouseBuilding, values,
      ));
      await page.setContent(`<style>${css}
        body{margin:0;background:#252b2c;color:#e8ddc9}
        .isometric-building{width:100%;height:642px}
        .review-caption{padding:12px;font:12px system-ui;text-align:center}
        @media(max-width:699px){.isometric-building{height:562px}}
        </style>${markup}<p class="review-caption">Renderer check · synthetic records<br>Illustrative layout — actual floor plan pending.</p>`);
      const misses = await page.evaluate(() => Array.from(document.querySelectorAll('[data-room-id]')).flatMap(room => {
        const tile = room.querySelector('.iso-tile');
        const box = tile.getBBox();
        const point = new DOMPoint(box.x+box.width/2, box.y+box.height/2).matrixTransform(tile.getScreenCTM());
        const hit = document.elementFromPoint(point.x, point.y)?.closest('[data-room-id]');
        return hit?.getAttribute('data-room-id') === room.getAttribute('data-room-id') ? [] : [room.getAttribute('data-room-id')];
      }));
      assert.deepEqual(misses, [], `${width}px ${scenario}: room centers must not be obstructed`);
      assert.equal(await page.locator('[data-room-id]').count(), isolated ? 8 : 24);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
      if (scenario === 'maintenance') {
        assert.equal(await page.locator('.iso-issue-marker').count(), 0);
        assert.equal(await page.locator('.iso-heatmap-box--pending').count(), 1);
        assert.equal(await page.locator('[data-room-id="fixture-1-0"]').getAttribute('aria-pressed'), 'true');
      }
      await page.locator('[data-room-id]').first().focus();
      assert.equal(await page.evaluate(() => document.activeElement?.hasAttribute('data-room-id')), true);
      await page.locator('[data-room-id]').first().evaluate(element => element.blur());
      await page.screenshot({ path: path.join(output, `${scenario}-${width}.png`) });
      console.log(`PASS ${scenario}, ${width}px: IDs, unobstructed room centers, focus, no horizontal overflow`);
    }
  }
  assert.deepEqual(errors, []);
  // Protected application smoke check only; no claim of live-data verification without a session.
  try {
    await page.goto(`${process.env.VISUAL_REVIEW_URL ?? 'http://localhost:3000'}/management/rooms`);
    console.log(`Application route reached: ${new URL(page.url()).pathname}`);
  } catch (error) {
    console.log(`Application route unavailable: ${error.message}`);
  }
  console.log(`Screenshots: ${output}. SSR fixture checks do not exercise React callbacks or authenticated workflows.`);
} finally {
  await browser.close();
}
