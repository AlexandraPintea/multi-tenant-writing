import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { patchState } from '@ngrx/signals';

import { SiteConfig, SiteConfigStore } from '../../stores/site-config.store';
import { SiteFooterComponent } from './site-footer.component';

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
      providers: [provideHttpClient(), provideHttpClientTesting(), SiteConfigStore],
    });
    fixture = TestBed.createComponent(SiteFooterComponent);
  });

  it('renders whatever networks the tenant defines, labelled from the key', async () => {
    configureSite({
      social_links: { instagram: 'https://instagram.com/x', facebook: 'https://fb.com/x' },
    });
    await fixture.whenStable();

    expect(links().map((a) => a.textContent?.trim())).toEqual(['Instagram', 'Facebook']);
    expect(links().map((a) => a.getAttribute('href'))).toEqual([
      'https://instagram.com/x',
      'https://fb.com/x',
    ]);
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

  it('renders nothing before site-config arrives', async () => {
    await fixture.whenStable();

    // No name yet means no copyright to compose, and no links: an empty bordered
    // strip would flash on every first paint.
    expect((fixture.nativeElement as HTMLElement).textContent?.trim()).toBe('');
  });
});
