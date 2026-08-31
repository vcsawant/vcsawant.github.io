import { expect, test, type Page } from '@playwright/test';

async function openGraph(page: Page) {
  await page.goto('/');
  // block:'center' — scrollIntoViewIfNeeded can leave the box mostly below the
  // fold, putting the canvas center outside the viewport where clicks can't land
  await centerGraph(page);
  await expect(page.locator('.skill-graph-canvas canvas')).toBeVisible({ timeout: 15000 });
  // interaction handlers attach in effects after the canvas paints; the lazy
  // bloom chunk (full tier) re-commits the scene once loaded — wait it out
  await page.waitForTimeout(900);
}

// Clicking a chip auto-scrolls the chip into view, pushing the canvas below the
// fold — always re-center (instantly, bypassing smooth-scroll) before canvas clicks.
const centerGraph = (page: Page) =>
  page.evaluate(() =>
    document.querySelector('.graph-box')!.scrollIntoView({ block: 'center', behavior: 'instant' }),
  );

const rotY = (page: Page) => page.evaluate(() => window.__graphDebug!.rotationY);
const focusId = (page: Page) => page.evaluate(() => window.__graphDebug!.focusId);

test.describe('drag and drift', () => {
  test.skip(({ browserName }) => browserName !== 'chromium', 'webgl-dependent');

  test('graph drifts on its own', async ({ page }) => {
    await openGraph(page);
    const r0 = await rotY(page);
    await page.waitForTimeout(1200);
    const r1 = await rotY(page);
    expect(r1).toBeGreaterThan(r0);
  });

  test('drag spins 1:1 and release keeps inertia', async ({ page }) => {
    await openGraph(page);
    const box = (await page.locator('.skill-graph-canvas canvas').boundingBox())!;
    const cx = box.x + box.width / 2;
    const cy = box.y + box.height / 2;

    const before = await rotY(page);
    await page.mouse.move(cx - 120, cy);
    await page.mouse.down();
    for (let i = 1; i <= 10; i++) await page.mouse.move(cx - 120 + i * 24, cy);
    await page.mouse.up();
    const after = await rotY(page);
    // 240px * 0.005 rad/px = 1.2 rad, far beyond drift alone
    expect(after - before).toBeGreaterThan(0.8);

    const atRelease = await rotY(page);
    await page.waitForTimeout(250);
    const later = await rotY(page);
    // inertia + drift keep it moving after release
    expect(later).toBeGreaterThan(atRelease);
  });

  test('touch contract: pan-y preserved, vertical released, horizontal rotates', async ({
    page,
  }) => {
    // CDP scroll-gesture synthesis is a no-op on headless Linux, so this tests
    // OUR side of the contract deterministically: touch-action stays pan-y (the
    // browser guarantee for native vertical scroll), vertical touch gestures are
    // given back (no rotation), horizontal ones spin the graph. Real scroll feel
    // is covered by the on-device pass (Task 7.3).
    await openGraph(page);
    await expect(page.locator('.skill-graph-canvas canvas')).toHaveCSS('touch-action', 'pan-y');

    const fire = (type: string, x: number, y: number) =>
      page.evaluate(
        ([type, x, y]) => {
          document.querySelector('.skill-graph-canvas canvas')!.dispatchEvent(
            new PointerEvent(type as string, {
              pointerId: 7,
              pointerType: 'touch',
              isPrimary: true,
              clientX: x as number,
              clientY: y as number,
              bubbles: true,
            }),
          );
        },
        [type, x, y] as const,
      );

    const r0 = await rotY(page);
    await fire('pointerdown', 200, 300);
    for (let i = 1; i <= 6; i++) await fire('pointermove', 200, 300 + i * 20);
    await fire('pointerup', 200, 420);
    const r1 = await rotY(page);
    expect(Math.abs(r1 - r0)).toBeLessThan(0.15); // drift only — gesture not captured

    await fire('pointerdown', 200, 300);
    for (let i = 1; i <= 10; i++) await fire('pointermove', 200 + i * 30, 300);
    await fire('pointerup', 500, 300);
    const r2 = await rotY(page);
    // 300px * 0.005 rad/px = 1.5 rad ideal; generous floor still ~3x the
    // vertical bound, so the two behaviors can't be confused
    expect(r2 - r1).toBeGreaterThan(0.45);
  });
});

test.describe('selection sync', () => {
  test.skip(({ browserName }) => browserName !== 'chromium', 'webgl-dependent');

  test('chip selection focuses the graph; Escape restores', async ({ page }) => {
    await openGraph(page);
    await page.locator('[data-skill-chip="elixir"]').click();
    await expect.poll(() => focusId(page)).toBe('elixir');
    await expect(page.locator('[data-project][aria-hidden="true"]')).toHaveCount(2);

    await page.keyboard.press('Escape');
    await expect.poll(() => focusId(page)).toBe(null);
    await expect(page.locator('[data-project][aria-hidden="true"]')).toHaveCount(0);
  });

  test('tapping the focused node on the canvas toggles it off', async ({ page }) => {
    await openGraph(page);
    await page.locator('[data-skill-chip="typescript"]').click();
    await expect.poll(() => focusId(page)).toBe('typescript');
    // the focused node pins to the origin — wait for the reorganization to settle
    await page.waitForTimeout(1200);
    await centerGraph(page);

    const box = (await page.locator('.skill-graph-canvas canvas').boundingBox())!;
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await expect.poll(() => focusId(page)).toBe(null);
    await expect(page.locator('[data-skill-chip="typescript"]')).toHaveAttribute(
      'aria-pressed',
      'false',
    );
  });
});

test.describe('pre-hydration selection replay', () => {
  test.skip(({ browserName }) => browserName !== 'chromium', 'webgl-dependent');

  test('a chip pressed before the island hydrates focuses the graph on mount', async ({ page }) => {
    await page.goto('/');
    // select while the graph (client:visible, below the fold) is not hydrated
    await page.locator('[data-skill-chip="elixir"]').click();
    await expect(page.locator('[data-project][aria-hidden="true"]')).toHaveCount(2);

    await centerGraph(page);
    await expect(page.locator('.skill-graph-canvas canvas')).toBeVisible({ timeout: 15000 });
    await expect.poll(() => focusId(page), { timeout: 5000 }).toBe('elixir');
  });
});
