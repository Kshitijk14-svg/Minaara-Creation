const { chromium } = require('playwright');
const SHOTS = 'C:\\Users\\kshit\\AppData\\Local\\Temp\\claude\\C--Users-kshit-OneDrive-Documents-Minaara-Creation-kurta-store\\6d8d4089-3559-4b8c-8ff8-ed9b17755828\\scratchpad\\shots3';
require('fs').mkdirSync(SHOTS, { recursive: true });

(async () => {
  const browser = await chromium.launch();

  // ── Mobile ──
  {
    const page = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto('http://localhost:3002/', { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(3200); // clear intro loader
    await page.screenshot({ path: `${SHOTS}/mobile_single_row.png` });

    await page.locator('button[aria-label="Open search"]').click();
    await page.waitForTimeout(600);
    await page.screenshot({ path: `${SHOTS}/mobile_search_open.png` });
    await page.keyboard.press('Escape');
    await page.waitForTimeout(400);

    await page.locator('button[aria-label="Open menu"]').click();
    await page.waitForTimeout(600);
    await page.screenshot({ path: `${SHOTS}/mobile_menu_open.png` });

    console.log('mobile errors:', JSON.stringify(errors));
    await page.close();
  }

  // ── Desktop ──
  {
    const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
    await page.goto('http://localhost:3002/', { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(3200);
    await page.screenshot({ path: `${SHOTS}/desktop.png` });
    const hamburgerVisible = await page.locator('button[aria-label="Open menu"]').isVisible().catch(() => false);
    const searchPillVisible = await page.locator('button[aria-label="Open search"]').isVisible().catch(() => false);
    console.log('desktop hamburger visible (expect false):', hamburgerVisible);
    console.log('desktop search-pill visible (expect false):', searchPillVisible);
    await page.close();
  }

  await browser.close();
  console.log('DONE');
})().catch((e) => { console.error('FAILED', e); process.exit(1); });
