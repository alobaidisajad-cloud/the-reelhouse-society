import React, { useCallback } from 'react';
import { LayoutChangeEvent } from 'react-native';
import { FlashList, FlashListProps } from '@shopify/flash-list';
import Animated, { useAnimatedScrollHandler, useSharedValue, type SharedValue } from 'react-native-reanimated';
import { CinematicScrollbar } from './CinematicScrollbar';

interface CinematicFlashListProps<T> extends Omit<FlashListProps<T>, 'onScroll'> {
  externalScrollY?: SharedValue<number>;
  scrollMetrics?: {
    scrollY: SharedValue<number>;
    scrollHeight: SharedValue<number>;
    viewHeight: SharedValue<number>;
    isScrolling: SharedValue<boolean>;
  };
  topInset?: number;
  bottomInset?: number;
  onScroll?: any; // To support Reanimated worklets when controlled
  onLayout?: (event: LayoutChangeEvent) => void;
}

const AnimatedFlashList = Animated.createAnimatedComponent(FlashList) as any;

/** For a vertical list that never adds items above the ones on screen. */
export const NOT_ANCHORED = { disabled: true } as const;
/**
 * For a list that does (a new notice arrives at the top): a member reading lower
 * down keeps their place, and one at the top stays at the top.
 */
export const ANCHORED_BELOW_THE_TOP = { autoscrollToTopThreshold: 48 } as const;

export const CinematicFlashList = React.forwardRef<any, CinematicFlashListProps<any>>(({
  externalScrollY,
  scrollMetrics,
  topInset,
  bottomInset,
  horizontal,
  onScroll,
  onLayout,
  onContentSizeChange,
  ...rest
}, ref) => {
  // DX Guardrail: Prevent silent failure of the cinematic scrollbar
  if (__DEV__ && onScroll && !scrollMetrics) {
    console.warn("Cinematic Scroll: 'onScroll' was provided without 'scrollMetrics'. The custom scrollbar will not sync. Please provide 'scrollMetrics'.");
  }
  // Internal values for the scrollbar
  const internalScrollY = useSharedValue(0);
  const internalScrollHeight = useSharedValue(0);
  const internalViewHeight = useSharedValue(0);
  const internalIsScrolling = useSharedValue(false);
  const internalViewY = useSharedValue(0);

  const activeScrollY = scrollMetrics?.scrollY ?? internalScrollY;
  const activeScrollHeight = scrollMetrics?.scrollHeight ?? internalScrollHeight;
  const activeViewHeight = scrollMetrics?.viewHeight ?? internalViewHeight;
  const activeIsScrolling = scrollMetrics?.isScrolling ?? internalIsScrolling;

  const handleContentSizeChange = useCallback((w: number, h: number) => {
    activeScrollHeight.value = h;
    if (onContentSizeChange) onContentSizeChange(w, h);
  }, [onContentSizeChange, activeScrollHeight]);

  const handleLayout = useCallback((event: LayoutChangeEvent) => {
    internalViewY.value = event.nativeEvent.layout.y;
    activeViewHeight.value = event.nativeEvent.layout.height;
    if (onLayout) onLayout(event);
  }, [onLayout, activeViewHeight, internalViewY]);

  const internalScrollHandler = useAnimatedScrollHandler({
    onScroll: (event) => {
      activeScrollY.value = event.contentOffset.y;
      activeScrollHeight.value = event.contentSize.height;
      activeViewHeight.value = event.layoutMeasurement.height;
      if (externalScrollY) {
        externalScrollY.value = event.contentOffset.y;
      }
    },
    onBeginDrag: () => {
      activeIsScrolling.value = true;
    },
    onEndDrag: () => {
      activeIsScrolling.value = false;
    },
    onMomentumBegin: () => {
      activeIsScrolling.value = true;
    },
    onMomentumEnd: () => {
      activeIsScrolling.value = false;
    }
  });

  // Horizontal Guard: Cinematic scrollbar is vertical-only
  if (horizontal) {
    return (
      <AnimatedFlashList
        ref={ref}
        horizontal
        onScroll={onScroll}
        showsHorizontalScrollIndicator={false}
        overScrollMode="never"
        keyboardShouldPersistTaps="handled"
        {...rest}
      />
    );
  }

  const scrollHandler = onScroll ? onScroll : internalScrollHandler;

  return (
    <>
      <AnimatedFlashList
        ref={ref}
        onScroll={scrollHandler}
        onLayout={handleLayout}
        onContentSizeChange={handleContentSizeChange}
        scrollEventThrottle={16}
        showsVerticalScrollIndicator={false}
        overScrollMode="never"
        /**
         * ── THE DOUBLE TAP ───────────────────────────────────────────────────
         * `keyboardShouldPersistTaps` defaults to 'never', which means a tap
         * landing anywhere outside the focused input DISMISSES THE KEYBOARD AND
         * IS THEN SWALLOWED. So in every room with a search box: type a title,
         * see the film, tap it — the keyboard closes and nothing opens. Tap
         * again and it works. It reads as the app ignoring you.
         *
         * Eight other places in this app already set 'handled'; the five
         * profile rooms were the ones that never did, and they all reach the
         * list through here. Set BEFORE {...rest} so any caller can still
         * override it.
         *
         * 'on-drag' is the other half: scrolling a list of results while the
         * keyboard covers half the screen should put the keyboard away.
         */
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        // FlashList anchors the first item by default: a header measured after
        // the items arrive (fonts, images) then scrolled the page down past its
        // own top, the Darkroom opening below its search. These pages never add
        // above what is shown, so they are not anchored; a caller may opt in.
        maintainVisibleContentPosition={NOT_ANCHORED}
        {...rest}
      />
      <CinematicScrollbar
        scrollY={activeScrollY}
        scrollHeight={activeScrollHeight}
        viewHeight={activeViewHeight}
        isScrolling={activeIsScrolling}
        viewY={internalViewY}
        topInset={topInset}
        bottomInset={bottomInset}
      />
    </>
  );
});

CinematicFlashList.displayName = 'CinematicFlashList';
