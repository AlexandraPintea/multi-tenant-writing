import { DOCUMENT } from '@angular/common';
import { inject, Injectable } from '@angular/core';
import { Meta, Title } from '@angular/platform-browser';
import { Router } from '@angular/router';

import { environment } from '../../environments/environment';
import { LanguageStore } from '../stores/language.store';
import { SiteConfigStore } from '../stores/site-config.store';
import { resolveSiteOrigin } from './site-domain';

export interface PageSeo {
  /** Page-specific title. The site name is appended, except on the home page. */
  title: string;
  description?: string;
  /** Absolute or root-relative; made absolute here. */
  image?: string | null;
  /** Open Graph type — "article" for a post, "website" otherwise. */
  type?: 'website' | 'article';
  /** Overrides the current URL, e.g. to drop query parameters. */
  path?: string;
}

/**
 * Per-route <title>, Open Graph and Twitter Card tags, plus the canonical link.
 *
 * This is the reason the project runs SSR at all (architecture §5.4). Crawlers
 * and the unfurlers behind Slack, WhatsApp and Twitter read the HTML as it
 * arrives and do not execute JavaScript, so tags set only after hydration are
 * tags nobody who matters ever sees. Angular's Meta and Title write into the
 * document during the server render, and the serialized head carries them.
 *
 * Absolute URLs throughout: og:url and canonical are read by other people's
 * machines, where a relative path means nothing.
 */
@Injectable({ providedIn: 'root' })
export class SeoService {
  private readonly title = inject(Title);
  private readonly meta = inject(Meta);
  private readonly document = inject(DOCUMENT);
  private readonly router = inject(Router);
  private readonly siteConfig = inject(SiteConfigStore);
  private readonly languageStore = inject(LanguageStore);
  // Captured at construction: inject() needs an injection context, and apply()
  // is called from component effects that run outside one.
  private readonly origin = resolveSiteOrigin();

  apply(page: PageSeo): void {
    const siteName = this.siteConfig.config()?.name ?? '';
    const fullTitle =
      siteName && page.title ? `${page.title} · ${siteName}` : page.title || siteName;
    const url = this.absolute(page.path ?? this.router.url.split('?')[0]);
    const image = this.absolute(page.image ?? undefined);
    const description = page.description?.trim() ?? '';

    this.title.setTitle(fullTitle);
    this.setName('description', description);

    this.setProperty('og:title', page.title || siteName);
    this.setProperty('og:description', description);
    this.setProperty('og:type', page.type ?? 'website');
    this.setProperty('og:url', url);
    this.setProperty('og:site_name', siteName);
    this.setProperty('og:locale', this.languageStore.language());
    this.setProperty('og:image', image);

    // summary_large_image with no image renders as an empty banner; plain
    // summary degrades to a text card, which is what we want in that case.
    this.setName('twitter:card', image ? 'summary_large_image' : 'summary');
    this.setName('twitter:title', page.title || siteName);
    this.setName('twitter:description', description);
    this.setName('twitter:image', image);

    this.setCanonical(url);
  }

  private absolute(value?: string): string {
    if (!value) {
      return '';
    }
    if (/^https?:\/\//.test(value)) {
      return value;
    }
    // Media paths come back from Django root-relative ("/media/..."). In
    // production nginx serves them from the same origin; in development the API
    // lives elsewhere, so fall back to the API host.
    if (value.startsWith('/media/')) {
      const apiOrigin = environment.API_BASE_URL.replace(/\/api\/?$/, '');
      const base = /^https?:\/\//.test(apiOrigin) ? apiOrigin : this.origin;
      return `${base}${value}`;
    }
    return `${this.origin}${value.startsWith('/') ? value : `/${value}`}`;
  }

  private setName(name: string, content: string): void {
    if (content) {
      this.meta.updateTag({ name, content });
    } else {
      this.meta.removeTag(`name="${name}"`);
    }
  }

  private setProperty(property: string, content: string): void {
    if (content) {
      this.meta.updateTag({ property, content });
    } else {
      // Stale tags are worse than missing ones: navigating from a post with a
      // cover image to one without would otherwise unfurl the wrong picture.
      this.meta.removeTag(`property="${property}"`);
    }
  }

  private setCanonical(url: string): void {
    const head = this.document.head;
    let link = head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    if (!url) {
      link?.remove();
      return;
    }
    if (!link) {
      link = this.document.createElement('link');
      link.setAttribute('rel', 'canonical');
      head.appendChild(link);
    }
    link.setAttribute('href', url);
  }
}
