import { expect, test } from '@playwright/test';

const ROUTES = ['/styleguide'];

for (const route of ROUTES) {
  test(`renders #${route} without console errors`, async ({ page }) => {
    const errors: string[] = [];
    page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
    page.on('pageerror', (e) => errors.push(e.message));
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`/#${route}`);
    await expect(page.locator('h1')).toBeVisible();
    await page.screenshot({ path: `tests/screens${route.replace(/\//g, '_')}.png`, fullPage: true });
    expect(errors).toEqual([]);
  });
}
