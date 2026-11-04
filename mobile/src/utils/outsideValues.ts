/**
 * outsideValues — the checks a value from outside the app passes before the app plays, opens or
 * draws it (P4.2).
 *
 * TMDB, JustWatch, the wire's feeds, a push and the auth server all hand the app values it then
 * puts somewhere that acts on them: a video key into the trailer player's page, an address into a
 * picture, a link into the phone. Each kind has its one check here (a link's is
 * isSafeDeepLinkUrl, beside the schemes it allows), and everyOutsideValueIsChecked fails on a
 * value that reaches one of those places without it.
 */

/** YouTube's own shape for a video's id: eleven letters, digits, '-' or '_'. */
const YOUTUBE_KEY = /^[A-Za-z0-9_-]{11}$/;

/**
 * A YouTube video's key, or null for anything else. The key is written into the player's page
 * and its thumbnail's address, so a key of any other shape (a quote, a tag, a path) is never one.
 */
export function youtubeKey(key: unknown): string | null {
  return typeof key === 'string' && YOUTUBE_KEY.test(key) ? key : null;
}

/** A picture the member chose on this phone (a new avatar, a cover) before it is sent. */
const ON_THIS_PHONE = /^(file|content|ph|assets-library):|^data:image\//i;

/**
 * A picture's address as the app may draw it, or null for none: one on the web (whether the
 * phone fetches an http one is its own network rule: the launch builds refuse it, the sealed
 * world's local stack serves one), or one the member chose on this phone. Any other scheme is
 * no picture.
 */
export function pictureUri(uri: string | null | undefined): string | null {
  return uri && (/^https?:\/\//i.test(uri) || ON_THIS_PHONE.test(uri)) ? uri : null;
}

/** An authenticator's key as the auth server gives it to be registered: a TOTP otpauth address. */
export function isAuthenticatorKey(uri: unknown): uri is string {
  return typeof uri === 'string' && /^otpauth:\/\/totp\//.test(uri);
}
