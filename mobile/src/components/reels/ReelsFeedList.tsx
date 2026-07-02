import React, { useCallback, useRef, useEffect } from 'react';
import { RefreshControl, InteractionManager, ActivityIndicator, View, Text, StyleSheet } from 'react-native';
import { FlashList, FlashListRef } from '@shopify/flash-list';
import { ActivityCard, FeedItem } from '@/src/components/feed/ActivityCard';
import Animated, { useAnimatedScrollHandler, runOnJS, type SharedValue, useSharedValue } from 'react-native-reanimated';
import { globalScrollY } from '@/src/lib/scrollBridge';
import { colors, fonts } from '@/src/theme/theme';
import { tmdb } from '@/src/lib/tmdb';
import { CinematicScrollbar } from '@/src/components/layout/CinematicScrollbar';

const AnimatedFlashList = Animated.createAnimatedComponent(FlashList) as any;

interface ReelsFeedListProps {
  feed: FeedItem[];
  refreshing: boolean;
  onRefresh: () => void;
  topPad: number;
  bottomInset?: number;
  overallLogsScrollY: SharedValue<number>;
  activeTabSV: SharedValue<import('@/src/components/reels/types').ReelSection>;
  handleScroll?: (e: { nativeEvent: { contentOffset: { y: number }; velocity?: { y?: number } } }, isLogs: boolean) => void;
  ListHeaderComponent: React.ReactElement;
  ListEmptyComponent: React.ReactElement;
  contentContainerStyle: import('react-native').StyleProp<import('react-native').ViewStyle>;
  listRef: React.RefObject<FlashListRef<FeedItem>>;
  onEndReached?: () => void;
  isFetchingNextPage?: boolean;
  extraData?: any;
}

export function ReelsFeedList({
  feed,
  refreshing,
  onRefresh,
  topPad,
  bottomInset,
  overallLogsScrollY,
  activeTabSV,
  handleScroll,
  ListHeaderComponent,
  ListEmptyComponent,
  contentContainerStyle,
  listRef,
  onEndReached,
  isFetchingNextPage,
  extraData,
}: ReelsFeedListProps) {
  const renderLogItem = useCallback(({ item, index }: { item: FeedItem; index: number }) => (
    <ActivityCard item={item} index={index} />
  ), []);

  const viewabilityConfig = useRef({
    minimumViewTime: 800,
    itemVisiblePercentThreshold: 80,
  }).current;

  const prefetchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const interactionHandle = useRef<{ cancel: () => void } | null>(null);

  const scrollHeight = useSharedValue(0);
  const viewHeight = useSharedValue(0);
  const isScrolling = useSharedValue(false);

  useEffect(() => {
    return () => {
      if (prefetchTimeout.current) clearTimeout(prefetchTimeout.current);
      if (interactionHandle.current) interactionHandle.current.cancel();
    };
  }, []);

  const onViewableItemsChanged = useRef(({ viewableItems }: { viewableItems: import('react-native').ViewToken[] }) => {
    if (prefetchTimeout.current) clearTimeout(prefetchTimeout.current);
    
    prefetchTimeout.current = setTimeout(() => {
      interactionHandle.current = InteractionManager.runAfterInteractions(() => {
        viewableItems.forEach((vi) => {
          const item = vi.item as Partial<FeedItem>;
          if (item && item.film_id) {
            // Static import removes microtask GC bloat
            tmdb.detail(item.film_id!).catch(() => {});
          }
        });
      });
    }, 150);
  }).current;

  // Move scroll tracking 100% to the UI thread to stop bridge flooding
  const onScrollWorklet = useAnimatedScrollHandler({
    onScroll: (e) => {
      overallLogsScrollY.value = e.contentOffset.y;
      if (activeTabSV.value === 'logs') {
        globalScrollY.value = e.contentOffset.y;
      }
    },
    onBeginDrag: () => { isScrolling.value = true; },
    onMomentumBegin: () => { isScrolling.value = true; },
    onMomentumEnd: (e) => {
      isScrolling.value = false;
      // Sync the final scroll position back to JS thread for focus restoration logic
      if (handleScroll) runOnJS(handleScroll)({ nativeEvent: { contentOffset: { y: e.contentOffset.y }, velocity: { y: 0 } } }, true);
    },
    onEndDrag: (e) => {
      isScrolling.value = false;
      if (handleScroll) runOnJS(handleScroll)({ nativeEvent: { contentOffset: { y: e.contentOffset.y }, velocity: { y: 0 } } }, true);
    }
  });

  return (
    <View style={{ flex: 1 }}>
      <AnimatedFlashList
        ref={listRef}
        key="logs-feed"
        data={feed}
        // Maximum JS-thread throughput by directly referencing guaranteed id
        keyExtractor={(item: any) => String(item.id)}
        extraData={extraData}
        estimatedItemSize={230}
        renderItem={renderLogItem}
        contentContainerStyle={contentContainerStyle}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={ListHeaderComponent}
        ListEmptyComponent={ListEmptyComponent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.sepia}
            progressViewOffset={topPad}
          />
        }
        onScroll={onScrollWorklet}
        onContentSizeChange={(_w: number, h: number) => { scrollHeight.value = h; }}
        onLayout={(e: any) => { viewHeight.value = e.nativeEvent.layout.height; }}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        overScrollMode="never"
        bounces={true}
        scrollEventThrottle={16}
        drawDistance={250}
        viewabilityConfig={viewabilityConfig}
        onViewableItemsChanged={onViewableItemsChanged}
        onEndReached={onEndReached}
        onEndReachedThreshold={0.5}
        ListFooterComponent={isFetchingNextPage ? (
          <View style={fs.footer}>
            <ActivityIndicator color={colors.sepia} />
            <Text style={fs.footerText}>SPOOLING THE NEXT REEL…</Text>
          </View>
        ) : null}
      />
      <CinematicScrollbar scrollY={overallLogsScrollY} scrollHeight={scrollHeight} viewHeight={viewHeight} isScrolling={isScrolling} topInset={topPad} bottomInset={bottomInset} />
    </View>
  );
}

const fs = StyleSheet.create({
  footer: {
    alignItems: 'center',
    gap: 8,
    marginVertical: 20,
  },
  footerText: {
    fontFamily: fonts.sub,
    fontSize: 7,
    letterSpacing: 3,
    color: colors.fog,
    opacity: 0.6,
    includeFontPadding: false,
  },
});
