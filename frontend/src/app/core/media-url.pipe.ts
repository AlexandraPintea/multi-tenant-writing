import { Pipe, PipeTransform } from '@angular/core';

import { mediaUrl } from './media';

/**
 * `[src]="post.cover_image | mediaUrl"`.
 *
 * A pipe rather than a computed on each component: every template that renders
 * an upload needs the same resolution, and doing it per component is how one of
 * them ends up forgotten.
 */
@Pipe({ name: 'mediaUrl' })
export class MediaUrlPipe implements PipeTransform {
  transform(path: string | null | undefined): string {
    return mediaUrl(path);
  }
}
