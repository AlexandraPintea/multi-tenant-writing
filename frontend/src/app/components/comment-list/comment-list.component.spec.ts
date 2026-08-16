import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideTranslateService, TranslateService } from '@ngx-translate/core';

import { CommentListComponent } from './comment-list.component';

describe('CommentListComponent', () => {
  let fixture: ComponentFixture<CommentListComponent>;

  function text(): string {
    return (fixture.nativeElement as HTMLElement).textContent ?? '';
  }

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideTranslateService({ fallbackLang: 'en', lang: 'en' })],
    });
    const translate = TestBed.inject(TranslateService);
    translate.setTranslation('en', { comments: { none: 'No comments yet.' } });
    translate.use('en');

    fixture = TestBed.createComponent(CommentListComponent);
  });

  it('renders each comment with its author and date', async () => {
    fixture.componentRef.setInput('comments', [
      { name: 'Reader', body: 'A remark.', created_at: '2026-05-22T00:00:00Z' },
      { name: 'Another', body: 'A reply.', created_at: '2026-05-23T00:00:00Z' },
    ]);
    await fixture.whenStable();

    const items = (fixture.nativeElement as HTMLElement).querySelectorAll('.comment');
    expect(items.length).toBe(2);
    expect(text()).toContain('Reader');
    expect(text()).toContain('A remark.');
  });

  it('says so when there are none', async () => {
    fixture.componentRef.setInput('comments', []);
    await fixture.whenStable();

    expect(text()).toContain('No comments yet.');
  });

  it('renders a comment as text, never as markup', async () => {
    // Reader-controlled input. The post body is sanitized HTML by design; this
    // is the opposite case and must stay interpolated.
    fixture.componentRef.setInput('comments', [
      {
        name: '<b>bold</b>',
        body: '<script>alert(1)</script>hi',
        created_at: '2026-05-22T00:00:00Z',
      },
    ]);
    await fixture.whenStable();

    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('.comment b')).toBeNull();
    expect(compiled.querySelector('.comment script')).toBeNull();
    expect(text()).toContain('<b>bold</b>');
  });
});
