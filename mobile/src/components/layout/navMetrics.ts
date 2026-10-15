/**
 * navMetrics — where every page starts, stated once.
 * ─────────────────────────────────────────────────────────────
 * TopNavBar's styles are BUILT from these constants, so nothing here can
 * describe a bar that isn't the one on screen. The Concierge menu anchors
 * itself under the ＋ by computing the button's position rather than measuring
 * it (measuring makes the first open flicker into place), which is only safe
 * while the numbers are shared.
 *
 * Every page's top is read from here too, one helper per kind of page:
 *
 *   a tab              useTabContentTop()     the bar's measured height + TAB_CONTENT_GAP
 *   a pushed screen    usePushedHeaderTop()   the status bar's edge + PUSHED_HEADER_GAP
 *   a modal route      useModalTop()          an iOS sheet's own top, or Android's status bar
 *   an overlay         useOverlayTop()        the status bar's edge, or a sheet's top
 *
 * No other file adds to the safe-area inset by hand (noPageAddsToTheInset.guard.test.ts).
 * The status bar's edge has a 20pt floor: on a zero-inset device the bar is
 * still 20pt down, and a bare inset would tuck a masthead under it.
 */
import { createContext, useContext, useSyncExternalStore } from 'react';
import { Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

/** Horizontal padding on the bar — also the ＋ button's distance from the edge. */
export const NAV_H_PADDING = 16;

/** Minimum height of the icon row. The buttons are shorter, so they centre in it. */
export const NAV_ROW_MIN_H = 44;

/** Diameter of every icon button in the bar, the brass ＋ included. */
export const NAV_BTN_SIZE = 38;

/** Padding below the icon row, before the hairline border. */
export const NAV_BOTTOM_PADDING = 10;

/** The least room kept for the status bar, on a device that reports none. */
export const STATUS_BAR_FLOOR = 20;

/** Where the bar's content starts: the status bar's edge, never above the floor. */
export const navTopPadding = (insetTop: number) => Math.max(insetTop, STATUS_BAR_FLOOR);

/** Top edge of the icon buttons, in screen coordinates. */
export const navButtonTop = (insetTop: number) =>
  navTopPadding(insetTop) + (NAV_ROW_MIN_H - NAV_BTN_SIZE) / 2;

/** Bottom edge of the icon buttons, in screen coordinates. */
export const navButtonBottom = (insetTop: number) => navButtonTop(insetTop) + NAV_BTN_SIZE;

/** The whole top bar's height: its floor, the icon row, the padding under it. */
export const navBarHeight = (insetTop: number) => navTopPadding(insetTop) + NAV_ROW_MIN_H + NAV_BOTTOM_PADDING;

// ── the top bar's measured height ─────────────────────────────────────────────

/** The bar's last measured height, and the inset it was measured at. */
let measured: { insetTop: number; height: number } | null = null;
const listeners = new Set<() => void>();

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
};

/** The bar's height at this inset: as measured, or, before it is, as built. */
const barHeightAt = (insetTop: number) =>
  measured && measured.insetTop === insetTop ? measured.height : navBarHeight(insetTop);

/**
 * TopNavBar's onLayout reports here. A tab re-renders only when the height it
 * reads changes: never on a scroll, and not when the measure agrees with the build.
 */
export function reportTopBarHeight(insetTop: number, height: number) {
  if (measured && measured.insetTop === insetTop && measured.height === height) return;
  measured = { insetTop, height };
  listeners.forEach((listener) => listener());
}

/** Forgets the measure (for tests). */
export function resetTopBarHeight() {
  measured = null;
  listeners.forEach((listener) => listener());
}

/** The bar's padding above its icon row: the status bar's edge. */
export function useTopBarPadding() {
  return navTopPadding(useSafeAreaInsets().top);
}

/**
 * The bar's height, as it measured itself. Its first frame is already right:
 * until the bar has laid out, it is the height the bar is built to.
 */
export function useTopBarHeight() {
  const insetTop = useSafeAreaInsets().top;
  return useSyncExternalStore(subscribe, () => barHeightAt(insetTop));
}

// ── a tab: under the bar ──────────────────────────────────────────────────────

/** Between the bar's bottom edge and a tab's first line: the Lobby's own 12. */
export const TAB_CONTENT_GAP = 12;

/** Where a tab's content starts: below the bar the tab is drawn under. */
export function useTabContentTop() {
  return useTopBarHeight() + TAB_CONTENT_GAP;
}

/** A centred tab's padding: its content centres in the room between the two bars. */
export function useTabRoomPadding() {
  const top = useTabContentTop();
  const bottom = tabBarHeight(useSafeAreaInsets().bottom);
  return { paddingTop: top, paddingBottom: bottom };
}

// ── a pushed screen: no bar above it ──────────────────────────────────────────

/** Between the status bar's edge and a pushed screen's header: the back button's row. */
export const PUSHED_HEADER_GAP = 10;

/** Where a pushed screen's header starts, at this inset. */
export const pushedHeaderTop = (insetTop: number) => navTopPadding(insetTop) + PUSHED_HEADER_GAP;

/** Where this pushed screen's header starts. It never waits for the tab bar. */
export function usePushedHeaderTop() {
  return pushedHeaderTop(useSafeAreaInsets().top);
}

// ── a modal route ─────────────────────────────────────────────────────────────

/** Between a modal's top edge and its first line: the drag handle's own 10. */
export const MODAL_TOP_GAP = 10;

/** Where a modal route starts: iOS, a sheet's own top; Android, below the status bar. */
export const modalTop = (insetTop: number, os: string = Platform.OS) =>
  os === 'ios' ? MODAL_TOP_GAP : navTopPadding(insetTop) + MODAL_TOP_GAP;

/** iOS: 10, as the sheet starts below the status bar. Android: 34 at a 24pt inset. */
export function useModalTop() {
  return modalTop(useSafeAreaInsets().top);
}

// ── an overlay ────────────────────────────────────────────────────────────────

/** Between the top an overlay is drawn from and its close button, or its toast. */
export const OVERLAY_GAP = 10;

/** True inside a route iOS draws as a sheet (ToastHost's screen layer provides it). */
export const InIosSheet = createContext(false);

/** Where an overlay starts: below the status bar on both platforms, or a sheet's own top. */
export const overlayTop = (insetTop: number, inIosSheet = false) =>
  inIosSheet ? OVERLAY_GAP : navTopPadding(insetTop) + OVERLAY_GAP;

/**
 * 69 at a 59pt inset; 10 in an iOS sheet. Unanswered, it asks the route it is
 * drawn in; a React Native <Modal> is always the whole screen, and passes false.
 */
export function useOverlayTop(inIosSheet?: boolean) {
  const insetTop = useSafeAreaInsets().top;
  const inSheet = useContext(InIosSheet);
  return overlayTop(insetTop, inIosSheet ?? inSheet);
}

/** The height between the status bar and the home indicator. */
export const safeAreaHeight = (windowHeight: number, insets: { top: number; bottom: number }) =>
  windowHeight - insets.top - insets.bottom;

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
