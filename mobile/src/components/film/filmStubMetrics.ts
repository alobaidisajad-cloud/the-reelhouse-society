/**
 * filmStubMetrics — the docked stub's geometry, stated once.
 *
 * ── WHY THIS IS A FILE AND NOT THREE NUMBERS IN A STYLESHEET ────────────────
 * A docked control has to agree with the scroll that reserves room for it. The
 * moment those two numbers are written in two places they drift, and the
 * symptom is the last row of the page sitting under the bar for ever — which
 * looks like a padding bug and is actually two constants disagreeing.
 *
 * So the height is DERIVED here, the scroll subtracts it from here, and a test
 * re-derives it from these same parts rather than hardcoding what it expects.
 */

/** The brass plate itself. 46 read as a control; 52 reads as a plate. */
export const STUB_HEIGHT = 52;

/** Air above the plate, inside the dock. */
export const STUB_PAD_TOP = 10;

/** The dock's hairline. Counted, because a pixel that exists is a pixel. */
export const STUB_BORDER = 1;

/**
 * The height of the whole dock for a given bottom safe-area inset.
 *
 * `Math.max(inset, 16)` because a phone with no home indicator still needs the
 * plate held off the glass — an inset of 0 would sit it flush against the
 * bottom edge, which reads as a rendering error rather than a design.
 */
export function dockHeight(bottomInset: number): number {
  return STUB_PAD_TOP + STUB_HEIGHT + Math.max(bottomInset, 16) + STUB_BORDER;
}

/**
 * What the scroll must reserve so the last line of the page clears the dock.
 * The extra 24 is breathing room, not padding for its own sake: without it the
 * final row ends exactly at the hairline and looks clipped.
 */
export function scrollReserve(bottomInset: number): number {
  return dockHeight(bottomInset) + 24;
}

/**
 * ── MEASURED, NOT GUESSED ───────────────────────────────────────────────────
 * The tray is a head, six acts, a perforation and the dock. At 390x844 that is
 * 559pt and fits with 285 to spare, which is why twelve rounds of mockups at
 * that size never showed a problem. On an iPhone SE at Dynamic Type 1.35 it is
 * 751pt on a 667pt screen — the head, the film's title and the primary LOG row
 * pushed clean off the top.
 *
 * So the tray is capped against the LIVE window height and its act list
 * scrolls. On any ordinary phone at ordinary type nothing scrolls and none of
 * this is visible; it engages only where the alternative is losing the primary
 * act off-screen.
 */
export const TRAY_MAX_RATIO = 0.85;

export function trayMaxHeight(windowHeight: number): number {
  return Math.round(windowHeight * TRAY_MAX_RATIO);
}
