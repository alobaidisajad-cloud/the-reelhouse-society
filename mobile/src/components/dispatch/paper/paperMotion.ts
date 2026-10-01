/**
 * paperMotion — how the Dispatch moves.
 * ─────────────────────────────────────────────────────────────────────────────
 * The design was complete and had no motion in it at all, which is not a
 * neutral state: with nothing specified, every screen inherits whatever the
 * navigator and the platform do, and an app assembled that way feels assembled.
 *
 * ── THE ONE LAW ──────────────────────────────────────────────────────────────
 * NOTHING OVERSHOOTS: the house's law (src/theme/motion.ts, whose durations and
 * curves these are), and not relaxed for this page.
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
 * ONE EXCEPTION, AND ONLY ONE: reserving the room the KEYBOARD takes. That is a
 * height, it cannot be a transform — sliding the content up instead would carry
 * the desk's header off the top of the screen — and there is no version of
 * keyboard avoidance that does not change layout. It is also not the case the
 * law is about: it happens once when the keyboard opens, on a screen nobody is
 * scrolling, driven by the OS rather than by a list. `compose.tsx` and `PaperKeyWell`
 * do it on iOS with `useAnimatedKeyboard`; on Android the app's root does
 * (KeyboardRoom).
 *
 * The guard permits an animated style ONLY when it reads `keyboard.height`, so
 * a height animated for any other reason still fails.
 *
 * ── THE FOURTH LAW ───────────────────────────────────────────────────────────
 * `useReducedMotion()` collapses every duration to zero and every transform to
 * its end state. Nothing is *removed* under reduced motion — the state still
 * changes, it simply arrives.
 */

import { EASE, MARK_PULSE, MS } from '@/src/theme/motion';

/** The house's five durations and two curves (src/theme/motion.ts). */
export { MS, EASE };

/**
 * ── WHAT MOVES ───────────────────────────────────────────────────────────────
 * THE MARKS (certify, save): the icon pulses 1 → 1.18 → 1 over `strike`
 *   (PaperStrike). The ICON, never the row, so the marks beside it hold still.
 * THE PILL: in with opacity and an 8pt rise over `base`; out over `quick`
 *   with no movement, as the list jumps to the top (PaperMore).
 * A BALLOT'S RESULT: each rule FILLS over `considered`, linear, 40ms apart in
 *   ballot order (PaperFill): the one theatrical moment, once per ballot.
 *
 * Everything else arrives without motion. A filing (a feed prepends without a
 * transition: a row fading in reads as the list redrawing), the index's kind
 * colour, the critique spine, a removed filing's notice, and the furniture
 * (rules, margin, masthead, folio) that everything else happens on. The picker
 * and the desks come as the navigator presents them.
 */
export const STAGGER_MS = 40;

/** The mark's scale: the house's pulse, which returns to exactly 1. */
export const STRIKE_SCALE = MARK_PULSE;

/** How far the pill travels, in points (not a fraction of the screen). */
export const PILL_Y = 8;
