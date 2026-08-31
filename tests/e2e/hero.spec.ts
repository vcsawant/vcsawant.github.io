import { expect, test } from '@playwright/test';

test.describe('hero particles', () => {
  test.skip(({ browserName }) => browserName !== 'chromium', 'webgl-dependent');

  test('canvas mounts behind the hero text and animates', async ({ page }) => {
    await page.goto('/');
    const canvas = page.locator('[data-hero-canvas] canvas');
    await expect(canvas).toBeVisible({ timeout: 15000 });
    // text stays on top and interactive
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(page.locator('.hero .cta.primary')).toBeVisible();
    const f0 = await page.evaluate(() => window.__heroDebug?.frames ?? 0);
    await page.waitForTimeout(600);
    const f1 = await page.evaluate(() => window.__heroDebug?.frames ?? 0);
    expect(f1).toBeGreaterThan(f0);
  });

  test('render loop pauses when scrolled away', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('[data-hero-canvas] canvas')).toBeVisible({ timeout: 15000 });
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(500); // let the IO unobserve settle
    const f0 = await page.evaluate(() => window.__heroDebug?.frames ?? 0);
    await page.waitForTimeout(700);
    const f1 = await page.evaluate(() => window.__heroDebug?.frames ?? 0);
    expect(f1).toBe(f0);
  });
});

test.describe('hero reduced motion', () => {
  test.use({ contextOptions: { reducedMotion: 'reduce' } });

  test('no particle canvas, no .bin fetch, static hero remains', async ({ page }) => {
    const binRequests: string[] = [];
    page.on('request', (req) => {
      if (req.url().includes('morph-targets')) binRequests.push(req.url());
    });
    await page.goto('/');
    await page.waitForTimeout(2000);
    await expect(page.locator('[data-hero-canvas] canvas')).toHaveCount(0);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    expect(binRequests).toEqual([]); // reduced motion never downloads the 900KB binary
  });
});
