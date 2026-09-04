/**
 * paperMotion — how the Dispatch moves.
 * ─────────────────────────────────────────────────────────────────────────────
 * The design was complete and had no motion in it at all, which is not a
 * neutral state: with nothing specified, every screen inherits whatever the
 * navigator and the platform do, and an app assembled that way feels assembled.
 *
 * ── THE ONE LAW ──────────────────────────────────────────────────────────────
 * NOTHING OVERSHOOTS. This app has no springs, no bounce, no rubber. A printed
 * page does not wobble, and a members' club does not bounce; every easing here
 * is a decelerating cubic that arrives and stops. That is already this app's
 * law elsewhere and it is not relaxed for this page.
 *
 * ── THE SECOND LAW ───────────────────────────────────────────────────────────
 * MOTION IS INFORMATION OR IT IS ABSENT. Every entry below exists because
 * something changed that a member would otherwise have to notice for
 * themselves — a mark taking, a filing arriving, a form opening. Decoration
 * that merely announces the app's own cleverness is not here, because on a page
 * a member scrolls for twenty minutes it becomes noise by the third screen.
 *
 * ── THE THIRD LAW ────────────────────────────────────────────────────────────
 * IT RUNS ON THE UI THREAD OR IT DOES NOT RUN. Everything here is opacity or
 * transform, driven by reanimated worklets. No animated width, height, margin,
 * top, or `zIndex` — those relayout every frame, and animating `zIndex` is what
 * produced this app's own worst visual bug once already.
 *
 * ── THE FOURTH LAW ───────────────────────────────────────────────────────────
 * `useReducedMotion()` collapses every duration to zero and every transform to
 * its end state. Nothing is *removed* under reduced motion — the state still
 * changes, it simply arrives.
 */

/**
 * Five durations, and nothing between them. A palette of five is a house style;
 * fourteen ad-hoc numbers is a codebase where each screen was tuned alone.
 */
export const MS = {
  /** A mark taking under the thumb. Below ~100ms a change reads as instant, and
   *  instant is exactly right for something you did yourself. */
  strike: 90,
  /** A control changing state — an index label lighting, a sort flipping. */
  quick: 140,
  /** The default. An entry arriving, a notice replacing another. */
  base: 200,
  /** Something with weight: the picker rising, the composer taking the screen. */
  considered: 280,
  /** A whole page changing. Matches the navigator so a push does not read as
   *  two animations of different lengths fighting. */
  page: 320,
} as const;

/**
 * Two curves. Entrances decelerate into place; exits accelerate away. Anything
 * that must read as mechanical rather than organic — a rule filling, a counter
 * — runs linear, because a tally that eases is a tally that looks estimated.
 */
export const EASE = {
  /** `Easing.out(Easing.cubic)` — arrives and stops. The default. */
  in: [0.22, 1, 0.36, 1] as const,
  /** `Easing.in(Easing.cubic)` — leaves without lingering. */
  out: [0.64, 0, 0.78, 0] as const,
  /** `Easing.linear` — progress, tallies, fills. */
  flat: [0, 0, 1, 1] as const,
};

/**
 * ── WHAT MOVES, AND WHY ──────────────────────────────────────────────────────
 *
 * THE MARKS (certify, save)
 *   The icon scales 1 → 1.18 → 1 over `strike`, and the count crossfades. The
 *   scale is on the ICON only, never the row: growing the row would shift the
 *   three marks beside it, and a control that moves its neighbours when you
 *   press it feels broken however brief it is.
 *   The state changes optimistically on the press. If the write fails the mark
 *   returns and the failure is said out loud — never a silent revert, which
 *   teaches a member that their taps are guesses.
 *
 * PRESSING ANYTHING ELSE
 *   `PressableScale` already carries the app's press. It is not re-specified
 *   here and it is not tuned per screen; that is what makes the whole app feel
 *   like one hand made it.
 *
 * A FILING ARRIVING — STRUCK, and not built. 2026-09-04.
 *   The entry read: opacity 0 → 1 and translateY 6 → 0 over `base`, for your
 *   own filing at the top of NEWEST.
 *
 *   It is struck for two reasons, and the first is the honest one: NO APP OF
 *   THIS CLASS ANIMATES ROWS INTO A FEED. Instagram, Letterboxd and X all
 *   prepend without a transition, because a row that fades in as it appears is
 *   the single most reliable way to make a list feel cheap — and once one row
 *   animates, a member cannot tell "my post arrived" from "the list is
 *   redrawing", which is the opposite of what the entry wanted.
 *
 *   The second is that a member does not WATCH their filing arrive: they are
 *   sent back to the feed from a desk, and it is already there. The entry was
 *   describing a moment that does not happen.
 *
 *   What actually earns motion in a feed is what this file already specifies
 *   and the app now does: the MARK under the thumb, and the PILL. Both are
 *   things the member caused and is looking at.
 *
 * HELD FILINGS (the pill)
 *   In: opacity and translateY -8 → 0 over `base`. Out: opacity over `quick`,
 *   no movement, because it leaves at the same moment the list jumps to the top
 *   and two motions at once is one too many to follow.
 *
 * THE KIND COLOUR IN THE INDEX
 *   Colour and the underline's opacity over `quick`. The underline does not
 *   slide between departments: a travelling underline is a device from another
 *   kind of app, and on a scrolling index it travels to somewhere off-screen.
 *
 * THE PICKER
 *   Rises over `considered` with the scrim fading over `base`, so the ground
 *   dims a little before the sheet arrives rather than both landing together.
 *   Dismiss is `quick` — leaving is always faster than arriving, everywhere.
 *
 * THE COMPOSER
 *   Takes the screen over `page`. The keyboard is not fought: the document is
 *   laid out with `automaticallyAdjustKeyboardInsets`, which is this app's law
 *   for router screens and the reason none of them jitter on the first tap.
 *
 * A BALLOT BEING MARKED
 *   The ✗ appears at `strike`. The rules then FILL over `considered`, linear,
 *   staggered by 40ms in ballot order. This is the one deliberately theatrical
 *   moment on the page and it has earned it: it happens once per ballot, it is
 *   the result being revealed, and the stagger is what makes a set of numbers
 *   read as a count rather than as a chart appearing.
 *
 * THE SPINE
 *   Fades in over `quick` once the post has left the screen, out over `quick`
 *   when it returns. It never slides — chrome that slides at the top of a
 *   scrolling list fights the scroll.
 *
 * A STRUCK OR REPORTED FILING
 *   Collapses to the removed notice over `base`. The row does not vanish: its
 *   critique count stays, so the conversation is visibly still there.
 *
 * WHAT NEVER MOVES
 *   The rules. The margin. The masthead. The folio. The ruling on an empty
 *   page. The page itself is the fixed thing that everything else happens on,
 *   and a page whose furniture animates is a page that never settles.
 */
export const STAGGER_MS = 40;

/** The mark's scale, and the only overshoot-shaped number in the file — it is a
 *  scale pulse, not a spring, and it returns to exactly 1. */
export const STRIKE_SCALE = 1.18;

/**
 * How far the pill travels. Points, not a fraction of the screen.
 *
 * `ARRIVE_Y` stood beside this for the arriving-filing entry, and went with it
 * — a constant kept for a decision that was struck is the next audit's phantom
 * finding.
 */
export const PILL_Y = 8;
