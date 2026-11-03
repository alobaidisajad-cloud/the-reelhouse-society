import React, { useCallback, useMemo } from 'react';
import { View, RefreshControl } from 'react-native';
import { FlashList, FlashListRef } from '@shopify/flash-list';
import { NOT_ANCHORED } from '@/src/components/layout/CinematicFlashList';
import { StackData } from '@/src/components/reels/types';
import { StackCan, CurateCan, canGrid, rowHeight } from '@/src/components/reels/StackCan';
import { useColumnWidth } from '@/src/components/layout/navMetrics';
import { useTextScale, useLineScale } from '@/src/hooks/useTextScale';
import { displayTextProps } from '@/src/constants/textScaling';
import TactileEngine from '@/src/utils/TactileEngine';
import { nav } from '@/src/utils/typedRouter';
import Animated, { useAnimatedScrollHandler, type SharedValue, useSharedValue } from 'react-native-reanimated';
import { globalScrollY } from '@/src/lib/scrollBridge';
import { colors } from '@/src/theme/theme';
import { CinematicScrollbar } from '@/src/components/layout/CinematicScrollbar';
import { useScrollTraceOf } from '@/src/hooks/useScrollTrace';

const AnimatedFlashList = Animated.createAnimatedComponent(FlashList) as any;

interface ReelsStackListProps {
  stacks: StackData[];
  refreshing: boolean;
  onRefresh: () => void;
  topPad: number;
  bottomInset?: number;
  stacksScrollY: SharedValue<number>;
  activeTabSV: SharedValue<import('@/src/components/reels/types').ReelSection>;
  ListHeaderComponent: React.ReactElement;
  ListEmptyComponent: React.ReactElement;
  /** The empty can at the head of the grid: where a stack is begun. */
  onCurate: () => void;
  contentContainerStyle: import('react-native').StyleProp<import('react-native').ViewStyle>;
  listRef: React.RefObject<FlashListRef<StackData>>;
  onEndReached?: () => void;
  /** The grid's foot: the next cans being read, or their failure. */
  footer: React.ReactElement | null;
  extraData?: any;
}

export function ReelsStackList({
  stacks,
  refreshing,
  onRefresh,
  topPad,
  bottomInset,
  stacksScrollY,
  activeTabSV,
  ListHeaderComponent,
  ListEmptyComponent,
  onCurate,
  contentContainerStyle,
  listRef,
  onEndReached,
  footer,
  extraData,
}: ReelsStackListProps) {
  const column = useColumnWidth();
  const d = useTextScale(displayTextProps.maxFontSizeMultiplier);
  const t = useTextScale();
  const lineD = useLineScale(displayTextProps.maxFontSizeMultiplier);
  const lineT = useLineScale();
  const scale = useMemo(() => ({ d, t, lineD, lineT }), [d, t, lineD, lineT]);
  const grid = canGrid(column);
  // The empty can leads the grid while there are cans; with none, the list's empty state says so.
  const data: (StackData | typeof CURATE)[] = useMemo(() => (stacks.length ? [CURATE, ...stacks] : []), [stacks]);
  // Every can in a row as tall as the row's tallest label.
  const rows = useMemo(() => {
    const heights: number[] = [];
    for (let r = 0; r * grid.cols < data.length; r++) {
      const row = data.slice(r * grid.cols, (r + 1) * grid.cols).filter((s): s is StackData => s !== CURATE);
      heights.push(rowHeight(row, grid.can, scale));
    }
    return heights;
  }, [data, grid.cols, grid.can, scale]);

  const renderStackItem = useCallback(({ item, index }: { item: StackData | typeof CURATE; index: number }) => {
    const height = rows[Math.floor(index / grid.cols)] ?? 0;
    return (
      <View style={grid.pad(index % grid.cols)}>
        {item === CURATE ? <CurateCan height={height} onPress={onCurate} /> : (
          <View testID="reel-stack">
            <StackCan stack={item} width={grid.can} height={height} onPress={() => { TactileEngine.selection(); nav.push(`/stacks/${item.id}`); }} />
          </View>
        )}
      </View>
    );
  }, [rows, grid, onCurate]);

  const scrollHeight = useSharedValue(0);
  const viewHeight = useSharedValue(0);
  const isScrolling = useSharedValue(false);
  // Each scroll measured on the phones, as one transaction (useScrollTrace).
  useScrollTraceOf(isScrolling, 'stacks');

  const onScrollWorklet = useAnimatedScrollHandler({
    onScroll: (e) => {
      stacksScrollY.set(e.contentOffset.y);
      if (activeTabSV.value === 'stacks') {
        globalScrollY.value = e.contentOffset.y;
      }
    },
    onBeginDrag: () => { isScrolling.set(true); },
    onMomentumBegin: () => { isScrolling.set(true); },
    onMomentumEnd: () => { isScrolling.set(false); },
    onEndDrag: () => { isScrolling.set(false); },
  });

  return (
    <View style={{ flex: 1 }}>
      <AnimatedFlashList
        ref={listRef}
        key="stacks-grid"
        data={data}
        maintainVisibleContentPosition={NOT_ANCHORED}
        keyExtractor={(item: StackData | typeof CURATE) => (item === CURATE ? 'curate' : String(item.id))}
        extraData={extraData}
        estimatedItemSize={250}
        numColumns={grid.cols}
        renderItem={renderStackItem}
        contentContainerStyle={contentContainerStyle}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={ListHeaderComponent}
        ListEmptyComponent={ListEmptyComponent}
        onScroll={onScrollWorklet}
        onContentSizeChange={(_w: number, h: number) => { scrollHeight.value = h; }}
        onLayout={(e: any) => { viewHeight.value = e.nativeEvent.layout.height; }}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        overScrollMode="never"
        scrollEventThrottle={16}
        drawDistance={500}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.sepia}
            progressViewOffset={topPad}
          />
        }
        onEndReached={onEndReached}
        onEndReachedThreshold={0.5}
        ListFooterComponent={footer}
      />
      <CinematicScrollbar scrollY={stacksScrollY} scrollHeight={scrollHeight} viewHeight={viewHeight} isScrolling={isScrolling} topInset={topPad} bottomInset={bottomInset} />
    </View>
  );
}

/** The empty can's place in the grid. */
const CURATE = 'curate' as const;
