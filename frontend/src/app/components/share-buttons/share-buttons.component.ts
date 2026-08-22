import { isPlatformBrowser } from '@angular/common';
import { Component, computed, inject, input, PLATFORM_ID, signal } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';

import { resolveSiteOrigin } from '../../core/site-domain';
import { SHARE_ICONS } from './share-icons';

/** One network in the row. */
interface ShareTarget {
  key: string;
  /** Proper noun, deliberately untranslated — as in the footer. */
  label: string;
  href: string;
  paths: string[];
}

/** How long "Link copied" stays on screen. */
const COPIED_FOR_MS = 2500;

/**
 * The share row at the foot of a post.
 *
 * Plain anchors to each network's share-intent URL — no Facebook or X SDK, no
 * share counts. That is a privacy decision, not a shortcut: the notice tells
 * readers the site makes no third-party requests, and an official widget would
 * load someone else's script on every post view and make that untrue. Nothing
 * leaves the page until a reader actually clicks.
 *
 * Because they are anchors, the row is server-rendered and works with no
 * JavaScript at all. The two things that cannot work that way — the platform
 * share sheet and copy-to-clipboard — are additive: the sheet button appears
 * only once hydration confirms `navigator.share` exists, and the copy button is
 * inert until then rather than absent, so the row does not change shape.
 */
@Component({
  selector: 'app-share-buttons',
  imports: [TranslatePipe],
  templateUrl: './share-buttons.component.html',
  styleUrl: './share-buttons.component.scss',
})
export class ShareButtonsComponent {
  readonly slug = input.required<string>();
  readonly title = input.required<string>();

  private readonly platformId = inject(PLATFORM_ID);
  // Captured at construction: resolveSiteOrigin() needs an injection context,
  // and it is the same origin for the life of the component either way.
  private readonly origin = resolveSiteOrigin();

  /**
   * The URL a reader will paste elsewhere — absolute, and the canonical path
   * rather than the current router URL, so a language query string or a
   * scroll-to-comments fragment is not carried into someone else's timeline.
   */
  protected readonly url = computed(() => `${this.origin}/writings/${this.slug()}`);

  protected readonly targets = computed<ShareTarget[]>(() => {
    const url = encodeURIComponent(this.url());
    const text = encodeURIComponent(this.title());
    return [
      {
        key: 'whatsapp',
        label: 'WhatsApp',
        // wa.me is WhatsApp's own share endpoint and takes one `text`; the URL
        // goes inside it, which is why it is encoded twice over.
        href: `https://wa.me/?text=${text}%20${url}`,
        paths: SHARE_ICONS['whatsapp'],
      },
      {
        key: 'facebook',
        label: 'Facebook',
        // Facebook takes only the URL and scrapes the Open Graph tags for the
        // rest, which is what SeoService writes during the server render.
        href: `https://www.facebook.com/sharer/sharer.php?u=${url}`,
        paths: SHARE_ICONS['facebook'],
      },
      {
        key: 'x',
        label: 'X',
        // twitter.com, not x.com: the old intent endpoint still redirects and
        // has done for years, while the new path has changed name twice.
        href: `https://twitter.com/intent/tweet?url=${url}&text=${text}`,
        paths: SHARE_ICONS['x'],
      },
    ];
  });

  protected readonly sharePaths = SHARE_ICONS['share'];
  protected readonly copied = signal(false);
  protected readonly copyPaths = computed(() =>
    this.copied() ? SHARE_ICONS['copied'] : SHARE_ICONS['link'],
  );

  /**
   * Whether the platform share sheet exists. Starts false and can only become
   * true in the browser: `navigator` does not exist during SSR, and desktop
   * Firefox and Chrome do not implement Web Share either.
   */
  protected readonly canShareNatively = signal(false);

  private copiedTimer: ReturnType<typeof setTimeout> | undefined;

  constructor() {
    if (isPlatformBrowser(this.platformId)) {
      this.canShareNatively.set(typeof navigator !== 'undefined' && 'share' in navigator);
    }
  }

  protected async shareNatively(): Promise<void> {
    try {
      await navigator.share({ title: this.title(), url: this.url() });
    } catch {
      // Dismissing the sheet rejects with AbortError. A reader changing their
      // mind is not an error worth showing them anything about.
    }
  }

  protected async copy(): Promise<void> {
    try {
      await navigator.clipboard.writeText(this.url());
      this.copied.set(true);
      clearTimeout(this.copiedTimer);
      this.copiedTimer = setTimeout(() => this.copied.set(false), COPIED_FOR_MS);
    } catch {
      // The Clipboard API needs a secure context and can be refused outright.
      // There is nothing to fall back to and nothing useful to say, and the URL
      // is in the address bar regardless.
    }
  }
}
