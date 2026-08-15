import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

/**
 * Every key a template asks for must exist in every locale file.
 *
 * ngx-translate renders the key itself when it is missing — the writings list
 * shipped a button reading "writings.readMore" — and nothing fails: not the
 * build, not the type checker, not a component test that only asserts the
 * component was created. This is the only thing standing between a new string
 * and that.
 *
 * Keys built at runtime (`language.${code}`) cannot be found by scanning, so
 * they are listed explicitly.
 */

const APP_DIR = resolve(__dirname, '..');
const I18N_DIR = resolve(__dirname, '../../../public/i18n');
const LOCALES = ['en', 'ro'];

const RUNTIME_KEYS = ['language.en', 'language.ro'];

/** `{{ 'writings.readMore' | translate }}` */
const IN_TEMPLATE = /'([A-Za-z]\w*(?:\.\w+)+)'\s*\|\s*translate/g;
/** `translate.instant('toggle.unavailable')`, .stream(), .get() */
const IN_CODE = /translate\.(?:instant|stream|get)\(\s*'([A-Za-z]\w*(?:\.\w+)+)'/g;

function sourceFiles(): string[] {
  return readdirSync(APP_DIR, { recursive: true, encoding: 'utf-8' })
    .map((entry) => join(APP_DIR, entry))
    .filter((file) => /\.(html|ts)$/.test(file) && !file.endsWith('.spec.ts'));
}

function usedKeys(): Map<string, string> {
  const keys = new Map<string, string>();
  for (const file of sourceFiles()) {
    const source = readFileSync(file, 'utf-8');
    for (const pattern of [IN_TEMPLATE, IN_CODE]) {
      for (const match of source.matchAll(pattern)) {
        keys.set(match[1], file);
      }
    }
  }
  for (const key of RUNTIME_KEYS) {
    keys.set(key, '(runtime)');
  }
  return keys;
}

function load(locale: string): Record<string, unknown> {
  return JSON.parse(readFileSync(join(I18N_DIR, `${locale}.json`), 'utf-8'));
}

function lookup(translations: Record<string, unknown>, key: string): unknown {
  return key
    .split('.')
    .reduce<unknown>(
      (node, part) =>
        node && typeof node === 'object' ? (node as Record<string, unknown>)[part] : undefined,
      translations,
    );
}

function flatten(node: unknown, prefix = ''): string[] {
  if (typeof node !== 'object' || node === null) {
    return [prefix];
  }
  return Object.entries(node as Record<string, unknown>).flatMap(([part, child]) =>
    flatten(child, prefix ? `${prefix}.${part}` : part),
  );
}

describe('translations', () => {
  it('finds keys to check', () => {
    // Guards the scanner itself: a regex that silently matches nothing would
    // make every assertion below pass.
    expect(usedKeys().size).toBeGreaterThan(10);
  });

  for (const locale of LOCALES) {
    it(`${locale}.json defines every key the app uses`, () => {
      const translations = load(locale);
      const missing = [...usedKeys()]
        .filter(([key]) => typeof lookup(translations, key) !== 'string')
        .map(([key, file]) => `${key} (used in ${file.replace(APP_DIR, 'src/app')})`);

      expect(missing).toEqual([]);
    });
  }

  it('the locales define the same set of keys', () => {
    const [en, ro] = LOCALES.map((locale) => flatten(load(locale)).sort());
    expect(ro).toEqual(en);
  });
});
