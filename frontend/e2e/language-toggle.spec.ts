import { expect, test } from '@playwright/test';

import { ALEXANDRA } from '../playwright.config';

/**
 * The toggle switches content in place: no reload, no second URL tree
 * (requirements §3.3). That "in place" claim is only checkable end to end —
 * a unit test cannot tell you the URL stayed put or that no navigation happened.
 */

test('switching language swaps the content without changing the URL', async ({ page }) => {
  await page.goto(`${ALEXANDRA}/writings/the-power-of-words`);
  await expect(page.getByRole('heading', { name: 'The Power of Words' })).toBeVisible();

  const before = page.url();
  await page.locator('.language-toggle__option', { hasText: 'ro' }).click();

  await expect(page.getByRole('heading', { name: 'Puterea Cuvintelor' })).toBeVisible();
  expect(page.url()).toBe(before);
});

test('the choice survives a reload', async ({ page }) => {
  await page.goto(`${ALEXANDRA}/writings`);
  await page.locator('.language-toggle__option', { hasText: 'ro' }).click();
  await expect(page.getByRole('heading', { name: 'Texte', level: 1 })).toBeVisible();

  await page.reload();

  // Persisted in localStorage, so the reader is not reset to the default.
  await expect(page.getByRole('heading', { name: 'Texte', level: 1 })).toBeVisible();
  await expect(page.locator('.language-toggle__option.is-active', { hasText: 'ro' })).toBeVisible();
});

test('the archive re-filters rather than translating in place', async ({ page }) => {
  await page.goto(`${ALEXANDRA}/writings`);
  await expect(page.getByRole('heading', { name: 'Writing in the Margins' })).toBeVisible();

  await page.locator('.language-toggle__option', { hasText: 'ro' }).click();

  // The English-only piece leaves the Romanian archive entirely (§4.3).
  await expect(page.getByRole('heading', { name: 'Puterea Cuvintelor' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Writing in the Margins' })).toHaveCount(0);
});

test('UI strings switch along with the content', async ({ page }) => {
  await page.goto(`${ALEXANDRA}/`);
  // Scoped to the nav: the editorial homepage also links "All writings →".
  const nav = page.locator('.site-header__nav');
  await expect(nav.getByRole('link', { name: 'Writings' })).toBeVisible();

  await page.locator('.language-toggle__option', { hasText: 'ro' }).click();

  await expect(nav.getByRole('link', { name: 'Texte' })).toBeVisible();
});
