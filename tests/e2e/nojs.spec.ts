import { expect, test } from '@playwright/test';

// Global constraint: full content legible and navigable with JavaScript disabled.
test.use({ javaScriptEnabled: false });

test('all content visible without JavaScript', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByRole('heading', { level: 1, name: 'Viren Sawant' })).toBeVisible();

  const cards = page.locator('[data-project]');
  await expect(cards).toHaveCount(3);
  for (const card of await cards.all()) {
    await expect(card).toBeVisible();
  }

  const chips = page.locator('[data-skill-chip]');
  expect(await chips.count()).toBeGreaterThan(5);
  await expect(chips.first()).toBeVisible();

  await expect(page.getByRole('navigation', { name: 'Site' })).toBeVisible();
  await expect(page.locator('.site-footer')).toBeVisible();
  await expect(page.locator('[data-graph-static]')).toBeVisible();
});

test('nav anchors resolve without JavaScript', async ({ page }) => {
  await page.goto('/');
  for (const target of ['#work', '#skills']) {
    await expect(page.locator(target)).toBeAttached();
  }
});

test('project page readable without JavaScript', async ({ page }) => {
  await page.goto('/projects/bughouse/');
  await expect(
    page.getByRole('heading', { level: 1, name: 'Multiplayer Bughouse Chess' }),
  ).toBeVisible();
});
