/**
 * navMetrics — the top bar's geometry, stated once.
 * ─────────────────────────────────────────────────────────────
 * TopNavBar's styles are BUILT from these constants, so nothing here can
 * describe a bar that isn't the one on screen. That matters for two reasons.
 *
 * First, the Concierge menu anchors itself under the ＋ by computing the
 * button's position rather than measuring it — measuring costs a layout pass
 * and makes the first open flicker into place. Computing is only safe while
 * the numbers are shared; the moment they are copied, the menu drifts off its
 * own button.
 *
 * Second, three screens (Lobby, Reel, Dispatch) already hand-copied the
 * `Math.max(insets.top, 20)` floor with comments pleading that "the two
 * formulas must never disagree". They now import it instead. The floor exists
 * because on a zero-inset device the bar is still 20pt down; a bare
 * `insets.top` offset would tuck a masthead under the blur.
 */

/** Horizontal padding on the bar — also the ＋ button's distance from the edge. */
export const NAV_H_PADDING = 16;

/** Minimum height of the icon row. The buttons are shorter, so they centre in it. */
export const NAV_ROW_MIN_H = 44;

/** Diameter of every icon button in the bar, the brass ＋ included. */
export const NAV_BTN_SIZE = 38;

/** Padding below the icon row, before the hairline border. */
export const NAV_BOTTOM_PADDING = 10;

/**
 * Where the bar's content starts. Never `insets.top` on its own — see the
 * zero-inset note above.
 */
export const navTopPadding = (insetTop: number) => Math.max(insetTop, 20);

/** Top edge of the icon buttons, in screen coordinates. */
export const navButtonTop = (insetTop: number) =>
  navTopPadding(insetTop) + (NAV_ROW_MIN_H - NAV_BTN_SIZE) / 2;

/** Bottom edge of the icon buttons, in screen coordinates. */
export const navButtonBottom = (insetTop: number) => navButtonTop(insetTop) + NAV_BTN_SIZE;

/** The whole top bar's height: its floor, the icon row, the padding under it. */
export const navBarHeight = (insetTop: number) => navTopPadding(insetTop) + NAV_ROW_MIN_H + NAV_BOTTOM_PADDING;

/** The tab bar's icon row, above the home indicator's room. */
export const TAB_ROW_H = 56;

/**
 * The room under the tab bar's icons: the home indicator's inset, never less
 * than 10 — the same zero-inset floor the top bar keeps, for the same reason.
 */
export const tabBarBottomPadding = (insetBottom: number) => Math.max(insetBottom, 10);

/**
 * The whole tab bar's height. The tab bar is BUILT from this ((tabs)/_layout),
 * and the Lobby sizes its first screen by it: a copy of the sum in either place
 * would let the wall's first poster slip under the bar.
 */
export const tabBarHeight = (insetBottom: number) => TAB_ROW_H + tabBarBottomPadding(insetBottom);
