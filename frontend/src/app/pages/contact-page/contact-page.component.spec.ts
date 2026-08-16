import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideTranslateService, TranslateService } from '@ngx-translate/core';

import { environment } from '../../../environments/environment';
import { LanguageStore } from '../../stores/language.store';
import { SiteConfigStore } from '../../stores/site-config.store';
import { ContactPageComponent } from './contact-page.component';

const URL = `${environment.API_BASE_URL}/contact/`;

describe('ContactPageComponent', () => {
  let fixture: ComponentFixture<ContactPageComponent>;
  let http: HttpTestingController;

  function el<T extends HTMLElement>(selector: string): T | null {
    return (fixture.nativeElement as HTMLElement).querySelector<T>(selector);
  }

  function text(): string {
    return (fixture.nativeElement as HTMLElement).textContent ?? '';
  }

  async function type(id: string, value: string) {
    const input = el<HTMLInputElement>(`#${id}`)!;
    input.value = value;
    input.dispatchEvent(new Event('input'));
    input.dispatchEvent(new Event('blur'));
    await fixture.whenStable();
  }

  async function submit() {
    el<HTMLFormElement>('form')!.dispatchEvent(new Event('submit'));
    await fixture.whenStable();
  }

  async function fillValid() {
    await type('firstName', 'Ada');
    await type('lastName', 'Lovelace');
    await type('email', 'ada@example.com');
  }

  beforeEach(async () => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        provideTranslateService({ fallbackLang: 'en', lang: 'en' }),
        SiteConfigStore,
        LanguageStore,
      ],
    });
    http = TestBed.inject(HttpTestingController);
    const translate = TestBed.inject(TranslateService);
    translate.setTranslation('en', {
      contact: {
        title: "Let's stay in touch",
        intro: 'Leave your details.',
        firstName: 'First name',
        lastName: 'Last name',
        email: 'Email',
        phone: 'Phone',
        required: '(required)',
        nameLegend: 'Name',
        submit: 'Submit',
        sending: 'Sending…',
        successTitle: 'Thank you.',
        successBody: 'Your details have been received.',
        sendAnother: 'Send another',
        errorRequired: 'This field is required.',
        errorEmail: 'Please enter a valid email address.',
        errorSubmit: 'Something went wrong while sending your details.',
        errorThrottled: 'That is a few submissions in a short time.',
        consent: 'Email me updates.',
        privacyNote: 'Your details are stored so I can reply.',
      },
      privacy: { linkText: 'privacy notice' },
    });
    translate.use('en');

    fixture = TestBed.createComponent(ContactPageComponent);
    await fixture.whenStable();
  });

  afterEach(() => {
    // The site-config store fetches on init; drain it so verify() is about
    // this component's own traffic.
    http.match(() => true).forEach((request) => request.flush({}));
    http.verify();
  });

  it('does not post an incomplete form, and says which fields are missing', async () => {
    await submit();

    http.expectNone(URL);
    expect(text()).toContain('This field is required.');
  });

  it('rejects a malformed email before sending anything', async () => {
    await type('firstName', 'Ada');
    await type('lastName', 'Lovelace');
    await type('email', 'not-an-email');
    await submit();

    http.expectNone(URL);
    expect(text()).toContain('Please enter a valid email address.');
  });

  it('posts snake_case to the API and shows the thank-you', async () => {
    await fillValid();
    await submit();

    const request = http.expectOne(URL);
    expect(request.request.method).toBe('POST');
    // snake_case on the wire even though the controls are camelCase, because
    // that is what every other payload in this API looks like.
    expect(request.request.body).toEqual({
      first_name: 'Ada',
      last_name: 'Lovelace',
      email: 'ada@example.com',
      // Untouched tickbox: no consent, and no wording recorded for one.
      consented_to_updates: false,
      consent_text: '',
      url2: '',
    });

    request.flush({ detail: 'ok' }, { status: 201, statusText: 'Created' });
    await fixture.whenStable();

    expect(el('form')).toBeNull();
    expect(text()).toContain('Thank you.');
  });

  it('starts with the updates tickbox unticked', () => {
    // A pre-ticked box is not consent under the GDPR. This is the assertion
    // that stops someone "improving" the form by defaulting it to true.
    expect(el<HTMLInputElement>('input[formControlName="consent"]')?.checked).toBe(false);
  });

  it('sends consent along with the exact wording that was shown', async () => {
    await fillValid();
    el<HTMLInputElement>('input[formControlName="consent"]')!.click();
    await fixture.whenStable();
    await submit();

    const request = http.expectOne(URL);
    expect(request.request.body.consented_to_updates).toBe(true);
    // The sentence, not just the flag: "they consented" means little without a
    // record of what they were agreeing to, and the wording is translated.
    expect(request.request.body.consent_text).toBe('Email me updates.');
    request.flush({}, { status: 201, statusText: 'Created' });
  });

  it('accepts the message when consent is refused', async () => {
    // Withholding consent must not block someone from writing at all —
    // otherwise agreeing is the price of using the form, and it is not freely
    // given.
    await fillValid();
    await submit();

    const request = http.expectOne(URL);
    expect(request.request.body.consented_to_updates).toBe(false);
    request.flush({}, { status: 201, statusText: 'Created' });
  });

  it('offers a way back to the form after a successful send', async () => {
    await fillValid();
    await submit();
    http.expectOne(URL).flush({}, { status: 201, statusText: 'Created' });
    await fixture.whenStable();

    el<HTMLButtonElement>('.contact__button--ghost')!.click();
    await fixture.whenStable();

    expect(el('form')).not.toBeNull();
    expect(el<HTMLInputElement>('#firstName')?.value).toBe('');
  });

  it('keeps the form and explains itself when the send fails', async () => {
    await fillValid();
    await submit();
    http.expectOne(URL).flush({}, { status: 500, statusText: 'Server Error' });
    await fixture.whenStable();

    expect(el('form')).not.toBeNull();
    expect(text()).toContain('Something went wrong while sending your details.');
  });

  it('translates a throttle response rather than echoing the server text', async () => {
    await fillValid();
    await submit();
    http
      .expectOne(URL)
      .flush(
        { detail: 'Request was throttled. Expected available in 3421 seconds.' },
        { status: 429, statusText: 'Too Many Requests' },
      );
    await fixture.whenStable();

    expect(text()).toContain('That is a few submissions in a short time.');
    expect(text()).not.toContain('3421');
  });

  it('carries a honeypot hidden from readers', async () => {
    const trap = el<HTMLInputElement>('input[formControlName="url2"]');

    expect(trap?.getAttribute('tabindex')).toBe('-1');
    expect(trap?.closest('[aria-hidden="true"]')).not.toBeNull();
  });
});
