/**
 * askIn — a stranger sent to the sign-in from where they stand, and brought back there (P4.21).
 *
 * Every act a member alone may do (a log, a follow, a save, a share, a purchase) asks a stranger
 * to identify themselves first. Sent to a bare sign-in, they landed on the Lobby, and what they
 * were doing was lost. The sign-in is told where they stood (the screen whole: its path and its
 * query, noted by PathTracker); signed in, they are returned to it (signInReturn.ts).
 */
import { currentHref } from '@/src/utils/openSociety';
import { signInHref } from '@/src/utils/signInReturn';
import { nav } from '@/src/utils/typedRouter';

/** Over the screen, to sign in (or, with 'signup', to join), coming back to it after. */
export function askIn(action?: 'signup'): void {
  nav.push(signInHref(currentHref(), action));
}
