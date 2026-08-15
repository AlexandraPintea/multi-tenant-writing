import { mediaUrl } from './media';

const DEV = 'http://127.0.0.1:8001/api';
const PROD = '/api';

/**
 * The bug this guards against: the writings list rendered
 * `<img src="/media/posts/covers/x.jpg">`, which the browser resolved against
 * the dev server rather than Django. The dev server serves index.html for
 * unknown paths, so the request succeeded with text/html and the cover never
 * appeared.
 */
describe('mediaUrl', () => {
  it('re-bases a Django path onto the API origin in development', () => {
    expect(mediaUrl('/media/posts/covers/x.jpg', DEV)).toBe(
      'http://127.0.0.1:8001/media/posts/covers/x.jpg',
    );
  });

  it('leaves the path alone when the API shares our origin', () => {
    // Production: nginx serves /media itself, and a relative path keeps the
    // hostname out of the HTML.
    expect(mediaUrl('/media/posts/covers/x.jpg', PROD)).toBe('/media/posts/covers/x.jpg');
  });

  it('passes an already-absolute URL through untouched', () => {
    const url = 'https://cdn.example.com/x.jpg';
    expect(mediaUrl(url, DEV)).toBe(url);
  });

  it('returns an empty string for a missing image', () => {
    // cover_image and portrait are both nullable; binding null to [src] would
    // request the current page as an image.
    expect(mediaUrl(null, DEV)).toBe('');
    expect(mediaUrl(undefined, DEV)).toBe('');
    expect(mediaUrl('', DEV)).toBe('');
  });

  it('tolerates a path with no leading slash', () => {
    expect(mediaUrl('media/x.jpg', DEV)).toBe('http://127.0.0.1:8001/media/x.jpg');
  });
});
