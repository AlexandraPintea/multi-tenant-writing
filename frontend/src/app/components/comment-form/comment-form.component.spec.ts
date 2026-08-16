import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideTranslateService, TranslateService } from '@ngx-translate/core';

import { environment } from '../../../environments/environment';
import { CommentFormComponent } from './comment-form.component';

const URL = `${environment.API_BASE_URL}/posts/the-power-of-words/comments/`;

describe('CommentFormComponent', () => {
  let fixture: ComponentFixture<CommentFormComponent>;
  let http: HttpTestingController;

  function el<T extends HTMLElement>(selector: string): T | null {
    return (fixture.nativeElement as HTMLElement).querySelector<T>(selector);
  }

  function text(): string {
    return (fixture.nativeElement as HTMLElement).textContent ?? '';
  }

  async function fillIn(name: string, body: string) {
    const nameInput = el<HTMLInputElement>('input[formControlName="name"]')!;
    const bodyInput = el<HTMLTextAreaElement>('textarea[formControlName="body"]')!;
    nameInput.value = name;
    nameInput.dispatchEvent(new Event('input'));
    bodyInput.value = body;
    bodyInput.dispatchEvent(new Event('input'));
    await fixture.whenStable();
  }

  async function submit() {
    el<HTMLFormElement>('form')!.dispatchEvent(new Event('submit'));
    await fixture.whenStable();
  }

  beforeEach(async () => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideTranslateService({ fallbackLang: 'en', lang: 'en' }),
      ],
    });
    http = TestBed.inject(HttpTestingController);
    const translate = TestBed.inject(TranslateService);
    translate.setTranslation('en', {
      comments: {
        name: 'Name',
        body: 'Comment',
        nameRequired: 'Please give a name to post under.',
        bodyRequired: 'Please write a comment.',
        moderationNote: 'Comments are read before they appear.',
        submit: 'Post comment',
        submitting: 'Sending…',
        success: 'Thank you. Your comment will appear once it has been read.',
        errorThrottled: 'That is a few comments in a short time.',
        errorGeneric: 'Your comment could not be sent.',
      },
    });
    translate.use('en');

    fixture = TestBed.createComponent(CommentFormComponent);
    fixture.componentRef.setInput('slug', 'the-power-of-words');
    await fixture.whenStable();
  });

  afterEach(() => http.verify());

  it('does not submit an empty form, and says which field is missing', async () => {
    await submit();

    http.expectNone(URL);
    expect(text()).toContain('Please give a name to post under.');
    expect(text()).toContain('Please write a comment.');
  });

  it('posts the comment and replaces the form with the moderation notice', async () => {
    await fillIn('Reader', 'A thoughtful remark.');
    await submit();

    const request = http.expectOne(URL);
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({
      name: 'Reader',
      body: 'A thoughtful remark.',
      url2: '',
    });

    request.flush(
      { detail: 'Thank you. Your comment is awaiting review.' },
      { status: 201, statusText: 'Created' },
    );
    await fixture.whenStable();

    // The form goes: a reader who still sees it assumes nothing happened and
    // sends the comment twice.
    expect(el('form')).toBeNull();
    expect(text()).toContain('will appear once it has been read');
  });

  it('shows the server’s field errors on a 400', async () => {
    await fillIn('Reader', 'ok');
    await submit();

    http
      .expectOne(URL)
      .flush({ body: ['That comment looks empty.'] }, { status: 400, statusText: 'Bad Request' });
    await fixture.whenStable();

    expect(text()).toContain('That comment looks empty.');
    expect(el('form')).not.toBeNull();
  });

  it('translates a throttle response rather than echoing it', async () => {
    await fillIn('Reader', 'A thoughtful remark.');
    await submit();

    // DRF says "available in 3421 seconds", which is not for readers.
    http
      .expectOne(URL)
      .flush(
        { detail: 'Request was throttled. Expected available in 3421 seconds.' },
        { status: 429, statusText: 'Too Many Requests' },
      );
    await fixture.whenStable();

    expect(text()).toContain('That is a few comments in a short time.');
    expect(text()).not.toContain('3421');
  });

  it('disables the button while the request is in flight', async () => {
    await fillIn('Reader', 'A thoughtful remark.');
    await submit();

    expect(el<HTMLButtonElement>('button')?.disabled).toBe(true);
    http.expectOne(URL).flush({}, { status: 201, statusText: 'Created' });
  });

  it('carries a honeypot field that is hidden from readers', async () => {
    const trap = el<HTMLInputElement>('input[formControlName="url2"]');

    expect(trap).not.toBeNull();
    expect(trap?.getAttribute('tabindex')).toBe('-1');
    expect(trap?.closest('[aria-hidden="true"]')).not.toBeNull();
  });
});
