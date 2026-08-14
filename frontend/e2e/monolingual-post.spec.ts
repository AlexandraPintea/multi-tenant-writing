import { expect, test } from '@playwright/test';

import { ALEXANDRA } from '../playwright.config';

/**
 * The monolingual-post path, end to end: Django answers a missing translation
 * with a 404 carrying available_languages, NGXS turns that into a typed action
 * rather than an error, and the page says where the piece does exist.
 *
 * This is the §9 risk row — "a reader on an English-only post toggles to RO and
 * sees a blank or confusing page" — checked at the only level where all three
 * layers are actually involved.
 */

test('the fallback explains itself instead of showing an empty page', async ({ page }) => {
  // The reader switches to Romanian on the archive — where the option is live —
  // and then opens an English-only piece. They cannot get here by clicking the
  // toggle on the post itself; that option is inert, which is the next test.
  await page.goto(`${ALEXANDRA}/writings`);
  await page.locator('.language-toggle__option', { hasText: 'ro' }).click();
  await expect(page.getByRole('heading', { name: 'Texte', level: 1 })).toBeVisible();

  await page.goto(`${ALEXANDRA}/writings/writing-in-the-margins`);

  const fallback = page.locator('.unavailable');
  await expect(fallback.getByText(/disponibil doar în engleză/i)).toBeVisible();
  // A way out, not a dead end. Scoped to the fallback: the nav links to the
  // archive too, under the same name.
  await expect(fallback.getByRole('link')).toHaveAttribute('href', '/writings');
});

test('the unavailable language is dimmed and inert, not clickable', async ({ page }) => {
  await page.goto(`${ALEXANDRA}/writings/writing-in-the-margins`);

  const romanian = page.locator('.language-toggle__option', { hasText: 'ro' });
  await expect(romanian).toHaveAttribute('aria-disabled', 'true');
  await expect(romanian).toHaveAttribute('title', /only available in English/i);

  // force: true is the point of this assertion. Playwright's normal click
  // refuses to act on aria-disabled="true" — which already proves the control
  // is inert to assistive tech and to a careful user. Forcing the click past
  // that check tests the handler itself: even a determined click does nothing.
  await romanian.click({ force: true });

  await expect(page.getByRole('heading', { name: 'Writing in the Margins' })).toBeVisible();
  await expect(page.locator('.language-toggle__option.is-active')).toHaveText(/en/);
});

test('a bilingual post dims neither option', async ({ page }) => {
  await page.goto(`${ALEXANDRA}/writings/the-power-of-words`);

  const options = page.locator('.language-toggle__option');
  await expect(options).toHaveCount(2);
  await expect(page.locator('.language-toggle__option[aria-disabled="true"]')).toHaveCount(0);
});

test('a Romanian reader deep-linking to the English-only piece is told why', async ({
  request,
}) => {
  // Server-rendered, before any JavaScript: the message has to be in the HTML.
  const html = await (
    await request.get(`${ALEXANDRA}/writings/writing-in-the-margins`, {
      headers: { 'Accept-Language': 'ro-RO,ro;q=0.9' },
    })
  ).text();

  expect(html).toContain('Acest text este disponibil doar în engleză.');
});
