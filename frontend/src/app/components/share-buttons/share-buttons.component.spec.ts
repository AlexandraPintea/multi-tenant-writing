import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideTranslateService, TranslateService } from '@ngx-translate/core';

import { ShareButtonsComponent } from './share-buttons.component';

describe('ShareButtonsComponent', () => {
  let fixture: ComponentFixture<ShareButtonsComponent>;

  function buttons() {
    return Array.from(
      fixture.nativeElement.querySelectorAll('.share__list .share__button'),
    ) as HTMLElement[];
  }

  function hrefs() {
    return buttons()
      .filter((el): el is HTMLAnchorElement => el instanceof HTMLAnchorElement)
      .map((a) => a.getAttribute('href') ?? '');
  }

  /** Let the click handler's promise chain settle. Timer-free, so it works
      under fake timers. */
  function flushMicrotasks(): Promise<void> {
    return Promise.resolve().then().then();
  }

  async function render(slug = 'the-power-of-words', title = 'The Power of Words') {
    fixture = TestBed.createComponent(ShareButtonsComponent);
    fixture.componentRef.setInput('slug', slug);
    fixture.componentRef.setInput('title', title);
    await fixture.whenStable();
  }

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideTranslateService({ fallbackLang: 'en', lang: 'en' })],
    });
    const translate = TestBed.inject(TranslateService);
    translate.setTranslation('en', {
      share: {
        heading: 'Share this piece',
        native: 'Share',
        on: 'Share on {{network}}',
        copy: 'Copy link',
        copied: 'Link copied',
      },
    });
    translate.use('en');
  });

  it('renders one link per network, each leaving the site safely', async () => {
    await render();

    expect(hrefs().length).toBe(3);
    for (const anchor of buttons().filter(
      (el): el is HTMLAnchorElement => el instanceof HTMLAnchorElement,
    )) {
      // target=_blank without noopener hands window.opener to the destination.
      expect(anchor.getAttribute('rel')).toBe('noopener noreferrer');
      expect(anchor.getAttribute('target')).toBe('_blank');
    }
  });

  it('shares the canonical post URL, absolute and encoded', async () => {
    await render('rooted-in-zalau', 'Rooted in Zalău');

    const encoded = encodeURIComponent(`${window.location.origin}/writings/rooted-in-zalau`);
    for (const href of hrefs()) {
      expect(href).toContain(encoded);
    }
    // Facebook scrapes the Open Graph tags, so it is only given the URL.
    expect(hrefs().find((h) => h.includes('facebook'))).not.toContain('text=');
  });

  it('names each network for assistive tech', async () => {
    await render();

    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('Share on WhatsApp');
    expect(text).toContain('Share on Facebook');
    expect(text).toContain('Share on X');
  });

  it('offers no share-sheet button when the platform has no Web Share', async () => {
    // navigator.share is absent in jsdom, as it is on desktop Firefox and
    // Chrome — the row must not render a button that cannot do anything.
    await render();

    expect(buttons().length).toBe(4); // three networks + copy link
  });

  it('copies the URL and says so, then goes quiet', async () => {
    const writeText = jest.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      configurable: true,
    });

    await render();
    // Installed after the render, so whenStable() above ran on real timers and
    // the only timer these controls is the one the click below schedules.
    jest.useFakeTimers();
    try {
      (buttons().at(-1) as HTMLElement).click();
      await flushMicrotasks();
      fixture.detectChanges();

      expect(writeText).toHaveBeenCalledWith(
        `${window.location.origin}/writings/the-power-of-words`,
      );
      // role="status" is live, so the confirmation is announced, not just seen.
      const status = fixture.nativeElement.querySelector('.share__status');
      expect(status?.textContent?.trim()).toBe('Link copied');

      jest.advanceTimersByTime(3000);
      fixture.detectChanges();
      expect(status?.textContent?.trim()).toBe('');
    } finally {
      jest.useRealTimers();
    }
  });

  it('survives a refused clipboard without breaking', async () => {
    // The Clipboard API needs a secure context and can be denied outright.
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: jest.fn().mockRejectedValue(new Error('denied')) },
      configurable: true,
    });

    await render();
    expect(() => (buttons().at(-1) as HTMLElement).click()).not.toThrow();
    await flushMicrotasks();
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.share__status')?.textContent?.trim()).toBe('');
  });
});
