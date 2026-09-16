/**
 * openSociety — the one way to walk a member to the Society page.
 * ─────────────────────────────────────────────────────────────────────────────
 * Two things open the Society: a rope the member taps before an act
 * (`useClearance`), and a refusal the house gives after one (`showTierDoor`).
 * They used to travel differently, and the rope's way was wrong.
 *
 * `useClearance` dismissed the current screen whenever `router.canGoBack()` was
 * true, on the reasoning that the log and the writing desk are presented
 * modally and UIKit will not present a second modal over a first. That is true
 * of those screens. But `canGoBack()` is also true of every ordinary pushed
 * screen — so a member who tapped "take a seat" in a salon had the SALON closed
 * behind the Society, and came back to the corridor instead of the room they
 * were trying to join. The same happened on the archive and the profile editor.
 *
 * So the decision is made on what the screen IS, not on whether there is
 * history behind it:
 *
 *   presented (see modalRoutes.ts) → dismiss, then travel on the next frame
 *   pushed                         → travel; the Society rises over it and
 *                                    closing the Society leaves them in place
 *
 * A sheet drawn with React Native's own <Modal> is a third kind and cannot be
 * seen from the route at all — it sits above the whole navigator on every
 * route. Those close themselves and call this once they are gone; see
 * CreateLoungeSheet, which follows the Concierge's presentation law.
 *
 * ── WHY THE PATH IS TRACKED RATHER THAN READ ────────────────────────────────
 * `usePathname()` is a hook, and a refusal arrives in a store, where hooks do
 * not exist. `PathTracker` in the root layout writes the pathname here on every
 * navigation, so both callers read the same answer and the rule lives in one
 * place instead of being re-derived in two.
 */
import { router } from 'expo-router';

import { isModalPath } from '@/src/constants/modalRoutes';
import type { Rank } from '@/src/constants/gatedFeatures';

let currentPath: string | null = null;

/** Written by `PathTracker` in the root layout. Nothing else should call it. */
export function noteCurrentPath(pathname: string | null): void {
  currentPath = pathname;
}

/** The Society page, told why the member came and where they were. */
export function societyHref(reason: string, rank: Rank, returnTo?: string): string {
  const params = new URLSearchParams({ reason, rank });
  if (returnTo) params.set('returnTo', returnTo);
  return `/membership?${params.toString()}`;
}

export function openSociety(href: string): void {
  const push = router.push as (h: string) => void;

  if (isModalPath(currentPath) && router.canGoBack()) {
    // Park, dismiss, then travel. The next frame is enough for a ROUTE modal:
    // the navigator reconciles the pop and the push in its own transition. It
    // is NOT enough for a React Native <Modal> — those wait for onDismiss.
    router.back();
    requestAnimationFrame(() => push(href));
    return;
  }

  push(href);
}
