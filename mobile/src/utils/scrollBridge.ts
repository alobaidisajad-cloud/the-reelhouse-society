/**
 * scrollBridge — Global scroll offset bridge for NavBar transparency.
 * 
 * Each tab writes its scrollY here on scroll.
 * TopNavBar reads it to interpolate blur/tint.
 * Uses simple callback pattern — zero state, zero re-renders.
 */
let _scrollY = 0;
let _listener: ((y: number) => void) | null = null;

export function setScrollY(y: number) {
  _scrollY = y;
  _listener?.(y);
}

export function getScrollY() {
  return _scrollY;
}

export function onScrollYChange(fn: (y: number) => void) {
  _listener = fn;
  return () => { _listener = null; };
}
