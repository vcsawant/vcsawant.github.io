import { expect, test, type Page } from '@playwright/test';

async function openGraph(page: Page) {
  await page.goto('/');
  // block:'center' — scrollIntoViewIfNeeded can leave the box mostly below the
  // fold, putting the canvas center outside the viewport where clicks can't land
  await centerGraph(page);
  await expect(page.locator('.skill-graph-canvas canvas')).toBeVisible({ timeout: 15000 });
  // interaction handlers attach in effects after the canvas paints
  await page.waitForTimeout(300);
}

// Clicking a chip auto-scrolls the chip into view, pushing the canvas below the
// fold — always re-center (instantly, bypassing smooth-scroll) before canvas clicks.
const centerGraph = (page: Page) =>
  page.evaluate(() =>
    document.querySelector('.graph-box')!.scrollIntoView({ block: 'center', behavior: 'instant' }),
  );

const rotY = (page: Page) => page.evaluate(() => window.__graphDebug!.rotationY);
const focusId = (page: Page) => page.evaluate(() => window.__graphDebug!.focusId);

test.describe('drag and drift', () => {
  test.skip(({ browserName }) => browserName !== 'chromium', 'webgl-dependent');

  test('graph drifts on its own', async ({ page }) => {
    await openGraph(page);
    const r0 = await rotY(page);
    await page.waitForTimeout(1200);
    const r1 = await rotY(page);
    expect(r1).toBeGreaterThan(r0);
  });

  test('drag spins 1:1 and release keeps inertia', async ({ page }) => {
    await openGraph(page);
    const box = (await page.locator('.skill-graph-canvas canvas').boundingBox())!;
    const cx = box.x + box.width / 2;
    const cy = box.y + box.height / 2;

    const before = await rotY(page);
    await page.mouse.move(cx - 120, cy);
    await page.mouse.down();
    for (let i = 1; i <= 10; i++) await page.mouse.move(cx - 120 + i * 24, cy);
    await page.mouse.up();
    const after = await rotY(page);
    // 240px * 0.005 rad/px = 1.2 rad, far beyond drift alone
    expect(after - before).toBeGreaterThan(0.8);

    const atRelease = await rotY(page);
    await page.waitForTimeout(250);
    const later = await rotY(page);
    // inertia + drift keep it moving after release
    expect(later).toBeGreaterThan(atRelease);
  });

  test('vertical touch swipe over the canvas scrolls the page', async ({ page, browserName }) => {
    test.skip(browserName !== 'chromium', 'CDP-only');
    await openGraph(page);
    const box = (await page.locator('.skill-graph-canvas canvas').boundingBox())!;
    const client = await page.context().newCDPSession(page);
    const y0 = await page.evaluate(() => window.scrollY);
    // the graph sits low on the page, so on some viewports we're already at max
    // scroll — swipe in the direction that scrolls UP, always possible from here
    expect(y0).toBeGreaterThan(0);
    await client.send('Input.synthesizeScrollGesture', {
      x: Math.round(box.x + box.width / 2),
      y: Math.round(box.y + box.height / 2),
      yDistance: 300,
      speed: 800,
      gestureSourceType: 'touch',
    });
    await page.waitForTimeout(400);
    const y1 = await page.evaluate(() => window.scrollY);
    expect(y1).toBeLessThan(y0);
  });
});

test.describe('selection sync', () => {
  test.skip(({ browserName }) => browserName !== 'chromium', 'webgl-dependent');

  test('chip selection focuses the graph; Escape restores', async ({ page }) => {
    await openGraph(page);
    await page.locator('[data-skill-chip="elixir"]').click();
    await expect.poll(() => focusId(page)).toBe('elixir');
    await expect(page.locator('[data-project][aria-hidden="true"]')).toHaveCount(2);

    await page.keyboard.press('Escape');
    await expect.poll(() => focusId(page)).toBe(null);
    await expect(page.locator('[data-project][aria-hidden="true"]')).toHaveCount(0);
  });

  test('tapping the focused node on the canvas toggles it off', async ({ page }) => {
    await openGraph(page);
    await page.locator('[data-skill-chip="typescript"]').click();
    await expect.poll(() => focusId(page)).toBe('typescript');
    // the focused node pins to the origin — wait for the reorganization to settle
    await page.waitForTimeout(1200);
    await centerGraph(page);

    const box = (await page.locator('.skill-graph-canvas canvas').boundingBox())!;
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await expect.poll(() => focusId(page)).toBe(null);
    await expect(page.locator('[data-skill-chip="typescript"]')).toHaveAttribute(
      'aria-pressed',
      'false',
    );
  });
});
