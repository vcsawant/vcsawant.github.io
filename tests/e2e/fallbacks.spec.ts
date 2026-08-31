import { expect, test, type Page } from '@playwright/test';

/* Fallback matrix, webgl-AVAILABLE half (the webgl-blocked half lives in
 * fallbacks-nowebgl.spec.ts — launchOptions must be file-level).
 * Contract: a recruiter never sees a black rectangle, in any combination. */

const heroPoster = (page: Page) => page.locator('[data-hero-poster]');
const heroVideo = (page: Page) => page.locator('[data-hero-video]');
const graphVideo = (page: Page) => page.locator('[data-graph-video]');

test.describe('webgl available + motion ok', () => {
  test('canvas wins; poster and videos hidden', async ({ page, browserName }) => {
    test.skip(browserName !== 'chromium', 'webgl-dependent');
    await page.goto('/');
    await expect(page.locator('[data-hero-canvas] canvas')).toBeVisible({ timeout: 15000 });
    await expect(heroPoster(page)).toBeHidden();
    await expect(heroVideo(page)).toBeHidden();
    await expect(graphVideo(page)).toBeHidden();
  });
});

test.describe('webgl available + reduced motion', () => {
  test.use({ contextOptions: { reducedMotion: 'reduce' } });

  test('hero poster shown, no canvas, no videos', async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(1500);
    await expect(page.locator('[data-hero-canvas] canvas')).toHaveCount(0);
    await expect(heroPoster(page)).toBeVisible();
    await expect(heroVideo(page)).toBeHidden();
    await expect(graphVideo(page)).toBeHidden();
    await expect(page.locator('.graph-svg')).toBeVisible();
  });
});

test('no JavaScript: poster and SVG are the server-rendered defaults', async ({ browser }) => {
  const ctx = await browser.newContext({ javaScriptEnabled: false });
  const page = await ctx.newPage();
  await page.goto('/');
  await expect(heroPoster(page)).toBeVisible();
  await expect(heroVideo(page)).toBeHidden();
  await expect(page.locator('.graph-svg')).toBeVisible();
  await ctx.close();
});
