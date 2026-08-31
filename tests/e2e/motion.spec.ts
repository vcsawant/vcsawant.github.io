import { expect, test } from '@playwright/test';

test.describe('motion layer', () => {
  test('gsap chunk loads lazily and the hero parallax engages', async ({ page }) => {
    const motionRequests: string[] = [];
    page.on('request', (req) => {
      if (/motion\.|gsap/i.test(req.url())) motionRequests.push(req.url());
    });
    await page.goto('/');
    await page.waitForTimeout(3500); // requestIdleCallback timeout ceiling
    expect(motionRequests.length).toBeGreaterThan(0);

    // parallax: scrolling toward the work section transforms the hero copy
    await page.evaluate(() =>
      document.querySelector('#work')!.scrollIntoView({ behavior: 'instant' }),
    );
    await page.waitForTimeout(400);
    const style = await page
      .locator('.hero-copy')
      .evaluate((el) => (el as HTMLElement).style.transform);
    expect(style).not.toBe('');
  });

  test('scroll-driven CSS animations are ALIVE in the built output', async ({ page }) => {
    // Positive liveness check: the A6 audit caught the minifier silently
    // killing every animation-timeline declaration while all our
    // absence-assertions kept passing vacuously. Never again.
    await page.goto('/');
    const names = await page.evaluate(() =>
      document.getAnimations().map((a) => (a as CSSAnimation).animationName),
    );
    expect(names).toContain('bar-grow'); // scroll(root) progress bar
    await page.evaluate(() =>
      document.querySelector('#work')!.scrollIntoView({ behavior: 'instant' }),
    );
    await page.waitForTimeout(300);
    const namesAtWork = await page.evaluate(() =>
      document.getAnimations().map((a) => (a as CSSAnimation).animationName),
    );
    expect(namesAtWork).toContain('rise-in'); // card reveals near the viewport
  });

  test('reveals leave no inline styles that could fight the filter system', async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() =>
      document.querySelector('#skills')!.scrollIntoView({ behavior: 'instant' }),
    );
    await page.waitForTimeout(500);
    // cards were revealed by CSS timelines (or not at all) — never inline styles
    for (const card of await page.locator('[data-project]').all()) {
      expect(await card.evaluate((el) => (el as HTMLElement).style.cssText)).toBe('');
    }
    // filtering still fully works after any reveals ran
    await page.locator('[data-skill-chip="elixir"]').click();
    const filtered = page.locator('[data-project].is-filtered').first();
    await expect(filtered).toHaveCSS('opacity', '0.15');
  });
});

test.describe('motion layer under reduced motion', () => {
  test.use({ contextOptions: { reducedMotion: 'reduce' } });

  test('gsap never downloads; no scroll-driven animations run', async ({ page }) => {
    const motionRequests: string[] = [];
    page.on('request', (req) => {
      if (/motion\.|gsap/i.test(req.url())) motionRequests.push(req.url());
    });
    await page.goto('/');
    await page.waitForTimeout(3500);
    expect(motionRequests).toEqual([]);
    const animCount = await page.evaluate(() => document.getAnimations().length);
    expect(animCount).toBe(0);
    // content fully visible without any of it
    await expect(page.locator('[data-project]').first()).toBeVisible();
  });
});
