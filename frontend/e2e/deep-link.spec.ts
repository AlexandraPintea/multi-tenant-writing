import { expect, test } from '@playwright/test';

import { ALEXANDRA, ROAM } from '../playwright.config';

/**
 * The load-bearing suite: is the content *server*-rendered?
 *
 * Every assertion here uses request.get(), not page.goto() — a raw HTTP fetch
 * with no browser and no JavaScript, which is exactly what Googlebot and the
 * unfurlers behind Slack and WhatsApp do. A page that only fills in after
 * hydration passes every other test in this repo and still fails here, and
 * failing here means the entire reason for running SSR has quietly stopped
 * working (architecture §5.4).
 */

test('a post arrives with its body already in the HTML', async ({ request }) => {
  const response = await request.get(`${ALEXANDRA}/writings/the-power-of-words`);
  expect(response.status()).toBe(200);
  const html = await response.text();

  expect(html).toContain('The Power of Words');
  expect(html).toContain('Words have the power to shape worlds');
  // The shell alone would be a few hundred bytes.
  expect(html.length).toBeGreaterThan(2000);
});

test('the Open Graph tags are in the HTML before any JavaScript runs', async ({ request }) => {
  const html = await (await request.get(`${ALEXANDRA}/writings/the-power-of-words`)).text();

  expect(html).toMatch(/<meta property="og:title" content="The Power of Words">/);
  expect(html).toMatch(/<meta property="og:type" content="article">/);
  expect(html).toMatch(
    /<meta property="og:url" content="https:\/\/alexandrapintea\.eu\/writings\/the-power-of-words">/,
  );
  expect(html).toMatch(
    /<link rel="canonical" href="https:\/\/alexandrapintea\.eu\/writings\/the-power-of-words">/,
  );
  expect(html).toContain('<title>The Power of Words · Alexandra Pintea</title>');
});

test('og:url carries the requesting tenant, not a hardcoded domain', async ({ request }) => {
  const html = await (await request.get(`${ROAM}/writings/the-power-of-words`)).text();

  expect(html).toMatch(
    /<meta property="og:url" content="https:\/\/roamliterary\.com\/writings\/the-power-of-words">/,
  );
  expect(html).toMatch(/<meta property="og:site_name" content="Roam Literary">/);
});

test('the archive is server-rendered too', async ({ request }) => {
  const html = await (await request.get(`${ALEXANDRA}/writings`)).text();

  expect(html).toContain('Writing in the Margins');
  expect(html).toContain('The Power of Words');
});

test('an author page arrives with the posts already listed', async ({ request }) => {
  const html = await (await request.get(`${ROAM}/authors/alexandra-pintea`)).text();

  expect(html).toContain('The literary voice behind Roam Literary');
  // The cross-posted piece — the bug addendum A.2 fixed.
  expect(html).toContain('The Power of Words');
});

test('the Romanian render is Romanian in the HTML itself', async ({ request }) => {
  const html = await (
    await request.get(`${ALEXANDRA}/writings/the-power-of-words`, {
      headers: { 'Accept-Language': 'ro-RO,ro;q=0.9,en;q=0.8' },
    })
  ).text();

  expect(html).toContain('Puterea Cuvintelor');
  expect(html).toContain('Cuvintele au puterea');
});
