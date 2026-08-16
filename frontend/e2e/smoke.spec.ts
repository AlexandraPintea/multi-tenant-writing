import { expect, test } from '@playwright/test';

import { ALEXANDRA, ROAM } from '../playwright.config';

/**
 * One codebase, two sites. These assert the tenant actually changes what is
 * served — theme and metadata — which no unit test can prove, because the
 * tenant is decided by a header on a real request.
 *
 * Layout is no longer among them. These two specs used to load "/" and check
 * that alexandrapintea.eu rendered app-editorial-layout while roamliterary.com
 * rendered app-grid-layout. The root now redirects to /writings (see
 * app.routes.ts), which leaves SiteHomeComponent and both layouts unreachable,
 * so the assertions were testing a screen the app no longer has. The theme is
 * checked on the page a reader actually lands on instead — and if the home
 * route ever comes back, the layout coverage should come back with it.
 */

test('alexandrapintea.eu serves its own theme', async ({ page }) => {
  await page.goto(`${ALEXANDRA}/writings`);

  // theme_config is applied as CSS custom properties on <html>.
  const accent = await page.evaluate(() =>
    getComputedStyle(document.documentElement).getPropertyValue('--accent').trim(),
  );
  expect(accent).toBe('#5b3a29');
});

test('roamliterary.com serves its own theme', async ({ page }) => {
  await page.goto(`${ROAM}/writings`);

  const accent = await page.evaluate(() =>
    getComputedStyle(document.documentElement).getPropertyValue('--accent').trim(),
  );
  expect(accent).toBe('#8e44ad');
});

test('each tenant reports itself in the metadata', async ({ page }) => {
  await page.goto(`${ALEXANDRA}/writings`);
  await expect(page).toHaveTitle(/Writings · Alexandra Pintea/);
  await expect(page.locator('meta[property="og:site_name"]')).toHaveAttribute(
    'content',
    'Alexandra Pintea',
  );

  await page.goto(`${ROAM}/`);
  await expect(page.locator('meta[property="og:site_name"]')).toHaveAttribute(
    'content',
    'Roam Literary',
  );
});

test('the two tenants show different archives', async ({ page }) => {
  await page.goto(`${ALEXANDRA}/writings`);
  await expect(page.getByRole('heading', { name: 'The Power of Words' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Writing in the Margins' })).toBeVisible();

  // The English-only piece is published to alexandrapintea.eu only.
  await page.goto(`${ROAM}/writings`);
  await expect(page.getByRole('heading', { name: 'The Power of Words' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Writing in the Margins' })).toHaveCount(0);
});

test('the language toggle is absent on the single-language site', async ({ page }) => {
  await page.goto(`${ROAM}/`);
  await expect(page.locator('.language-toggle')).toHaveCount(0);

  await page.goto(`${ALEXANDRA}/`);
  await expect(page.locator('.language-toggle')).toBeVisible();
});
