import { Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';

import { NextPost } from '../../stores/content/content.models';

/**
 * "Older: <title>" at the foot of a piece.
 *
 * Renders nothing at all when there is no older post. Deliberately unlike the
 * language toggle, which dims rather than hides: the toggle keeps its shape so
 * the control does not jump between pages, and a hidden language would strand
 * the reader. Neither applies to a link at the end of an archive — an inert
 * "next" that leads nowhere is just noise.
 *
 * The API calls this `next_post` ("the next one down the archive") while the
 * label says "Older", because to a reader "next" reads as newer.
 */
@Component({
  selector: 'app-next-post-link',
  imports: [RouterLink, TranslatePipe],
  templateUrl: './next-post-link.component.html',
  styleUrl: './next-post-link.component.scss',
})
export class NextPostLinkComponent {
  readonly next = input<NextPost | null>(null);
}
