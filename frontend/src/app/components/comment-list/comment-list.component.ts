import { DatePipe } from '@angular/common';
import { Component, input } from '@angular/core';

import { Comment } from '../../stores/content/content.models';

/**
 * The approved thread under a piece.
 *
 * Comments arrive embedded in the post payload, so this component fetches
 * nothing and the thread is in the server-rendered HTML with the article.
 */
@Component({
  selector: 'app-comment-list',
  imports: [DatePipe],
  templateUrl: './comment-list.component.html',
  styleUrl: './comment-list.component.scss',
})
export class CommentListComponent {
  readonly comments = input<Comment[]>([]);
}
