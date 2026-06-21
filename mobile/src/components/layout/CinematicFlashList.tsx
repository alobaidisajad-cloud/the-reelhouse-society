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
