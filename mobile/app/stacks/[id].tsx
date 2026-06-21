import React, { useCallback, useRef, useState } from 'react';
 
import { CinematicFlashList } from '@/src/components/layout/CinematicFlashList';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { BlurView } from 'expo-blur';
import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ArrowLeft, Award, CheckCircle2, Edit3, MessageCircle, MoreHorizontal, Send, Trash2 } from 'lucide-react-native';
import { ActivityIndicator, Alert, Platform, RefreshControl, StyleSheet, Text, TextInput, useWindowDimensions, View } from 'react-native';
import Animated, { FadeInDown, FadeInUp, interpolate, useAnimatedKeyboard, useAnimatedStyle, useSharedValue } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ContentActionSheet } from '@/src/components/moderation/ContentActionSheet';
import ReportSheet from '@/src/components/moderation/ReportSheet';
import PressableScale from '@/src/components/PressableScale';
import ShareToLoungeModal from '@/src/components/ShareToLoungeModal';
import { tmdb } from '@/src/lib/tmdb';
import { StackService } from '@/src/services/StackService';
import { useAuthStore } from '@/src/stores/auth';
import { useBlockStore } from '@/src/stores/blockStore';
import { useListStore } from '@/src/stores/films';
import { colors, fonts } from '@/src/theme/theme';
import { enqueueMutation, flushOfflineQueue, getOfflineQueue } from '@/src/utils/offlineQueue';
import reelToast from '@/src/utils/reelToast';
import TactileEngine from '@/src/utils/TactileEngine';
import { z } from 'zod';

const blurhash = 'L87n_O~q00_300E1t7Rj00%#RjV@';

const isNetworkError = (e: unknown): boolean => {
    const msg = (e instanceof Error ? e.message : String(e)).toLowerCase();
    return msg.includes('fetch') || msg.includes('network') || msg.includes('offline');
};

const AnimatedBlurView = Animated.createAnimatedComponent(BlurView);


interface FilmItem {
  id: number;
  title: string;
  poster_path: string | null;
}

interface ListDetail {
  id: string;
  title: string;
  description: string;
  userId: string;
  user: string;
  createdAt: string;
  films: FilmItem[];
  isPrivate: boolean;
  isRanked: boolean;
}

interface ListComment {
  id: string;
  user_id: string;
  username: string;
  content: string;
  created_at: string;
}

// ── Memoized Comment Row ──
 
const StackCommentRow = React.memo(({ c, currentUserId, onLongPress }: { c: ListComment; currentUserId?: string; onLongPress?: (comment: ListComment) => void }) => (
  <PressableScale
    onLongPress={() => {
      if (c.user_id !== currentUserId && onLongPress) {
        TactileEngine.destroy();
        onLongPress(c);
      }
    }}
    delayLongPress={400}
    pressedScale={0.98}
    accessibilityLabel={`Comment by ${c.username}`}
    accessibilityHint={c.user_id !== currentUserId ? "Long press to report or block" : undefined}
  >
    <View style={s.commentRow}>
      <Text style={s.commentUser} numberOfLines={1}>@{c.username}</Text>
      <Text style={s.commentBody}>{c.content}</Text>
    </View>
  </PressableScale>
));

 
const StackDetailFilmCard = React.memo(({ 
  item, 
  index, 
  isLogged, 
  isRanked, 
  onPress,
  itemWidth,
  itemHeight,
}: { 
  item: FilmItem; 
  index: number; 
  isLogged: boolean; 
  isRanked: boolean; 
  onPress: (id: number) => void;
  itemWidth: number;
  itemHeight: number;
}) => {
  return (
    <Animated.View entering={index < 15 ? FadeInUp.duration(400).delay(index * 30) : undefined} style={[s.filmItem, { width: itemWidth }]}>
      <PressableScale 
        style={[s.filmCard, { width: itemWidth, height: itemHeight }]} 
        onPress={() => onPress(item.id)}
      >
        {item.poster_path ? (
          <Image 
            source={{ uri: tmdb.poster(item.poster_path, 'w342')! }} 
            style={StyleSheet.absoluteFillObject}
            contentFit="cover"
            cachePolicy="memory-disk"
            placeholder={{ blurhash }}
            transition={200}
            recyclingKey={item.poster_path}
          />
        ) : (
          <View style={s.posterPlaceholder}>
            <Text style={s.placeholderText} numberOfLines={3} adjustsFontSizeToFit>{item.title}</Text>
          </View>
        )}
        {isLogged && (
          <View style={s.loggedBadge}>
            <CheckCircle2 size={12} color={colors.parchment} />
          </View>
        )}
        {isRanked && (
          <View style={s.rankBadgeWrap}>
            <LinearGradient 
              colors={['transparent', 'rgba(10,7,3,0.8)', 'rgba(5,4,2,0.95)']} 
              style={StyleSheet.absoluteFillObject} 
            />
            <Text style={s.rankNumber} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.4}>{index + 1}</Text>
          </View>
        )}
      </PressableScale>
      <Text style={s.filmTitle} numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.8}>{item.title}</Text>
    </Animated.View>
  );
});

export default function StackDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { user } = useAuthStore();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  
  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await queryClient.invalidateQueries({ queryKey: ['stack', id] });
    await queryClient.invalidateQueries({ queryKey: ['stackComments', id] });
    setRefreshing(false);
  }, [queryClient, id]);
  const keyboard = useAnimatedKeyboard();
  const animatedContainerStyle = useAnimatedStyle(() => ({
    paddingBottom: Platform.OS === 'ios' ? keyboard.height.value : 0,
  }));
  const logs = useListStore(s => s.logs);
  const toggleListEndorse = useListStore(s => s.toggleListEndorse);
  const deleteList = useListStore(s => s.deleteList);
  const isCertified = useListStore(s => !!s._listEndorsedIndex[id]);
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const ITEM_WIDTH = (windowWidth - 32 - 16) / 3;
  const ITEM_HEIGHT = ITEM_WIDTH * 1.5;
  const HEADER_HEIGHT = windowHeight * 0.45;

  // ── React Query: MMKV-cached stack detail (instant revisits & offline fallback) ──
  const { data: stackQueryData, isLoading: stackQueryLoading, isError } = useQuery({
    queryKey: ['stack', id],
    queryFn: async () => {
      try {
        const payload = await StackService.getStackFullPayload(id);
        
        const listDetail: ListDetail = {
          id: payload.id,
          title: payload.title,
          description: payload.description,
          userId: payload.userId,
          user: payload.user,
          createdAt: payload.createdAt,
          films: payload.films,
          isPrivate: payload.isPrivate,
          isRanked: payload.isRanked,
        };

        return { list: listDetail, endorseCount: payload.endorseCount };
      } catch (error) {
        // Offline fallback: intercept network failure and use local data
        const localList = useListStore.getState().lists.find(l => l.id === id);
        const currentUser = useAuthStore.getState().user;
        
        const localUserId = localList?.userId;
        const localCreatedAt = localList?.createdAt || new Date().toISOString();

        if (localList && currentUser && (localUserId === currentUser.id || !localUserId)) {
          const fallbackDetail: ListDetail = {
            id: localList.id,
            title: localList.title,
            description: localList.description ?? '',
            userId: currentUser.id,
            user: currentUser.username || 'anonymous',
            createdAt: localCreatedAt,
            films: localList.films.map(f => ({
              id: f.id,
              title: f.title || 'Unknown',
              poster_path: f.poster || null,
            })),
            isPrivate: localList.isPrivate ?? false,
            isRanked: localList.isRanked ?? false,
          };
          return { list: fallbackDetail, endorseCount: 0 };
        }
        throw error;
      }
    },
    placeholderData: (previousData) => {
      if (previousData) return previousData;
      // Zero-Latency Render: Immediately show locally curated stack while fetching server truth
      const localList = useListStore.getState().lists.find(l => l.id === id);
      const currentUser = useAuthStore.getState().user;
      
      const localUserId = localList?.userId;
      const localCreatedAt = localList?.createdAt || new Date().toISOString();

      if (localList && currentUser && (localUserId === currentUser.id || !localUserId)) {
        return {
          list: {
            id: localList.id,
            title: localList.title,
            description: localList.description ?? '',
            userId: currentUser.id,
            user: currentUser.username || 'anonymous',
            createdAt: localCreatedAt,
            films: localList.films.map(f => ({
              id: f.id,
              title: f.title || 'Unknown',
              poster_path: f.poster || null,
            })),
            isPrivate: localList.isPrivate ?? false,
            isRanked: localList.isRanked ?? false,
          },
          endorseCount: 0,
        };
      }
      return undefined;
    },
    staleTime: 10 * 60 * 1000,  // 10 min
    enabled: !!id,
  });

  const list = stackQueryData?.list ?? null;
  const loading = stackQueryLoading;
  const [isCertifying, setIsCertifying] = useState(false);
  const [showComments, setShowComments] = useState(false);
  const [commentText, setCommentText] = useState('');
  const [submittingComment, setSubmittingComment] = useState(false);
  const [showLoungeShare, setShowLoungeShare] = useState(false);
  const [actionSheetVisible, setActionSheetVisible] = useState(false);
  const [reportSheetVisible, setReportSheetVisible] = useState(false);
  const [commentActionSheetVisible, setCommentActionSheetVisible] = useState(false);
  const [commentReportSheetVisible, setCommentReportSheetVisible] = useState(false);
  const [selectedComment, setSelectedComment] = useState<ListComment | null>(null);

  const blockUser = useBlockStore(s => s.blockUser);
  const muteUser = useBlockStore(s => s.muteUser);

  const commentInputRef = useRef<TextInput>(null);

  // Callback isolation: stabilize comment input handler
  const handleCommentTextChange = useCallback((text: string) => {
    setCommentText(text);
  }, []);

  // Scroll animations
  const scrollY = useSharedValue(0);

  const headerStyle = useAnimatedStyle(() => {
    return {
      height: HEADER_HEIGHT,
      transform: [
        { translateY: interpolate(scrollY.value, [-100, 0, HEADER_HEIGHT], [0, 0, HEADER_HEIGHT * 0.5]) },
        { scale: interpolate(scrollY.value, [-100, 0], [1.2, 1], 'clamp') }
      ]
    };
  });

  const navBlurStyle = useAnimatedStyle(() => {
    return {
      opacity: interpolate(scrollY.value, [HEADER_HEIGHT * 0.5, HEADER_HEIGHT - 60], [0, 1], 'clamp')
    };
  });

  const certifyCount = stackQueryData?.endorseCount ?? 0;

  const isOwner = user?.id === list?.userId;
   
  const loggedIds = React.useMemo(() => new Set(logs.map((l: any) => l.filmId)), [logs]);

  const handleCertify = useCallback(async () => {
    // Pre-flight Zod validation
    if (!user || isCertifying || !z.string().uuid().safeParse(id).success) return;
    setIsCertifying(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const wasCertified = isCertified;
    
    const delta = wasCertified ? -1 : 1;
    // CQRS Sync with global React Query cache instantly
    queryClient.setQueryData(['stack', id], (old: any) => {
      if (!old) return old;
      return { ...old, endorseCount: Math.max(0, old.endorseCount + delta) };
    });
    
    try {
      await toggleListEndorse(id);
      if (!wasCertified) reelToast.success('Certified!');
    } catch {
      // Atomic rollback on failure
      const revertDelta = wasCertified ? 1 : -1;
      queryClient.setQueryData(['stack', id], (old: any) => {
        if (!old) return old;
        return { ...old, endorseCount: Math.max(0, old.endorseCount + revertDelta) };
      });
      reelToast.error('Certification failed. Reverted.');
    } finally {
      setIsCertifying(false);
    }
  }, [user, id, isCertified, toggleListEndorse, isCertifying, queryClient]);

  // ── COMMENTS (CQRS) ──
  const { data: queryComments } = useQuery({
    queryKey: ['stackComments', id],
    queryFn: async () => {
      try {
        const commData = await StackService.getStackComments(id);
        
        // Offline Queue Stitching
        const queue = getOfflineQueue();
        const pendingAdds = queue.filter(q => q.type === 'add_list_comment' && q.payload.list_id === id);
        
        let finalComments = [...commData];
        for (const pa of pendingAdds) {
            const p = pa.payload as { user_id: string; content: string };
            finalComments.push({
                id: `offline-${Date.now()}-${Math.random()}`,
                list_id: id,
                user_id: p.user_id,
                username: useAuthStore.getState().user?.username || 'anonymous',
                content: p.content,
                created_at: new Date().toISOString()
            });
        }
        return finalComments;
      } catch (error) {
        if (__DEV__) console.error('[Stack] Comments fetch failed:', error);
        
        // Keep offline comments even if fetch fails
        const queue = getOfflineQueue();
        const pendingAdds = queue.filter(q => q.type === 'add_list_comment' && q.payload.list_id === id);
        
        return pendingAdds.map(pa => {
            const p = pa.payload as { user_id: string; content: string };
            return {
                id: `offline-${Date.now()}-${Math.random()}`,
                list_id: id,
                user_id: p.user_id,
                username: useAuthStore.getState().user?.username || 'anonymous',
                content: p.content,
                created_at: new Date().toISOString()
            };
        });
      }
    },
    enabled: showComments && z.string().uuid().safeParse(id).success,
  });

  const handleToggleComments = useCallback(() => {
    Haptics.selectionAsync();
    setShowComments((prev) => !prev);
    setTimeout(() => {
      commentInputRef.current?.focus();
    }, 100);
  }, []);

  const handleSubmitComment = useCallback(async () => {
    // Pre-flight Zod validation
    if (!commentText.trim() || submittingComment || !user || !z.string().uuid().safeParse(id).success) {
        if (commentText.trim() && !z.string().uuid().safeParse(id).success) reelToast.error('Invalid stack record.');
        return;
    }
    setSubmittingComment(true);
    const content = commentText.trim();
    const tempId = `temp_${Date.now()}`;
    
    // Optimistic Update
    const optimisticComment: ListComment = {
      id: tempId,
      user_id: user.id,
      username: user.username || 'anon',
      content,
      created_at: new Date().toISOString()
    };
    
    // CQRS Optimistic sync directly to cache
    queryClient.setQueryData(['stackComments', id], (old: ListComment[] | undefined) => {
      if (!old) return [optimisticComment];
      return [...old, optimisticComment];
    });

    setCommentText('');
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

    try {
      const newComment = await StackService.addStackComment({
        user_id: user.id,
        list_id: id,
        content: content
      });
      
      // Swap the temp ID for the real DB ID
      queryClient.setQueryData(['stackComments', id], (old: ListComment[] | undefined) => {
        if (!old) return [newComment];
        return old.map(c => c.id === tempId ? newComment : c);
      });
     
    } catch (err: unknown) {
      if (isNetworkError(err)) {
        enqueueMutation({
          type: 'add_list_comment',
          payload: { list_id: id, user_id: user.id, content }
        });
        flushOfflineQueue();
        // Leave the optimistic comment in cache since it's queued
        reelToast('Your critique was queued for offline dispatch.');
      } else {
        // Atomic Rollback
        queryClient.setQueryData(['stackComments', id], (old: ListComment[] | undefined) => {
          if (!old) return [];
          return old.filter(c => c.id !== tempId);
        });
        setCommentText(content);
        reelToast.error('Your critique could not be filed.');
      }
    } finally {
      setSubmittingComment(false);
    }
  }, [commentText, submittingComment, user, id, queryClient]);

  const handleOpenShareLounge = useCallback(async () => {
    Haptics.selectionAsync();
    if (!user) {
      reelToast.error('You must be logged in to access the lounge.');
      return;
    }
    setShowLoungeShare(true);
  }, [user]);

  const handleDelete = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    Alert.alert(
      'Incinerate Stack',
      'This will permanently destroy this collection. This action is irreversible.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Incinerate',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteList(id);
              queryClient.removeQueries({ queryKey: ['stack', id] });
              queryClient.invalidateQueries({ queryKey: ['stacks'] });
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
              router.back();
             
            } catch (err: unknown) {
              reelToast.error('The collection resists destruction.');
            }
          },
        },
      ]
    );
  }, [id, deleteList, router, queryClient]);

  const handlePressFilm = useCallback((filmId: number) => {
    Haptics.selectionAsync();
    (router.push as any)(`/film/${filmId}` as any);
  }, [router]);

  const renderItem = useCallback(({ item, index }: { item: FilmItem; index: number }) => {
    return (
      <StackDetailFilmCard 
        item={item} 
        index={index} 
        isLogged={loggedIds.has(item.id)} 
        isRanked={!!list?.isRanked} 
        onPress={handlePressFilm}
        itemWidth={ITEM_WIDTH}
        itemHeight={ITEM_HEIGHT}
      />
    );
  }, [loggedIds, list?.isRanked, handlePressFilm, ITEM_WIDTH, ITEM_HEIGHT]);

  if (loading) {
    return (
      <View style={s.container}>
        <View style={[s.navBar, { zIndex: 10 }]}>
          <PressableScale onPress={() => router.back()} style={s.backBtn} haptic="light" accessibilityLabel="Go back">
            <ArrowLeft size={20} color={colors.bone} />
          </PressableScale>
        </View>
        <View style={s.loadingCenter}>
          <ActivityIndicator size="large" color={colors.sepia} />
        </View>
      </View>
    );
  }

  if (isError || !list) {
    return (
      <View style={s.container}>
        <View style={[s.navBar, { zIndex: 10, paddingTop: insets.top, height: Math.max(insets.top + 50, 70) }]}>
          <PressableScale onPress={() => router.back()} style={s.backBtn} haptic="light" accessibilityLabel="Go back">
            <ArrowLeft size={20} color={colors.bone} />
          </PressableScale>
        </View>
        <View style={s.loadingCenter}>
          <Text style={s.title}>CLASSIFIED</Text>
          <Text style={[s.desc, { textAlign: 'center', marginTop: 12 }]}>This stack could not be retrieved.{'\n'}It may be private or incinerated.</Text>
        </View>
      </View>
    );
  }



  const heroPoster = list.films.length > 0 && list.films[0].poster_path 
    ? tmdb.poster(list.films[0].poster_path, 'w780') 
    : null;

  return (
    <Animated.View style={[s.container, animatedContainerStyle]}>
      {/* Absolute Dynamic Nav Bar */}
      <View style={[s.navBar, { height: Math.max(insets.top + 50, 70), paddingTop: insets.top }]}>
        <AnimatedBlurView intensity={80} tint="dark" style={[StyleSheet.absoluteFill, navBlurStyle]} />
        <View style={s.navInner}>
          <PressableScale onPress={() => router.back()} style={s.backBtn} hitSlop={{top: 20, bottom: 20, left: 20, right: 20}} haptic="light" accessibilityLabel="Go back">
            <ArrowLeft size={20} color={colors.bone} />
          </PressableScale>
          {isOwner && (
            <View style={s.headerActions}>
              <PressableScale style={s.actionBtn} onPress={() => { (router.push as any)({ pathname: '/list-modal', params: { editId: id } } as import('expo-router').Href); }} hitSlop={{top: 15, bottom: 15, left: 15, right: 15}} haptic="selection" accessibilityLabel="Edit stack">
                <Edit3 size={18} color={colors.fog} />
              </PressableScale>
              <PressableScale style={s.actionBtn} onPress={handleDelete} hitSlop={{top: 15, bottom: 15, left: 15, right: 15}} haptic="medium" accessibilityLabel="Delete stack">
                <Trash2 size={18} color="rgba(231,76,60,0.8)" />
              </PressableScale>
            </View>
          )}
          {!isOwner && (
            <PressableScale
              style={s.moreBtn}
              onPress={() => setActionSheetVisible(true)}
              hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }}
              haptic="selection"
              pressedScale={0.92}
              accessibilityLabel="More options for this stack"
            >
              <MoreHorizontal size={16} color={colors.fog} strokeWidth={1.5} />
            </PressableScale>
          )}
        </View>
      </View>

      <CinematicFlashList
        data={list.films}
        keyExtractor={(item: any) => String(item.id)}
        numColumns={3}
        contentContainerStyle={s.scrollContent}
        externalScrollY={scrollY}
        bottomInset={insets.bottom}
        scrollEventThrottle={16}
        showsVerticalScrollIndicator={false}
        estimatedItemSize={200}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.sepia} progressViewOffset={Math.max(insets.top + 50, 70)} />}
        ListHeaderComponent={
          <>
            {/* Parallax Image Background */}
            <Animated.View style={[s.parallaxHeader, headerStyle]}>
              {heroPoster && (
                <Image source={heroPoster} style={StyleSheet.absoluteFillObject} contentFit="cover" blurRadius={20} cachePolicy="memory-disk" />
              )}
              <LinearGradient 
                colors={['rgba(10, 7, 3, 0.4)', 'rgba(10, 7, 3, 0.9)', colors.ink]}
                locations={[0, 0.6, 1]}
                style={StyleSheet.absoluteFillObject}
              />
            </Animated.View>

            {/* Content Overlaid on Header */}
            <View style={[s.headerContentWrap, { marginTop: HEADER_HEIGHT - 120 }]}>

              <Animated.Text entering={FadeInDown.duration(600).delay(100)} style={s.title} numberOfLines={3} adjustsFontSizeToFit minimumFontScale={0.7}>
                {list.title.toUpperCase()}
              </Animated.Text>
              
              <Animated.View entering={FadeInDown.duration(600).delay(200)} style={s.metaRow}>
                <View style={s.curatorDot} />
                <Text style={[s.metaText, { flexShrink: 1, marginRight: 8 }]} numberOfLines={1}>@{list.user.toUpperCase()}</Text>
                <Text style={s.metaText}>·  {list.films.length} ENTRIES</Text>
                {list.isRanked && (
                  <>
                    <Text style={s.metaText}>  ·  </Text>
                    <Text style={[s.metaText, { color: colors.sepia }]}>✦ RANKED</Text>
                  </>
                )}
              </Animated.View>
              
              {list.description && (
                <Animated.Text entering={FadeInDown.duration(600).delay(300)} style={s.desc}>
                  {list.description}
                </Animated.Text>
              )}

              {/* ── ACTION BAR: Certify · Critic · Share to Lounge ── */}
              <Animated.View entering={FadeInDown.duration(600).delay(350)} style={s.actionBar}>
                <PressableScale style={s.actionItem} onPress={handleCertify} hitSlop={{top: 10, bottom: 10, left: 10, right: 10}} haptic="selection" accessibilityRole="button" accessibilityLabel={isCertified ? "Uncertify stack" : "Certify stack"}>
                  <View pointerEvents="none"><Award size={16} color={isCertified ? colors.sepia : colors.fog} fill={isCertified ? colors.sepia : 'none'} /></View>
                  <Text style={[s.actionLabel, isCertified && s.actionLabelActive]} pointerEvents="none" numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>
                    {certifyCount > 0 ? `${certifyCount} ` : ''}{isCertified ? 'CERTIFIED' : 'CERTIFY'}
                  </Text>
                </PressableScale>

                <View style={s.actionDivider} />

                <PressableScale style={s.actionItem} onPress={handleToggleComments} hitSlop={{top: 10, bottom: 10, left: 10, right: 10}} haptic="selection" accessibilityRole="button" accessibilityLabel="Toggle comments">
                  <View pointerEvents="none"><MessageCircle size={14} color={showComments ? colors.sepia : colors.fog} /></View>
                  <Text style={[s.actionLabel, showComments && s.actionLabelActive]} pointerEvents="none" numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>CRITIC</Text>
                </PressableScale>

                <View style={s.actionDivider} />

                <PressableScale style={s.actionItem} onPress={handleOpenShareLounge} hitSlop={{top: 10, bottom: 10, left: 10, right: 10}} haptic="selection" accessibilityRole="button" accessibilityLabel="Share to lounge">
                  <View pointerEvents="none"><Send size={14} color={colors.fog} /></View>
                  <Text style={s.actionLabel} pointerEvents="none" numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>LOUNGE</Text>
                </PressableScale>
              </Animated.View>

              {showComments && (
                <Animated.View entering={FadeInDown.duration(300)} style={s.commentsPanel}>
                  {(queryComments || []).length === 0 && (
                    <Text style={s.commentEmpty}>No remarks yet. Be the first to speak.</Text>
                  )}
                  {(queryComments || []).map(c => (
                    <StackCommentRow key={c.id} c={c} currentUserId={user?.id} onLongPress={(comment) => {
                      setSelectedComment(comment);
                      setCommentActionSheetVisible(true);
                    }} />
                  ))}
                  {user && (
                    <View style={s.commentInputRow}>
                      <TextInput
                        ref={commentInputRef}
                        style={s.commentInput}
                        placeholder="Leave a remark..."
                        placeholderTextColor={colors.ash}
                        value={commentText}
                        onChangeText={handleCommentTextChange}
                        returnKeyType="send"
                        onSubmitEditing={handleSubmitComment}
                        maxLength={500}
                        selectionColor={'rgba(218,165,32,0.3)'}
                        cursorColor={colors.sepia}
                        disableFullscreenUI={true}
                        keyboardAppearance="dark"
                        accessibilityLabel="Stack comment"
                      />
                      <PressableScale onPress={handleSubmitComment} disabled={submittingComment || !commentText.trim()} style={[s.commentSendBtn, (!commentText.trim()) && s.sendBtnDisabled]} haptic="light" accessibilityRole="button" accessibilityLabel="Submit comment">
                        <Send size={14} color={colors.sepia} />
                      </PressableScale>
                    </View>
                  )}
                </Animated.View>
              )}

              <View style={s.trackRow}>
                <Text style={s.trackLabel}>INDEXED REELS</Text>
                <View style={s.trackLine} />
              </View>
            </View>
          </>
        }
        renderItem={renderItem as any}
        ListEmptyComponent={
          <View style={s.emptyState}>
            <Text style={s.emptyTitle}>Archive Empty</Text>
            <Text style={s.emptySubtitle}>No films have been added to this collection.</Text>
          </View>
        }
      />

      {/* ── SHARE TO LOUNGE MODAL ── */}
      <ShareToLoungeModal
        visible={showLoungeShare}
        onClose={() => setShowLoungeShare(false)}
        listId={list.id}
        listTitle={list.title}
        listFilmCount={list.films.length}
        listCurator={list.user}
        listTopPosters={list.films.map((f: FilmItem) => f.poster_path).filter(Boolean).slice(0, 4) as string[]}
      />

      {/* ── MODERATION: ACTION SHEET & REPORT SHEET ── */}
      <ContentActionSheet
        visible={actionSheetVisible}
        contentType="list"
        contentId={list.id}
        targetUserId={list.userId}
        targetUsername={list.user}
        onClose={() => setActionSheetVisible(false)}
        onReport={() => {
          setActionSheetVisible(false);
          setReportSheetVisible(true);
        }}
        onBlock={() => blockUser(list.userId)}
        onMute={() => muteUser(list.userId)}
      />
      <ReportSheet
        visible={reportSheetVisible}
        contentType="list"
        contentId={list.id}
        targetUserId={list.userId}
        targetUsername={list.user}
        onDismiss={() => setReportSheetVisible(false)}
      />

      {/* Comment Moderation: Action Sheet & Report Sheet */}
      {selectedComment && (
        <>
          <ContentActionSheet
            visible={commentActionSheetVisible}
            contentType="list_comment"
            contentId={selectedComment.id}
            targetUserId={selectedComment.user_id}
            targetUsername={selectedComment.username}
            hideMute
            onClose={() => {
              setCommentActionSheetVisible(false);
              setSelectedComment(null);
            }}
            onReport={() => {
              setCommentActionSheetVisible(false);
              setCommentReportSheetVisible(true);
            }}
            onBlock={() => {
              blockUser(selectedComment.user_id);
              setCommentActionSheetVisible(false);
              setSelectedComment(null);
            }}
            onMute={() => {
              setCommentActionSheetVisible(false);
              setSelectedComment(null);
            }}
          />
          <ReportSheet
            visible={commentReportSheetVisible}
            contentType="list_comment"
            contentId={selectedComment.id}
            targetUserId={selectedComment.user_id}
            targetUsername={selectedComment.username}
            onDismiss={() => {
              setCommentReportSheetVisible(false);
              setSelectedComment(null);
            }}
          />
        </>
      )}
    </Animated.View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.ink },
  navBar: {
    position: 'absolute', top: 0, left: 0, right: 0,
    zIndex: 100, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: 'rgba(255,255,255,0.05)',
  },
  navInner: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16 },
  backBtn: { padding: 8, marginLeft: -8 },
  headerActions: { flexDirection: 'row', gap: 12 },
  actionBtn: { padding: 8 },
  moreBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 10, paddingVertical: 8, marginLeft: 8 },

  scrollContent: { paddingBottom: 60, paddingHorizontal: 12 },
  parallaxHeader: { position: 'absolute', top: 0, left: 0, right: 0, zIndex: -1 },
  headerContentWrap: { paddingHorizontal: 16, paddingBottom: 24 },
  
  refCode: { fontFamily: fonts.ui, fontSize: 10, letterSpacing: 4, color: colors.sepia, marginBottom: 8 },
  title: { fontFamily: fonts.display, fontSize: 36, color: colors.parchment, lineHeight: 40, textShadowColor: 'rgba(0,0,0,0.8)', textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 6 },
  metaRow: { flexDirection: 'row', alignItems: 'center', marginTop: 16, marginBottom: 16 },
  curatorDot: { width: 4, height: 4, borderRadius: 2, backgroundColor: colors.sepia, marginRight: 8 },
  metaText: { fontFamily: fonts.ui, fontSize: 10, letterSpacing: 1.5, color: colors.fog },
  desc: { fontFamily: fonts.sub, fontSize: 14, color: colors.bone, lineHeight: 22, opacity: 0.9, marginBottom: 24 },
  
  // ── Action Bar ──
  actionBar: {
    flexDirection: 'row', alignItems: 'center',
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: 'rgba(139,105,20,0.2)',
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: 'rgba(139,105,20,0.2)',
    paddingVertical: 10, marginBottom: 16,
  },
  actionItem: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  actionLabel: { fontFamily: fonts.ui, fontSize: 9, letterSpacing: 1, color: colors.fog },
  actionDivider: { width: 1, height: 16, backgroundColor: 'rgba(139,105,20,0.15)' },

  // ── Comments Panel ──
  commentsPanel: {
    backgroundColor: 'rgba(10,7,3,0.8)',
    borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(139,105,20,0.15)',
    borderRadius: 6, padding: 12, marginBottom: 16,
  },
  commentEmpty: { fontFamily: fonts.body, fontSize: 12, color: colors.fog, textAlign: 'center', paddingVertical: 8, opacity: 0.7 },
  commentRow: { flexDirection: 'row', gap: 6, marginBottom: 8, alignItems: 'baseline' },
  commentUser: { fontFamily: fonts.ui, fontSize: 9, letterSpacing: 0.5, color: colors.sepia, flexShrink: 1, maxWidth: '40%' },
  commentBody: { fontFamily: fonts.body, fontSize: 12, color: colors.bone, lineHeight: 18, flex: 1 },
  commentInputRow: { flexDirection: 'row', gap: 8, marginTop: 8, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: 'rgba(139,105,20,0.1)', paddingTop: 8 },
  commentInput: { flex: 1, backgroundColor: 'rgba(10,7,3,0.6)', borderWidth: 1, borderColor: 'rgba(139,105,20,0.15)', borderRadius: 4, paddingHorizontal: 10, paddingVertical: 8, fontFamily: fonts.body, fontSize: 12, color: colors.bone },
  commentSendBtn: { padding: 8, borderWidth: 1, borderColor: 'rgba(139,105,20,0.2)', borderRadius: 4, justifyContent: 'center', alignItems: 'center' },

  // ── Share to Lounge Modal ──
  loungeOverlay: { ...StyleSheet.absoluteFillObject, zIndex: 200, backgroundColor: 'rgba(5,3,1,0.85)', justifyContent: 'flex-end' },
  loungeSheet: { backgroundColor: colors.ink, borderTopWidth: 1, borderTopColor: 'rgba(139,105,20,0.2)', borderTopLeftRadius: 16, borderTopRightRadius: 16, maxHeight: '60%', overflow: 'hidden' },
  loungeHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: 'rgba(139,105,20,0.15)' },
  loungeTitle: { fontFamily: fonts.ui, fontSize: 10, letterSpacing: 2, color: colors.sepia },
  loungeClose: { fontSize: 16, color: colors.fog, padding: 4 },
  loungeRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: 'rgba(139,105,20,0.06)' },
  loungeAvatar: { width: 32, height: 32, borderRadius: 8, backgroundColor: 'rgba(139,105,20,0.1)', borderWidth: 1, borderColor: 'rgba(139,105,20,0.25)', overflow: 'hidden', alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  loungeName: { flex: 1, fontFamily: fonts.sub, fontSize: 14, color: colors.parchment },
  loungeSendIcon: { width: 28, height: 28, borderRadius: 14, borderWidth: 1, borderColor: 'rgba(139,105,20,0.2)', backgroundColor: 'rgba(139,105,20,0.08)', alignItems: 'center', justifyContent: 'center' },

  trackRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 12, marginBottom: 20 },
  trackLabel: { fontFamily: fonts.ui, fontSize: 9, letterSpacing: 2, color: colors.sepia },
  trackLine: { flex: 1, height: 1, backgroundColor: 'rgba(139,105,20,0.2)' },
  
  filmItem: { marginBottom: 24, marginHorizontal: 4 },
  filmCard: { borderRadius: 2, overflow: 'hidden', backgroundColor: colors.soot, borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.1)' },
  posterPlaceholder: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 8 },
  placeholderText: { fontFamily: fonts.sub, fontSize: 10, color: colors.ash, textAlign: 'center' },
  loggedBadge: { position: 'absolute', top: 4, right: 4, width: 22, height: 22, borderRadius: 11, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.6)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)' },
  filmTitle: { fontFamily: fonts.sub, fontSize: 11, color: colors.fog, marginTop: 6, textAlign: 'center', paddingHorizontal: 2 },
  
  rankBadgeWrap: { position: 'absolute', bottom: 0, left: 0, right: 0, height: 40, justifyContent: 'flex-end', paddingBottom: 6, paddingLeft: 8, paddingRight: 8 },
  rankNumber: { fontFamily: fonts.display, fontSize: 28, color: colors.parchment, lineHeight: 28, textShadowColor: 'rgba(0,0,0,0.8)', textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 4 },
  
  emptyState: { alignItems: 'center', paddingVertical: 40, paddingHorizontal: 20 },
  emptyTitle: { fontFamily: fonts.display, fontSize: 20, color: colors.sepia, marginBottom: 8 },
  emptySubtitle: { fontFamily: fonts.body, fontSize: 13, color: colors.fog, textAlign: 'center' },

  // Extracted
  loadingCenter: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  actionLabelActive: { color: colors.sepia },
  sendBtnDisabled: { opacity: 0.3 },
  loungeEmptyWrap: { padding: 30, alignItems: 'center' },
  loungeEmptyText: { fontFamily: fonts.body, fontSize: 13, color: colors.fog },
  loungeAvatarImg: { width: '100%', height: '100%' },
});


StackDetailFilmCard.displayName = 'StackDetailFilmCard';

StackCommentRow.displayName = 'StackCommentRow';