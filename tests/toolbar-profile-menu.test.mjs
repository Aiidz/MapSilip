import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { chromium } from 'playwright';

test('profile menu buttons do not retain native button borders or gray fills', async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.setContent(`<style>${readFileSync('app/globals.css', 'utf8')}</style>
      <div class="toolbar-profile-menu is-open" style="position:fixed;inset:10px auto auto 10px">
        <button role="menuitem">Notification settings</button>
        <button role="menuitem">Log Out</button>
      </div>`);
    const styles = await page.locator('.toolbar-profile-menu button').evaluateAll(buttons => buttons.map(button => {
      const style = getComputedStyle(button);
      return { borderTopWidth: style.borderTopWidth, backgroundColor: style.backgroundColor };
    }));

    assert.deepEqual(styles, [
      { borderTopWidth: '0px', backgroundColor: 'rgba(0, 0, 0, 0)' },
      { borderTopWidth: '0px', backgroundColor: 'rgba(0, 0, 0, 0)' },
    ]);
  } finally {
    await browser.close();
  }
});
