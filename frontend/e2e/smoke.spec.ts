import { expect, test } from '@playwright/test';

import { ALEXANDRA, ROAM } from '../playwright.config';

/**
 * One codebase, two sites. These assert the tenant actually changes what is
 * served — theme, layout and metadata — which no unit test can prove, because
 * the tenant is decided by a header on a real request.
 */

test('alexandrapintea.eu serves the editorial layout and its own theme', async ({ page }) => {
  await page.goto(`${ALEXANDRA}/`);

  await expect(page.locator('app-editorial-layout')).toBeVisible();
  await expect(page.locator('app-grid-layout')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Alexandra Pintea' })).toBeVisible();

  // theme_config is applied as CSS custom properties on <html>.
  const accent = await page.evaluate(() =>
    getComputedStyle(document.documentElement).getPropertyValue('--accent').trim(),
  );
  expect(accent).toBe('#5b3a29');
});

test('roamliterary.com serves the author grid and its own theme', async ({ page }) => {
  await page.goto(`${ROAM}/`);

  await expect(page.locator('app-grid-layout')).toBeVisible();
  await expect(page.locator('app-editorial-layout')).toHaveCount(0);

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
