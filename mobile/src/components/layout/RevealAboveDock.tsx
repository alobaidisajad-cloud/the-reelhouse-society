/**
 * RevealAboveDock — what the member opens in a scroll with a docked bar is brought above the bar.
 *
 * A page with a bar docked over its foot (the log sheet's seal) scrolls its content up past the
 * bar, so something opened low on the page opens UNDER the bar: on a short phone the abandoned
 * film's reasons appeared there, and a tap meant for "Too Slow" landed on the seal (nightly
 * narrowest run 40847116101). The scroll that hosts the bar offers `reveal`; a section the member
 * has just opened asks for it once, on its first layout, and the scroll moves by exactly what
 * the section is hidden by. A section already open when the page drew never moves the page.
 */
import React, { createContext, useCallback, useContext, useRef } from 'react';
import { View } from 'react-native';
import type { NativeScrollEvent, NativeSyntheticEvent, ScrollView, StyleProp, ViewStyle } from 'react-native';

/** The room kept between what is revealed and the bar's top edge. */
export const REVEAL_MARGIN = 12;

type Box = { top: number; height: number };

/**
 * How far down to scroll so `opened` ends above the bar: 0 when it already does. Never so far
 * that its own top leaves the view: a section taller than the room shows its top.
 */
export function revealBy(opened: Box, view: Box, dock: number): number {
  const hidden = opened.top + opened.height + REVEAL_MARGIN - (view.top + view.height - dock);
  if (hidden <= 0) return 0;
  return Math.max(0, Math.min(hidden, opened.top - view.top - REVEAL_MARGIN));
}

/** The scroll's offer to what it holds; none where no scroll hosts a docked bar. */
export const RevealAboveDock = createContext<((node: View) => void) | null>(null);

/** The scroll as it is at run time: a host view as well, so it can be measured. */
type MeasuredScroll = ScrollView & Pick<View, 'measureInWindow'>;

/** For the scroll that hosts the bar: its ref, its scroll handler and the offer to provide. */
export function useRevealHost(dock: number) {
  const scroller = useRef<MeasuredScroll>(null);
  const at = useRef(0);
  const onScroll = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => { at.current = e.nativeEvent.contentOffset.y; }, []);
  const reveal = useCallback((node: View) => {
    const view = scroller.current;
    if (!view) return;
    // Both in the window's own coordinates, so neither the sheet's top nor the status bar counts.
    view.measureInWindow((_vx: number, viewTop: number, _vw: number, viewHeight: number) => {
      node.measureInWindow((_x: number, top: number, _w: number, height: number) => {
        const by = revealBy({ top, height }, { top: viewTop, height: viewHeight }, dock);
        if (by > 0) view.scrollTo({ y: at.current + by, animated: true });
      });
    });
  }, [dock]);
  return { scroller, onScroll, reveal };
}

/**
 * A section the member opens. `opened` counts the member's own opening presses: the first layout
 * after it moves on reveals the section, once; a section that mounts with it at 0 (open when the
 * page drew) never moves the page, nor does any later layout.
 */
export function RevealedOnOpen({ opened, style, children }: { opened: number; style?: StyleProp<ViewStyle>; children: React.ReactNode }) {
  const reveal = useContext(RevealAboveDock);
  const ref = useRef<View>(null);
  const shown = useRef(0);
  const onLayout = useCallback(() => {
    if (opened === shown.current) return;
    shown.current = opened;
    if (reveal && ref.current) reveal(ref.current);
  }, [opened, reveal]);
  return <View ref={ref} onLayout={onLayout} style={style}>{children}</View>;
}
