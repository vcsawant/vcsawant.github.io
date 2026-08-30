import { expect, test } from '@playwright/test';

test.describe('hero fluid cursor', () => {
  test.skip(({ browserName }) => browserName !== 'chromium', 'webgl-dependent');

  test('pointer movement wakes the sim; it sleeps after input decays', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('[data-hero-canvas] canvas')).toBeVisible({ timeout: 15000 });
    await page.waitForTimeout(500);

    // sweep the pointer across the hero
    const hero = (await page.locator('.hero').boundingBox())!;
    await page.mouse.move(hero.x + 100, hero.y + hero.height / 2);
    for (let i = 1; i <= 12; i++) {
      await page.mouse.move(hero.x + 100 + i * 40, hero.y + hero.height / 2 + (i % 3) * 12);
    }
    const f1 = await page.evaluate(() => window.__fluidDebug?.frames ?? 0);
    expect(f1).toBeGreaterThan(0); // sim ticked during interaction

    // after ~2s without input the sim must be asleep (frames frozen) while the
    // morph loop is still running (hero frames keep advancing)
    await page.waitForTimeout(2200);
    const fluidA = await page.evaluate(() => window.__fluidDebug?.frames ?? -1);
    const heroA = await page.evaluate(() => window.__heroDebug?.frames ?? -1);
    await page.waitForTimeout(700);
    const fluidB = await page.evaluate(() => window.__fluidDebug?.frames ?? -1);
    const heroB = await page.evaluate(() => window.__heroDebug?.frames ?? -1);
    expect(fluidB).toBe(fluidA);
    expect(heroB).toBeGreaterThan(heroA);
  });
});
