/**
 * modalRoutes — which screens are PRESENTED rather than pushed.
 * ─────────────────────────────────────────────────────────────────────────────
 * The difference decides how the Society page may be opened from a screen:
 *
 *   a presented screen (the log, the writing desk, the share sheet) must be
 *   dismissed FIRST — asking UIKit to present a second view controller while
 *   the first is still up strands the member with nothing to dismiss;
 *
 *   an ordinary screen (a salon, the archive, your profile editor) must NOT be
 *   — the Society is a modal and rises over it, and closing the Society puts
 *   the member back exactly where they were.
 *
 * `useClearance` used to dismiss whenever `router.canGoBack()` was true, which
 * is also true of every pushed screen. So a member who tapped "take a seat" in a
 * salon had the salon closed behind the Society page, and landed in the
 * corridor when they came back.
 *
 * This list is the source of truth for that decision, and it is not
 * hand-maintained: `theSocietyOpensOverYou.test.ts` derives it from the
 * `presentation:` options in `app/_layout.tsx` and fails if the two disagree.
 * Pathnames, not route names — expo-router strips `(group)` segments, so
 * `(modals)/log-modal` is reached at `/log-modal`.
 */
export const MODAL_PATHS = [
  '/cover-picker',
  '/dispatch/compose',
  '/list-modal',
  '/log-modal',
  '/login',
  '/membership',
  '/notifications-modal',
  '/search-modal',
  '/social-modal',
] as const;

const SET = new Set<string>(MODAL_PATHS);

/** Is the member currently looking at a presented screen? */
export function isModalPath(pathname: string | null | undefined): boolean {
  if (!pathname) return false;
  // A trailing slash or query must not turn a modal into a card.
  const bare = pathname.split('?')[0].replace(/\/+$/, '') || '/';
  return SET.has(bare);
}
