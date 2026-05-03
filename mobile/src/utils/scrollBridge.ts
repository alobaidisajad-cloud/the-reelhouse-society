/**
 * scrollBridge — Global scroll offset bridge for NavBar transparency.
 * 
 * Each tab writes its scrollY here on scroll.
 * TopNavBar reads it to interpolate blur/tint.
 * #11 AUDIT FIX: Supports multiple listeners via Set to prevent
 * overwrite during tab transitions.
 */
let _scrollY = 0;
const _listeners = new Set<(y: number) => void>();

export function setScrollY(y: number) {
  _scrollY = y;
  _listeners.forEach(fn => fn(y));
}

export function getScrollY() {
  return _scrollY;
}

export function onScrollYChange(fn: (y: number) => void) {
  _listeners.add(fn);
  return () => { _listeners.delete(fn); };
}
