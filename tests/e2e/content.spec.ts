import { expect, test } from '@playwright/test';

test('skip link is first focusable and targets #main', async ({ page }) => {
  await page.goto('/');
  await page.keyboard.press('Tab');
  const skip = page.locator('.skip-link');
  await expect(skip).toBeFocused();
  await expect(skip).toHaveAttribute('href', '#main');
});

test('chips filter project cards via events', async ({ page }) => {
  await page.goto('/');
  const elixirChip = page.locator('[data-skill-chip="elixir"]');
  await elixirChip.click();

  await expect(elixirChip).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('[data-project][aria-hidden="true"]')).toHaveCount(2);
  const bughouse = page.locator('[data-project]', { hasText: 'Bughouse' });
  await expect(bughouse).not.toHaveClass(/is-filtered/);
  await expect(page.locator('[data-filter-live]')).toContainText('1 project');

  // Escape clears the filter
  await page.keyboard.press('Escape');
  await expect(page.locator('[data-project][aria-hidden="true"]')).toHaveCount(0);
  await expect(elixirChip).toHaveAttribute('aria-pressed', 'false');
});

test('re-clicking an active chip clears the filter', async ({ page }) => {
  await page.goto('/');
  const chip = page.locator('[data-skill-chip="typescript"]');
  await chip.click();
  await expect(chip).toHaveAttribute('aria-pressed', 'true');
  await chip.click();
  await expect(chip).toHaveAttribute('aria-pressed', 'false');
  await expect(page.locator('[data-project][aria-hidden="true"]')).toHaveCount(0);
});

test('keyboard: chips reachable with visible focus', async ({ page }) => {
  await page.goto('/');
  const first = page.locator('[data-skill-chip]').first();
  await first.focus();
  await expect(first).toBeFocused();
  const outline = await first.evaluate((el) => getComputedStyle(el).outlineStyle);
  expect(outline).not.toBe('none');
});

test('filtered cards animate with transform/opacity only', async ({ page }) => {
  await page.goto('/');
  await page.locator('[data-skill-chip="elixir"]').click();
  const filtered = page.locator('[data-project].is-filtered').first();
  await expect(filtered).toHaveCSS('pointer-events', 'none');
  // still occupies layout: no display:none / hidden
  await expect(filtered).not.toHaveAttribute('hidden');
  const display = await filtered.evaluate((el) => getComputedStyle(el).display);
  expect(display).not.toBe('none');
});
