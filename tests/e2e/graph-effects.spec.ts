import { expect, test } from '@playwright/test';

/* Bloom postprocessing loads lazily and only on the 'full' tier. Assert against
 * the tier the runtime actually detected (CI runners have few cores and land on
 * 'lite' even for the desktop project — correctly, by design). */

test('bloom chunk downloads exactly when the detected tier is full', async ({ page }) => {
  const bloomRequests: string[] = [];
  page.on('request', (req) => {
    if (/bloom/i.test(req.url())) bloomRequests.push(req.url());
  });

  await page.goto('/');
  await page.evaluate(() =>
    document.querySelector('.graph-box')!.scrollIntoView({ block: 'center', behavior: 'instant' }),
  );
  await expect(page.locator('.skill-graph-canvas canvas')).toBeVisible({ timeout: 15000 });
  await page.waitForTimeout(2000);

  const tier = await page.evaluate(() => window.__graphDebug!.tier);
  if (tier === 'full') {
    expect(bloomRequests.length).toBeGreaterThan(0);
  } else {
    expect(bloomRequests).toEqual([]);
  }
});
