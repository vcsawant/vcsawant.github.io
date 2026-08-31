import { expect, test } from '@playwright/test';

/* Fallback matrix, webgl-BLOCKED half. */
test.use({ launchOptions: { args: ['--disable-webgl', '--disable-webgl2'] } });

test('motion ok: WebM loops play for hero and graph, no black rectangles', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  await page.goto('/');
  await page.waitForTimeout(1500);

  const heroVideo = page.locator('[data-hero-video]');
  await expect(heroVideo).toBeVisible();
  await expect.poll(() => heroVideo.evaluate((v) => !(v as HTMLVideoElement).paused)).toBe(true);
  await expect(page.locator('[data-hero-poster]')).toBeHidden();

  await page.evaluate(() =>
    document.querySelector('.graph-box')!.scrollIntoView({ block: 'center' }),
  );
  const graphVideo = page.locator('[data-graph-video]');
  await expect(graphVideo).toBeVisible();
  await expect.poll(() => graphVideo.evaluate((v) => !(v as HTMLVideoElement).paused)).toBe(true);

  await expect(page.locator('.skill-graph-canvas canvas')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test.describe('reduced motion too', () => {
  test.use({ contextOptions: { reducedMotion: 'reduce' } });

  test('posters/SVG only — never video, never canvas', async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(1500);
    await expect(page.locator('[data-hero-poster]')).toBeVisible();
    await expect(page.locator('[data-hero-video]')).toBeHidden();
    await expect(page.locator('[data-graph-video]')).toBeHidden();
    await expect(page.locator('.graph-svg')).toBeVisible();
    await expect(page.locator('canvas')).toHaveCount(0);
  });
});
