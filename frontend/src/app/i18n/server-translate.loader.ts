import { inject, PendingTasks } from '@angular/core';
import { TranslateLoader, TranslationObject } from '@ngx-translate/core';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { from, Observable, of } from 'rxjs';
import { catchError } from 'rxjs/operators';

/**
 * Reads UI strings from disk during SSR instead of over HTTP.
 *
 * The browser loader fetches `/i18n/en.json`, a relative URL. On the server
 * that resolves against the *inbound* Host, so rendering a request for
 * alexandrapintea.eu made the SSR process fetch the public site — in testing it
 * downloaded the live Squarespace homepage and every translated string came out
 * empty. Behind nginx the same URL happens to route back to this container, so
 * it "works" in production only by accident of the proxy, at the cost of an
 * HTTP round trip per render.
 *
 * The files are right there on disk, next to the server bundle: this loader is
 * both correct and faster. Provided only in app.config.server.ts, so the
 * browser keeps the HTTP loader and node:fs never reaches the client bundle.
 */
export class ServerTranslateLoader implements TranslateLoader {
  /**
   * SSR waits for HttpClient requests automatically, but it has no idea a bare
   * fs promise is outstanding — the first Romanian render finished before
   * ro.json was read and every UI string came out blank while the *content*
   * was correctly translated. PendingTasks is how you tell Angular "not stable
   * yet".
   */
  private readonly pendingTasks = inject(PendingTasks);

  getTranslation(lang: string): Observable<TranslationObject> {
    // dist/<app>/server/ -> dist/<app>/browser/i18n/
    const file = join(import.meta.dirname, '../browser/i18n', `${lang}.json`);
    const translation = readFile(file, 'utf-8').then((raw) => JSON.parse(raw) as TranslationObject);
    // run() returns void, so hand it the same promise we return rather than
    // trying to thread the value back through it.
    this.pendingTasks.run(() => translation);
    return from(translation).pipe(
      catchError((error) => {
        console.error(`[i18n] could not read ${file}:`, error);
        // Empty rather than throwing: a missing locale file should degrade to
        // untranslated keys, not take the whole render down.
        return of({} as TranslationObject);
      }),
    );
  }
}
