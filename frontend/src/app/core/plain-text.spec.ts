import { plainText } from './plain-text';

describe('plainText', () => {
  it('strips the markup an excerpt now arrives with', () => {
    expect(plainText('<p>An exploration of <em>language</em>.</p>')).toBe(
      'An exploration of language.',
    );
  });

  it('does not run adjacent blocks into one word', () => {
    // Without a space for the tag boundary this reads "wordsWords".
    expect(plainText('<p>words</p><p>Words</p>')).toBe('words Words');
  });

  it('decodes the entities the sanitizer emits', () => {
    expect(plainText('<p>Done &amp; dusted</p>')).toBe('Done & dusted');
  });

  it('leaves plain text alone', () => {
    // Every excerpt written before the column became markup.
    expect(plainText('A quiet teaser.')).toBe('A quiet teaser.');
  });

  it('returns empty for nothing at all', () => {
    expect(plainText(undefined)).toBe('');
    expect(plainText(null)).toBe('');
    expect(plainText('   ')).toBe('');
  });

  it('truncates at a word boundary, not mid-word', () => {
    const result = plainText('one two three four five six seven', 14);
    expect(result).toBe('one two three…');
  });

  it('strips before truncating, so a tag is never cut in half', () => {
    // The bug this replaced: slicing the HTML first left "<stro" in the tag.
    const result = plainText('<p>Words shape <strong>worlds</strong> quietly.</p>', 16);
    expect(result).not.toContain('<');
    expect(result).toBe('Words shape…');
  });

  it('leaves text shorter than the limit untouched', () => {
    expect(plainText('<p>Short.</p>', 200)).toBe('Short.');
  });
});
