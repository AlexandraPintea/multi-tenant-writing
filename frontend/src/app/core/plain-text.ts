/**
 * Flatten author-written HTML into one line of plain text, for a meta tag.
 *
 * Post excerpts and page content are markup — the author writes tags and the
 * reading page renders them with innerHTML. A meta description is the one place
 * that markup must not go: og:description and twitter:description are read by
 * other people's machines, which show the tags rather than obeying them, so an
 * unfurl would read "<p>A meditation on annotation" and Google would index it
 * the same way.
 *
 * Truncation happens *after* stripping, deliberately. Cutting the HTML first —
 * which is what the About page used to do — can slice through a tag and leave
 * "<stro" in the description, a shape no amount of stripping afterwards can
 * recognise.
 *
 * Regex rather than the DOM: this runs during the server render too, where
 * there is no document, and the input has already been through the backend's
 * nh3 allowlist, so it is known-shaped markup rather than anything hostile.
 */
export function plainText(html: string | null | undefined, maxLength?: number): string {
  if (!html) {
    return '';
  }

  const text = html
    // Block boundaries become a space, or the last word of one paragraph and
    // the first of the next run together into one invented word. Inline tags
    // become nothing at all: turning </em> into a space is how you get
    // "an exploration of language ." with the space before the full stop.
    .replace(/<\/(p|div|h[1-6]|li|ul|ol|blockquote|figure|figcaption)>/gi, ' ')
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]*>/g, '')
    // The sanitizer emits entities; a description showing "&amp;" reads as a
    // mistake to anyone who sees it.
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();

  if (!maxLength || text.length <= maxLength) {
    return text;
  }

  // Back off to a word boundary: a description ending mid-word looks broken in
  // a way a slightly shorter one does not.
  const cut = text.slice(0, maxLength);
  const lastSpace = cut.lastIndexOf(' ');
  return `${(lastSpace > maxLength * 0.6 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`;
}
