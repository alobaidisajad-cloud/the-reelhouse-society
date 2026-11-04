/**
 * Each value from outside the app is checked by its kind before the app plays, opens or draws it
 * (P4.2): a YouTube key, a picture's address, an authenticator's key.
 */
import { isAuthenticatorKey, pictureUri, youtubeKey } from '../outsideValues';

describe('a YouTube key', () => {
  it('is eleven of YouTube’s own letters', () => {
    expect(['dQw4w9WgXcQ', 'a-b_c-d_e-f', '00000000000'].map(youtubeKey)).toEqual(['dQw4w9WgXcQ', 'a-b_c-d_e-f', '00000000000']);
  });

  it('is nothing of any other shape, or not a word at all', () => {
    const hostile: unknown[] = ['x" onload="a', '<script>a</s', 'dQw4w9WgXc', 'dQw4w9WgXcQQ', 'dQw4w9WgXc/',
      'dQw4w9WgXc ', 'dQw4w9WgXc\n', 'dQw4w9WgXcé', '', null, undefined, 12345678901, { key: 'dQw4w9WgXcQ' }];
    expect(hostile.map(youtubeKey)).toEqual(hostile.map(() => null));
  });
});

describe('a picture’s address', () => {
  it('is one on the web, or one the member chose on this phone, as given', () => {
    const drawn = ['https://image.tmdb.org/t/p/w342/a.jpg', 'HTTPS://img.youtube.com/vi/x/hqdefault.jpg',
      'http://10.0.2.2:54321/storage/v1/object/public/avatars/a.jpg', 'file:///data/user/0/picked.jpg',
      'content://media/external/images/1', 'ph://ABC-123', 'data:image/jpeg;base64,AAAA'];
    expect(drawn.map(pictureUri)).toEqual(drawn);
  });

  it('is no picture for any other scheme, or none at all', () => {
    const refused = ['javascript:alert(1)', 'data:text/html,<b>x</b>', 'intent://x#Intent;end', 'reelhouse://film/1',
      '//image.tmdb.org/a.jpg', '/t/p/w342/a.jpg', ' https://a.example/a.jpg', '', null, undefined];
    expect(refused.map(pictureUri)).toEqual(refused.map(() => null));
  });
});

describe('an authenticator’s key', () => {
  it('is a TOTP otpauth address, and nothing else is', () => {
    expect(isAuthenticatorKey('otpauth://totp/The%20Reelhouse:a@b.c?secret=ABC&issuer=The%20Reelhouse')).toBe(true);
    expect(['otpauth://hotp/x?secret=A', 'https://evil.example/otpauth://totp/', 'tel:123', '', null, 7]
      .map(isAuthenticatorKey)).toEqual([false, false, false, false, false, false]);
  });
});
