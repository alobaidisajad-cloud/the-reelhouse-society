import React, { useEffect, useMemo, useCallback } from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { Image } from 'expo-image';
import { CinematicFlashList } from '../layout/CinematicFlashList';
import { LayoutList, Lock, ListOrdered } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import Animated, { useSharedValue, useAnimatedStyle, withRepeat, withTiming, Easing, cancelAnimation } from 'react-native-reanimated';
import { colors, fonts , SEPIA_HASH } from '../../theme/theme';
import { tmdb } from '../../lib/tmdb';
import type { ProfileList, ProfileListFilm } from '../../types';
import PressableScale from '../PressableScale';


interface ProfileListsTabProps {
  lists: ProfileList[];
  onLoadMore?: () => void;
  isLoadingMore?: boolean;
  hasMore?: boolean;
  isSelf?: boolean;
  refreshing?: boolean;
  onRefresh?: () => void;
  bottomInset?: number;
}

 
const ProfileListCard = React.memo(({ list, router }: { list: ProfileList, router: import('expo-router').Router }) => {
  const posters = (list.films || [])
    .filter((f: ProfileListFilm) => f.poster)
    .slice(0, 3)
    .map((f: ProfileListFilm) => tmdb.poster(f.poster || '', 'w185'));

  return (
    <PressableScale 
      style={s.stackCard} 
      onPress={() => (router.push as any)(`/stacks/${list.id}` as any)}
      haptic
    >
      <View style={s.stackPosterWrap}>
        {posters.length > 0 ? (
          posters.map((uri: any, i: number) => (
            <Image 
              key={i} 
              source={{ uri }} 
              style={[s.stackPosterPanel, { left: `${(i * 100) / posters.length}%` as import('react-native').DimensionValue, width: `${100 / posters.length}%` as import('react-native').DimensionValue }]} 
              cachePolicy="memory-disk"
              placeholder={{ blurhash: SEPIA_HASH }}
              transition={200}
            />
          ))
        ) : (
          <View style={s.stackEmptyBg} />
        )}
        <View style={s.stackOverlay} />
      </View>
      <View style={s.stackContent}>
        <View style={s.badgeRow}>
          <Text style={s.stackBadge}>{(list.films || []).length} FILMS</Text>
          {list.isRanked && (
            <View style={s.rankedBadge}>
              <ListOrdered size={10} color={colors.sepia} />
              <Text style={s.rankedText}>RANKED</Text>
            </View>
          )}
        </View>
        <Text style={s.stackTitle} numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.8}>{(list.title || '').toUpperCase()}</Text>
        {list.description ? (
          <Text style={s.stackDesc} numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.8}>{list.description}</Text>
        ) : null}
      </View>
      {list.isPrivate && (
        <View style={s.privateLock}>
          <Lock size={12} color={colors.ink} />
        </View>
      )}
    </PressableScale>
  );
});

export default React.memo(function ProfileListsTab({ lists, onLoadMore, isLoadingMore, hasMore, isSelf, refreshing = false, onRefresh, bottomInset }: ProfileListsTabProps) {
  const router = useRouter();

  const breatheAnim = useSharedValue(0.1);
  useEffect(() => {
    breatheAnim.value = withRepeat(
      withTiming(0.4, { duration: 2500, easing: Easing.inOut(Easing.ease) }),
      -1, true
    );
    return () => cancelAnimation(breatheAnim);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const pulseStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: breatheAnim.value * -3 }],
    shadowOpacity: breatheAnim.value,
  }));

  const renderItem = useCallback(({ item }: { item: ProfileList }) => {
    return (
      <ProfileListCard list={item} router={router} />
    );
  }, [router]);

  const ListEmptyComponent = useMemo(() => {
    if (lists.length > 0) return null;
    
    if (isSelf) {
      return (
        <Animated.View style={[s.emptyStateSelf, pulseStyle]}>
          <View style={s.dossierStackBg1} />
          <View style={s.dossierStackBg2} />
          <View style={s.dossierFront}>
            <LayoutList size={32} color={colors.parchment} strokeWidth={1.5} style={s.emptyLockIcon} />
            <Text style={s.emptyTitleSelf}>Uncharted Stacks</Text>
            <PressableScale style={s.ctaBtnSelf} onPress={() => (router.push as any)('/list-modal' as never)} haptic>
              <Text style={s.ctaBtnTextSelf}>COMPILE A DOSSIER</Text>
            </PressableScale>
          </View>
        </Animated.View>
      );
    }

    return (
      <View style={s.emptyState}>
        <LayoutList size={32} color={colors.sepia} strokeWidth={1} style={s.emptyLockIcon} />
        <Text style={s.emptyTitle}>The Stacks are Empty</Text>
        <Text style={s.emptyDesc}>No lists yet.</Text>
      </View>
    );
  }, [lists.length, isSelf, pulseStyle, router]);

  const ListFooterComponent = useMemo(() => {
    if (lists.length === 0) return null;
    return (
      <View>
        {hasMore && (
          <PressableScale style={s.loadMoreBtn} onPress={onLoadMore} disabled={isLoadingMore}>
            {isLoadingMore ? <ActivityIndicator color={colors.sepia} /> : <Text style={s.loadMoreText}>LOAD MORE</Text>}
          </PressableScale>
        )}
      </View>
    );
  }, [lists.length, hasMore, isLoadingMore, onLoadMore]);

  return (
    <View style={s.container}>
      <CinematicFlashList
        data={lists}
        renderItem={renderItem}
        keyExtractor={(item: ProfileList) => item.id}
        numColumns={2}
        ListEmptyComponent={ListEmptyComponent}
        ListFooterComponent={ListFooterComponent}
        estimatedItemSize={200}
        contentContainerStyle={s.listContent}
        refreshing={refreshing}
        onRefresh={onRefresh}
        onEndReached={onLoadMore}
        onEndReachedThreshold={0.5}
        bottomInset={bottomInset}
      />
    </View>
  );
});

const s = StyleSheet.create({
  container: { flex: 1 },
  listContent: { paddingHorizontal: 8, paddingTop: 16, paddingBottom: 100 },
  emptyState: { alignItems: 'center', paddingVertical: 48, paddingHorizontal: 32, borderWidth: 1, borderColor: 'rgba(184,137,26,0.2)', backgroundColor: 'rgba(8,6,4,0.98)' },
  emptyStateSelf: { marginTop: 24, position: 'relative', width: '100%', shadowColor: 'rgba(0,0,0,0.8)', shadowOffset: { width: 0, height: 10 }, shadowRadius: 20 },
  dossierStackBg1: { position: 'absolute', top: -12, left: 12, right: 12, height: '100%', backgroundColor: 'rgba(15,12,8,0.6)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.05)', borderRadius: 4 },
  dossierStackBg2: { position: 'absolute', top: -6, left: 6, right: 6, height: '100%', backgroundColor: 'rgba(18,14,9,0.8)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)', borderRadius: 4 },
  dossierFront: { alignItems: 'center', paddingVertical: 60, paddingHorizontal: 40, backgroundColor: 'rgba(25,20,15,1)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)', borderRadius: 4 },
  emptyLockIcon: { marginBottom: 16, opacity: 0.8 },
  emptyTitle: { fontFamily: fonts.display, fontSize: 15, color: colors.parchment, marginBottom: 8, textAlign: 'center' },
  emptyTitleSelf: { fontFamily: fonts.display, fontSize: 24, color: colors.parchment, marginBottom: 24, textAlign: 'center', letterSpacing: 1 },
  emptyDesc: { fontFamily: fonts.body, fontSize: 10, color: colors.fog, fontStyle: 'italic', textAlign: 'center', lineHeight: 16 },
  ctaBtnSelf: { paddingVertical: 14, paddingHorizontal: 32, borderWidth: 1, borderColor: 'rgba(184,137,26,0.4)', backgroundColor: colors.sepiaFaint, borderRadius: 2 },
  ctaBtnTextSelf: { fontFamily: fonts.sub, fontSize: 10, letterSpacing: 2.5, color: colors.sepia },
  stackCard: { flex: 1, marginHorizontal: 8, marginBottom: 16 },
  stackPosterWrap: { width: '100%', aspectRatio: 3 / 2, borderRadius: 6, overflow: 'hidden', backgroundColor: 'rgba(18,14,9,0.5)', borderWidth: 1, borderColor: 'rgba(184,137,26,0.2)', position: 'relative' },
  stackPosterPanel: { position: 'absolute', top: 0, bottom: 0, height: '100%' },
  stackEmptyBg: { flex: 1, backgroundColor: 'rgba(18,14,9,0.7)' },
  stackOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(5,4,3,0.3)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.05)', borderRadius: 6 },
  stackContent: { paddingTop: 10, paddingHorizontal: 4 },
  stackBadge: { fontFamily: fonts.sub, fontSize: 9, letterSpacing: 2, color: colors.sepia, opacity: 0.8, marginBottom: 4 },
  stackTitle: { fontFamily: fonts.display, fontSize: 13, color: colors.parchment, marginBottom: 4, lineHeight: 18 },
  stackDesc: { fontFamily: fonts.bodyItalic, fontSize: 11, color: colors.fog, opacity: 0.7, lineHeight: 16 },
  loadMoreBtn: { width: '100%', paddingVertical: 16, alignItems: 'center', justifyContent: 'center', marginTop: 16, borderWidth: 1, borderColor: 'rgba(184,137,26,0.2)' },
  loadMoreText: { fontFamily: fonts.sub, fontSize: 10, letterSpacing: 2, color: colors.sepia },
  badgeRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 },
  rankedBadge: { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: 'rgba(184,137,26,0.1)', paddingHorizontal: 4, paddingVertical: 2, borderRadius: 2, borderWidth: 0.5, borderColor: 'rgba(184,137,26,0.3)' },
  rankedText: { fontFamily: fonts.sub, fontSize: 8, letterSpacing: 1, color: colors.sepia },
  privateLock: { position: 'absolute', top: 6, right: 6, backgroundColor: colors.sepia, padding: 4, borderRadius: 12, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.5, shadowRadius: 3, elevation: 3 },
});


ProfileListCard.displayName = 'ProfileListCard';
