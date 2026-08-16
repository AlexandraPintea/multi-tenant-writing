import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideTranslateService, TranslateService } from '@ngx-translate/core';
import { patchState } from '@ngrx/signals';

import { SiteConfig, SiteConfigStore } from '../../stores/site-config.store';
import { SiteFooterComponent } from './site-footer.component';
import { SOCIAL_ICON_PATHS } from './social-icons';

describe('SiteFooterComponent', () => {
  let fixture: ComponentFixture<SiteFooterComponent>;

  function configureSite(overrides: Partial<SiteConfig>) {
    const config: SiteConfig = {
      domain: 'alexandrapintea.eu',
      name: 'Alexandra Pintea',
      logo: null,
      social_links: {},
      copyright_text: '',
      theme: {},
      layout: 'editorial',
      enabled_languages: ['en'],
      default_language: 'en',
      ...overrides,
    };
    patchState(TestBed.inject(SiteConfigStore) as never, { config });
  }

  function links() {
    return Array.from(
      fixture.nativeElement.querySelectorAll('.site-footer__links a'),
    ) as HTMLAnchorElement[];
  }

  function copyright() {
    return fixture.nativeElement.querySelector('.site-footer__copyright')?.textContent?.trim();
  }

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        // The footer now always carries a privacy link, so it needs a router.
        provideRouter([]),
        provideTranslateService({ fallbackLang: 'en', lang: 'en' }),
        SiteConfigStore,
      ],
    });
    const translate = TestBed.inject(TranslateService);
    translate.setTranslation('en', { nav: { privacy: 'Privacy' } });
    translate.use('en');

    fixture = TestBed.createComponent(SiteFooterComponent);
  });

  function iconPaths() {
    return links().map((a) => a.querySelector('svg path')?.getAttribute('d'));
  }

  it('renders whatever networks the tenant defines', async () => {
    configureSite({
      social_links: { instagram: 'https://instagram.com/x', facebook: 'https://fb.com/x' },
    });
    await fixture.whenStable();

    expect(iconPaths()).toEqual([SOCIAL_ICON_PATHS['instagram'], SOCIAL_ICON_PATHS['facebook']]);
    expect(links().map((a) => a.getAttribute('href'))).toEqual([
      'https://instagram.com/x',
      'https://fb.com/x',
    ]);
  });

  it('orders the row itself rather than trusting the key order', async () => {
    // Postgres stores this field as jsonb, which does not keep the order the
    // admin typed — {email, instagram, facebook} arrives alphabetised. Feed it
    // in a deliberately wrong order and expect the display order back.
    configureSite({
      social_links: {
        goodreads: 'https://goodreads.com/x',
        facebook: 'https://fb.com/x',
        email: 'a@b.co',
        instagram: 'https://ig/x',
      },
    });
    await fixture.whenStable();

    expect(links().map((a) => a.querySelector('.visually-hidden')?.textContent?.trim())).toEqual([
      'Email',
      'Instagram',
      'Facebook',
      // Unlisted networks trail the known ones, alphabetically.
      'Goodreads',
    ]);
  });

  it('shows the icon only, but keeps an accessible name', async () => {
    configureSite({ social_links: { instagram: 'https://instagram.com/x' } });
    await fixture.whenStable();

    const link = links()[0];
    // The name is present for screen readers and as a tooltip, but carried in
    // visually-hidden text rather than rendered beside the glyph.
    expect(link.querySelector('.visually-hidden')?.textContent?.trim()).toBe('Instagram');
    expect(link.getAttribute('title')).toBe('Instagram');
    // Decorative: the visually-hidden span is already the accessible name, so
    // an exposed icon would make the link announce itself twice.
    expect(link.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true');
  });

  it('maps common aliases to the right glyph', async () => {
    configureSite({ social_links: { twitter: 'https://x.com/a', ig: 'https://ig/b' } });
    await fixture.whenStable();

    // Display order applies to the resolved names, so instagram precedes x.
    expect(iconPaths()).toEqual([SOCIAL_ICON_PATHS['instagram'], SOCIAL_ICON_PATHS['x']]);
  });

  it('falls back to a globe for a network we have no glyph for', async () => {
    // Keys are free-form by design, so an unknown one must still render a link
    // rather than an empty <svg> or a crash.
    configureSite({ social_links: { goodreads: 'https://goodreads.com/x' } });
    await fixture.whenStable();

    expect(iconPaths()).toEqual([SOCIAL_ICON_PATHS['globe']]);
    expect(links()[0].querySelector('.visually-hidden')?.textContent?.trim()).toBe('Goodreads');
  });

  it('turns a bare email address into a mailto link', async () => {
    // The admin will type an address, not a URL, and a bare address in href
    // resolves as a relative path.
    configureSite({ social_links: { email: 'hello@example.com' } });
    await fixture.whenStable();

    expect(links()[0].getAttribute('href')).toBe('mailto:hello@example.com');
  });

  it('leaves an already-qualified mailto or URL alone', async () => {
    configureSite({ social_links: { email: 'mailto:hi@example.com' } });
    await fixture.whenStable();

    expect(links()[0].getAttribute('href')).toBe('mailto:hi@example.com');
  });

  it('skips a key whose value was left empty', async () => {
    // A half-filled admin form should not render a link to nowhere.
    configureSite({ social_links: { instagram: 'https://ig/x', facebook: '   ' } });
    await fixture.whenStable();

    expect(links().map((a) => a.textContent?.trim())).toEqual(['Instagram']);
  });

  it('sends outbound links out safely', async () => {
    configureSite({ social_links: { instagram: 'https://ig/x' } });
    await fixture.whenStable();

    // target=_blank without noopener hands window.opener to the destination.
    expect(links()[0].getAttribute('rel')).toContain('noopener');
  });

  it('composes the copyright from the site name when none is stored', async () => {
    configureSite({});
    await fixture.whenStable();

    expect(copyright()).toBe(`© ${new Date().getFullYear()} Alexandra Pintea`);
  });

  it('prefers a stored copyright line verbatim', async () => {
    configureSite({ copyright_text: '© Roam Literary Collective' });
    await fixture.whenStable();

    expect(copyright()).toBe('© Roam Literary Collective');
  });

  it('still offers the privacy notice before site-config arrives', async () => {
    await fixture.whenStable();

    // The rest of the footer stays empty until the tenant is known — no name
    // means no copyright to compose, and no links. The privacy link is the one
    // thing that does not wait: a notice that appears only once a request has
    // succeeded is not reliably reachable.
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('.site-footer__copyright')).toBeNull();
    expect(compiled.querySelectorAll('.site-footer__links a').length).toBe(0);
    expect(compiled.querySelector('.site-footer__privacy')?.getAttribute('href')).toBe('/privacy');
  });
});
