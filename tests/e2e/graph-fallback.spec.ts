import { expect, test } from '@playwright/test';

/* Global constraint: WebGL2 is feature-detected; on failure the SVG stays and a
 * recruiter never sees a black rectangle. Reduced motion gets the static render. */

test.describe('webgl available', () => {
  test('canvas mounts on scroll, svg fades but stays in DOM', async ({ page, browserName }) => {
    test.skip(browserName !== 'chromium', 'webgl in headless is chromium-only here');
    await page.goto('/');
    await page.locator('.graph-box').scrollIntoViewIfNeeded();
    await expect(page.locator('.skill-graph-canvas canvas')).toBeVisible({ timeout: 15000 });
    await expect(page.locator('.graph-box')).toHaveClass(/is-webgl/);
    await expect(page.locator('.graph-svg')).toHaveCSS('opacity', '0', { timeout: 5000 });
    await expect(page.locator('.graph-svg')).toBeAttached();
  });
});

// The webgl-blocked case lives in graph-fallback-nowebgl.spec.ts (launchOptions
// must be file-level).

test.describe('reduced motion', () => {
  test.use({ contextOptions: { reducedMotion: 'reduce' } });

  test('static svg render, no canvas', async ({ page }) => {
    await page.goto('/');
    await page.locator('.graph-box').scrollIntoViewIfNeeded();
    await page.waitForTimeout(2500);
    await expect(page.locator('.skill-graph-canvas canvas')).toHaveCount(0);
    await expect(page.locator('.graph-svg')).toBeVisible();
  });
});
