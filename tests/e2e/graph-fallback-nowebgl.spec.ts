import { expect, test } from '@playwright/test';

/* WebGL blocked at the browser level: the island must leave the SVG alone.
 * launchOptions forces a dedicated worker, hence the separate spec file. */
test.use({ launchOptions: { args: ['--disable-webgl', '--disable-webgl2'] } });

test('svg fallback remains, no canvas, no console errors', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  await page.goto('/');
  await page.locator('.graph-box').scrollIntoViewIfNeeded();
  // give the island time to hydrate and decide
  await page.waitForTimeout(2500);
  await expect(page.locator('.skill-graph-canvas canvas')).toHaveCount(0);
  await expect(page.locator('.graph-svg')).toBeVisible();
  await expect(page.locator('.graph-box')).not.toHaveClass(/is-webgl/);
  expect(errors).toEqual([]);
});
