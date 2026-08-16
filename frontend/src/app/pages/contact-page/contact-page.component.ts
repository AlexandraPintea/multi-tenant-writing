import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';

import { environment } from '../../../environments/environment';
import { SeoService } from '../../core/seo';

type SubmitStatus = 'idle' | 'sending' | 'success' | 'error';
type ContactField = 'firstName' | 'lastName' | 'email' | 'phone';

/**
 * The contact page: a reader leaving their details.
 *
 * Its own page component rather than a branch inside StaticPageComponent —
 * that one exists to render admin-written prose for a slug, and /about still
 * uses it. A page with behaviour, a form and an HTTP call is a different thing,
 * and folding it in would make every static page carry all of it.
 *
 * Submissions land in the admin (content.ContactMessage). Nothing is emailed:
 * there is no SMTP configured anywhere in the project yet.
 */
@Component({
  selector: 'app-contact-page',
  imports: [ReactiveFormsModule, TranslatePipe],
  templateUrl: './contact-page.component.html',
  styleUrl: './contact-page.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ContactPageComponent {
  private readonly fb = inject(NonNullableFormBuilder);
  private readonly http = inject(HttpClient);
  private readonly host = inject(ElementRef<HTMLElement>);
  private readonly translate = inject(TranslateService);
  private readonly seo = inject(SeoService);

  protected readonly status = signal<SubmitStatus>('idle');
  protected readonly sending = computed(() => this.status() === 'sending');
  /** Set when the failure is not per-field — throttled, offline, server error. */
  protected readonly submitError = signal<string | null>(null);

  protected readonly form = this.fb.group({
    firstName: ['', [Validators.required, Validators.maxLength(100)]],
    lastName: ['', [Validators.required, Validators.maxLength(100)]],
    email: ['', [Validators.required, Validators.email, Validators.maxLength(254)]],
    phone: ['', [Validators.maxLength(40)]],
    // The honeypot, as on the comment form: no reader sees it, and anything
    // that fills in every input it finds gets a polite 201 and no row.
    url2: [''],
  });

  /**
   * stream(), not instant(): the language file may not have arrived yet, and
   * instant() would bake the key into <title> — the same trap the writings list
   * documents.
   */
  private readonly seoTitle = toSignal(this.translate.stream('contact.title'), {
    initialValue: '',
  });
  private readonly seoDescription = toSignal(this.translate.stream('contact.intro'), {
    initialValue: '',
  });

  constructor() {
    effect(() => {
      const title = this.seoTitle();
      if (title) {
        this.seo.apply({ title, description: this.seoDescription(), path: '/contact' });
      }
    });
  }

  protected showError(name: ContactField): boolean {
    const control = this.form.controls[name];
    return control.invalid && (control.touched || control.dirty);
  }

  protected errorFor(name: ContactField): string | null {
    const control = this.form.controls[name];
    if (!this.showError(name)) {
      return null;
    }
    if (control.hasError('required')) {
      return 'contact.errorRequired';
    }
    if (control.hasError('email')) {
      return 'contact.errorEmail';
    }
    if (control.hasError('maxlength')) {
      return 'contact.errorTooLong';
    }
    return 'contact.errorField';
  }

  protected onSubmit(): void {
    if (this.sending()) {
      return;
    }

    this.form.markAllAsTouched();
    if (this.form.invalid) {
      this.status.set('idle');
      this.focusFirstInvalid();
      return;
    }

    this.status.set('sending');
    this.submitError.set(null);

    const { firstName, lastName, email, phone, url2 } = this.form.getRawValue();
    // snake_case on the wire, like every other payload in this API.
    this.http
      .post(`${environment.API_BASE_URL}/contact/`, {
        first_name: firstName,
        last_name: lastName,
        email,
        phone,
        url2,
      })
      .subscribe({
        next: () => {
          this.status.set('success');
          this.form.reset();
        },
        error: (error: HttpErrorResponse) => {
          this.status.set('error');
          this.submitError.set(
            error.status === 429 ? 'contact.errorThrottled' : 'contact.errorSubmit',
          );
        },
      });
  }

  protected resetForm(): void {
    this.form.reset();
    this.submitError.set(null);
    this.status.set('idle');
  }

  private focusFirstInvalid(): void {
    // Scoped to this component's own element, not document: a global query
    // would find another form's field, and touching `document` directly is a
    // habit that breaks the moment it runs during a server render.
    queueMicrotask(() => {
      const element = (this.host.nativeElement as HTMLElement).querySelector<HTMLInputElement>(
        '[aria-invalid="true"]',
      );
      element?.focus();
    });
  }
}
