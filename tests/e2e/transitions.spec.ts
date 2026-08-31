import { expect, test } from '@playwright/test';

test.describe('view transitions', () => {
  test('navigate to a project and back: islands and scripts survive', async ({
    page,
    browserName,
  }) => {
    const errors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(msg.text());
    });
    page.on('pageerror', (e) => errors.push(String(e)));

    await page.goto('/');
    await page.locator('[data-project] h3 a').first().click();
    await expect(page.locator('article.project h1')).toBeVisible();

    await page.goBack();
    await expect(page.getByRole('heading', { level: 1, name: 'Viren Sawant' })).toBeVisible();

    // page scripts re-bound: chips still filter after the round trip
    await page.locator('[data-skill-chip="elixir"]').click();
    await expect(page.locator('[data-project][aria-hidden="true"]')).toHaveCount(2);
    await page.keyboard.press('Escape');
    await expect(page.locator('[data-project][aria-hidden="true"]')).toHaveCount(0);

    // the graph island re-mounts after navigation
    if (browserName === 'chromium') {
      await page.evaluate(() =>
        document.querySelector('.graph-box')!.scrollIntoView({ block: 'center' }),
      );
      await expect(page.locator('.skill-graph-canvas canvas')).toBeVisible({ timeout: 15000 });
    }

    expect(errors).toEqual([]);
  });
});
