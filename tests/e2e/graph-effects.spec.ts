import { expect, test } from '@playwright/test';

/* Bloom postprocessing loads lazily and only on the 'full' tier.
 * Desktop (full) downloads the bloom chunk; mobile (small screen -> lite) must not. */

test('bloom chunk downloads on desktop, never on mobile tier', async ({ page }, testInfo) => {
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

  const isMobile = testInfo.project.name === 'mobile';
  if (isMobile) {
    expect(bloomRequests).toEqual([]);
  } else {
    expect(bloomRequests.length).toBeGreaterThan(0);
  }
});
