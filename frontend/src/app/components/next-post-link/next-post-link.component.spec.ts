import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideTranslateService, TranslateService } from '@ngx-translate/core';

import { NextPostLinkComponent } from './next-post-link.component';

describe('NextPostLinkComponent', () => {
  let fixture: ComponentFixture<NextPostLinkComponent>;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideRouter([]), provideTranslateService({ fallbackLang: 'en', lang: 'en' })],
    });
    const translate = TestBed.inject(TranslateService);
    translate.setTranslation('en', { post: { older: 'Older', olderLabel: 'Older post' } });
    translate.use('en');

    fixture = TestBed.createComponent(NextPostLinkComponent);
  });

  it('links to the older post by title', async () => {
    fixture.componentRef.setInput('next', { slug: 'rooted-in-zalau', title: 'Rooted in Zalău' });
    await fixture.whenStable();

    const link = (fixture.nativeElement as HTMLElement).querySelector('a');
    expect(link?.getAttribute('href')).toBe('/writings/rooted-in-zalau');
    expect(link?.textContent).toContain('Rooted in Zalău');
    expect(link?.textContent).toContain('Older');
  });

  it('renders nothing on the oldest post', async () => {
    // Not a dimmed or disabled link: an affordance at the end of the archive
    // that leads nowhere is noise, unlike the language toggle where hiding
    // would make the control jump between pages.
    fixture.componentRef.setInput('next', null);
    await fixture.whenStable();

    expect((fixture.nativeElement as HTMLElement).textContent?.trim()).toBe('');
  });
});
