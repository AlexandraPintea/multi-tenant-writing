import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Component, inject, input, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';

import { environment } from '../../../environments/environment';

type Status = 'idle' | 'submitting' | 'success' | 'error';

/** DRF's 400 shape: `{ "name": ["…"], "body": ["…"] }`. */
type FieldErrors = Record<string, string[]>;

/**
 * Leave a comment. Held for moderation, and the form says so.
 *
 * Submission state lives here rather than in NGXS, deliberately. That slice has
 * one shared `loading` flag and one shared `error` string for all content, so a
 * submit in flight would flip the same flag the article reads and a validation
 * message would land where the archive looks for its errors. Every handler
 * there is also an idempotent cached read that short-circuits on a repeat —
 * exactly what a submit must never do. And a successful submit changes no
 * shared state at all: the comment is unapproved, so the thread on screen is
 * genuinely unchanged.
 */
@Component({
  selector: 'app-comment-form',
  imports: [ReactiveFormsModule, RouterLink, TranslatePipe],
  templateUrl: './comment-form.component.html',
  styleUrl: './comment-form.component.scss',
})
export class CommentFormComponent {
  readonly slug = input.required<string>();

  private readonly http = inject(HttpClient);
  private readonly fb = inject(NonNullableFormBuilder);

  protected readonly status = signal<Status>('idle');
  protected readonly fieldErrors = signal<FieldErrors>({});
  /** Set when the failure is not per-field: throttled, offline, server error. */
  protected readonly formError = signal<string | null>(null);

  protected readonly form = this.fb.group({
    name: ['', [Validators.required, Validators.maxLength(80)]],
    body: ['', [Validators.required, Validators.minLength(2), Validators.maxLength(4000)]],
    // Honeypot. Bots fill in every input they find; a reader never sees this
    // one. Named url2 because autofill reaches for "website" and "url".
    url2: [''],
  });

  protected submit(): void {
    if (this.status() === 'submitting') {
      return;
    }
    this.form.markAllAsTouched();
    if (this.form.invalid) {
      return;
    }

    this.status.set('submitting');
    this.fieldErrors.set({});
    this.formError.set(null);

    this.http
      .post(`${environment.API_BASE_URL}/posts/${this.slug()}/comments/`, this.form.getRawValue())
      .subscribe({
        next: () => {
          this.status.set('success');
          this.form.reset();
        },
        error: (error: HttpErrorResponse) => {
          this.status.set('error');
          if (error.status === 400 && error.error && typeof error.error === 'object') {
            this.fieldErrors.set(error.error as FieldErrors);
          } else if (error.status === 429) {
            // DRF's own message counts down in seconds ("available in 3421
            // seconds"), which is not something to show a reader.
            this.formError.set('comments.errorThrottled');
          } else {
            this.formError.set('comments.errorGeneric');
          }
        },
      });
  }

  /** First server-side message for a control, if the server rejected it. */
  protected serverError(field: string): string | null {
    return this.fieldErrors()[field]?.[0] ?? null;
  }

  protected showRequired(field: 'name' | 'body'): boolean {
    const control = this.form.controls[field];
    return control.touched && control.invalid;
  }
}
