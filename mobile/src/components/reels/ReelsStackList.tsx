import React, { useCallback } from 'react';
import { View, StyleSheet, RefreshControl, ActivityIndicator } from 'react-native';
import { FlashList, FlashListRef } from '@shopify/flash-list';
import { StackData } from '@/src/components/reels/types';
import { StackCard } from '@/src/components/reels/ReelsCards';
import TactileEngine from '@/src/utils/TactileEngine';
import { nav } from '@/src/utils/typedRouter';
import Animated, { useAnimatedScrollHandler, runOnJS, type SharedValue, useSharedValue } from 'react-native-reanimated';
import { globalScrollY } from '@/src/lib/scrollBridge';
import { colors } from '@/src/theme/theme';
import { CinematicScrollbar } from '@/src/components/layout/CinematicScrollbar';

const AnimatedFlashList = Animated.createAnimatedComponent(FlashList) as any;

interface ReelsStackListProps {
  stacks: StackData[];
  refreshing: boolean;
  onRefresh: () => void;
  topPad: number;
  bottomInset?: number;
  stacksScrollY: SharedValue<number>;
  activeTabSV: SharedValue<import('@/src/components/reels/types').ReelSection>;
  handleScroll?: (e: { nativeEvent: { contentOffset: { y: number }; velocity?: { y?: number } } }, isLogs: boolean) => void;
  ListHeaderComponent: React.ReactElement;
  ListEmptyComponent: React.ReactElement;
  contentContainerStyle: import('react-native').StyleProp<import('react-native').ViewStyle>;
  listRef: React.RefObject<FlashListRef<StackData>>;
  onEndReached?: () => void;
  isFetchingNextPage?: boolean;
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
  handleScroll,
  ListHeaderComponent,
  ListEmptyComponent,
  contentContainerStyle,
  listRef,
  onEndReached,
  isFetchingNextPage,
  extraData,
}: ReelsStackListProps) {
  const renderStackItem = useCallback(({ item }: { item: StackData }) => (
    <View style={st.stackGridCell}>
      <StackCard
        stack={item}
        onPress={() => { TactileEngine.selection(); nav.push(`/stacks/${item.id}`); }}
      />
    </View>
  ), []);

  const scrollHeight = useSharedValue(0);
  const viewHeight = useSharedValue(0);
  const isScrolling = useSharedValue(false);

  const onScrollWorklet = useAnimatedScrollHandler({
    onScroll: (e) => {
      stacksScrollY.value = e.contentOffset.y;
      if (activeTabSV.value === 'stacks') {
        globalScrollY.value = e.contentOffset.y;
      }
    },
    onBeginDrag: () => { isScrolling.value = true; },
    onMomentumBegin: () => { isScrolling.value = true; },
    onMomentumEnd: (e) => {
      isScrolling.value = false;
      if (handleScroll) runOnJS(handleScroll)({ nativeEvent: { contentOffset: { y: e.contentOffset.y }, velocity: { y: 0 } } }, false);
    },
    onEndDrag: (e) => {
      isScrolling.value = false;
      if (handleScroll) runOnJS(handleScroll)({ nativeEvent: { contentOffset: { y: e.contentOffset.y }, velocity: { y: 0 } } }, false);
    }
  });

  return (
    <View style={{ flex: 1 }}>
      <AnimatedFlashList
        ref={listRef}
        key="stacks-grid"
        data={stacks}
        keyExtractor={(item: any) => String(item.id)}
        extraData={extraData}
        estimatedItemSize={234}
        numColumns={2}
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
        ListFooterComponent={isFetchingNextPage ? <ActivityIndicator color={colors.sepia} style={{ marginVertical: 20 }} /> : null}
      />
      <CinematicScrollbar scrollY={stacksScrollY} scrollHeight={scrollHeight} viewHeight={viewHeight} isScrolling={isScrolling} topInset={topPad} bottomInset={bottomInset} />
    </View>
  );
}

const st = StyleSheet.create({
  stackGridCell: { flex: 1, paddingHorizontal: 6 },
});
