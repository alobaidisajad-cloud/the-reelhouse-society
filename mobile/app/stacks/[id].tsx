import React, { useCallback, useRef, useState } from 'react';
 
import { CinematicFlashList } from '@/src/components/layout/CinematicFlashList';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { BlurView } from 'expo-blur';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ArrowLeft, Heart, CheckCircle2, Edit3, KeyRound, MessageCircle, MoreHorizontal, Send, Trash2, User, X } from 'lucide-react-native';
import { ActivityIndicator, Alert, BackHandler, Platform, RefreshControl, ScrollView, StyleSheet, Text, TextInput, useWindowDimensions, View } from 'react-native';
import Animated, { FadeInDown, FadeInUp, ReduceMotion, interpolate, useAnimatedKeyboard, useAnimatedStyle, useSharedValue } from 'react-native-reanimated';
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
import { addBreadcrumb, captureError } from '@/src/lib/sentry';
import { colors, fonts } from '@/src/theme/theme';
import { logger } from '@/src/utils/logger';
import { enqueueMutation, flushOfflineQueue, getOfflineQueue } from '@/src/utils/offlineQueue';
import { MAX_LENGTHS } from '@/src/utils/sanitizeInput';
import reelToast from '@/src/utils/reelToast';
import TactileEngine from '@/src/utils/TactileEngine';
import { formatDateMonthYear, timeAgo } from '@/src/utils/timeAgo';
import { z } from 'zod';

const blurhash = 'L87n_O~q00_300E1t7Rj00%#RjV@';

/** The epigraph folds past this many lines — the clamp and the test for the
 *  fold must be the same number, or the page offers to open what is not shut. */
const DESC_CLAMP_LINES = 4;

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
  /** The stack's TRUE size — films above is a bounded page. */
  filmCount?: number;
  isPrivate: boolean;
  isRanked: boolean;
}

interface ListComment {
  id: string;
  user_id: string;
  username: string;
  avatar_url?: string | null;
  content: string;
  created_at: string;
}

// ── Memoized Comment Row — real face, tappable name, timestamped ──
// No dead ends: avatar + username navigate to the critic's profile;
// the row keeps long-press for report/block so the two never fight.

const StackCommentRow = React.memo(({ c, currentUserId, onLongPress, onPressProfile }: { c: ListComment; currentUserId?: string; onLongPress?: (comment: ListComment) => void; onPressProfile?: (username: string) => void }) => (
  <PressableScale
    onLongPress={() => {
      if (c.user_id !== currentUserId && onLongPress) {
        TactileEngine.destroy();
        onLongPress(c);
      }
    }}
    delayLongPress={400}
    pressedScale={0.98}
    accessibilityLabel={`Critique by ${c.username}`}
    accessibilityHint={c.user_id !== currentUserId ? "Long press to report or block" : undefined}
  >
    <View style={s.commentRow}>
      <PressableScale onPress={() => onPressProfile?.(c.username)} haptic="light" accessibilityRole="link" accessibilityLabel={`View profile of @${c.username}`}>
        <View style={s.commentAvatar}>
          {c.avatar_url ? (
            <Image source={{ uri: c.avatar_url }} style={s.commentAvatarImg} contentFit="cover" cachePolicy="memory-disk" recyclingKey={c.id} />
          ) : (
            <User size={11} color={colors.fog} strokeWidth={1.5} />
          )}
        </View>
      </PressableScale>
      <View style={s.commentBodyWrap}>
        <View style={s.commentHead}>
          <PressableScale onPress={() => onPressProfile?.(c.username)} haptic="light" style={s.commentUserPress} accessibilityRole="link" accessibilityLabel={`View profile of @${c.username}`}>
            <Text style={s.commentUser} numberOfLines={1}>@{c.username.toUpperCase()}</Text>
          </PressableScale>
          <Text style={s.commentTime} numberOfLines={1}>{timeAgo(c.created_at)}</Text>
        </View>
        <Text style={s.commentBody}>{c.content}</Text>
      </View>
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
  // The podium touch: in a ranked stack only #1 earns metal — a hairline brass
  // frame on the card, and its numeral in candlelight rather than brass. The
  // numeral itself sits in the caption now; it used to be stamped 28pt across
  // the bottom of the artwork under a gradient, which covered the one thing a
  // reader opened the page to look at.
  const isFirst = isRanked && index === 0;
  return (
    <Animated.View entering={index < 15 ? FadeInUp.duration(400).delay(index * 30).reduceMotion(ReduceMotion.System) : undefined} style={[s.filmItem, { width: itemWidth }]}>
      <PressableScale
        style={[s.filmCard, { width: itemWidth, height: itemHeight }, isFirst && s.filmCardFirst]}
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
          // A MARK, NOT THE TITLE AGAIN. This printed the film's name inside
          // the card, and the caption prints it directly beneath — the same
          // words twice, stacked, which reads as a mistake rather than a
          // missing poster. The caption already names it, so the empty frame
          // only has to look deliberate.
          <View style={s.posterPlaceholder}>
            <Text style={s.placeholderMark}>✦</Text>
          </View>
        )}
        {isLogged && (
          <View style={s.loggedBadge}>
            <CheckCircle2 size={12} color={colors.sepia} />
          </View>
        )}
      </PressableScale>
      {isRanked ? (
        <View style={s.filmCaptionRow}>
          <Text style={[s.filmRank, isFirst && s.filmRankFirst]}>{index + 1}</Text>
          <Text style={s.filmTitleInline} numberOfLines={2}>{item.title}</Text>
        </View>
      ) : (
        <Text style={s.filmTitle} numberOfLines={2}>{item.title}</Text>
      )}
    </Animated.View>
  );
});

/**
 * THE CHROME, WITH A GROUND.
 *
 * There were three of these — loading, unreachable, and the stack itself — and
 * they had drifted apart. The loading one carried no safe-area padding and no
 * height at all, so the way back sat under the notch for as long as the fetch
 * took. One component now, so a fix cannot land on two screens out of three.
 *
 * ── A BLUR IS NOT A SCRIM ───────────────────────────────────────────────────
 * The only thing behind this chrome used to be a blur whose opacity ramped from
 * zero. Two things follow from that, and both were visible on a real phone:
 * near-black content blurred against near-black chrome separates almost
 * nothing, so the page read straight through beneath the clock; and at the top
 * of the page the ramp is still at 0, so the back arrow sat on bare artwork.
 *
 * The gradient is the mechanism now and the blur is a bonus, which is also the
 * law this page is held to: NO PLATFORM-SPECIFIC EFFECT MAY BE THE ONLY
 * MECHANISM. expo-blur is strong on iOS and weak on Android; a gradient renders
 * identically on both. So the page is correct everywhere and lovelier on iOS,
 * instead of resting on something one platform does badly.
 *
 * The scrim overhangs the bar by 44pt and fades to nothing, so the chrome
 * dissolves into the film rather than sitting on it behind a ruled edge — the
 * hairline border this used to carry is gone with it.
 */
const StackNav = React.memo(function StackNav({
    topInset, onBack, blurStyle, children,
}: {
    topInset: number;
    onBack: () => void;
    /** Scroll-driven blur, on iOS only. Omitted on the loading and error screens. */
    blurStyle?: any;
    children?: React.ReactNode;
}) {
    const height = Math.max(topInset + 50, 70);
    return (
        <View style={[s.navBar, { height, paddingTop: topInset }]} pointerEvents="box-none">
            <View style={[s.navScrim, { height: height + 44 }]} pointerEvents="none">
                <LinearGradient
                    colors={['rgba(10,7,3,0.92)', 'rgba(10,7,3,0.78)', 'rgba(10,7,3,0.34)', 'rgba(10,7,3,0)']}
                    locations={[0, 0.46, 0.78, 1]}
                    style={StyleSheet.absoluteFillObject}
                />
                {Platform.OS === 'ios' && blurStyle && (
                    <AnimatedBlurView intensity={80} tint="dark" style={[StyleSheet.absoluteFill, blurStyle]} />
                )}
            </View>
            <View style={s.navInner}>
                <PressableScale onPress={onBack} style={s.backBtn} hitSlop={null} haptic="light" accessibilityRole="button" accessibilityLabel="Go back">
                    <ArrowLeft size={20} color={colors.bone} />
                </PressableScale>
                {children ?? <View />}
            </View>
        </View>
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
  // The overlay is absolute, so the container's padding cannot lift it — its
  // own foot rides the keyboard instead. Android resizes the window, so there
  // is nothing to lift there.
  const critiqueSheetStyle = useAnimatedStyle(() => ({
    bottom: Platform.OS === 'ios' ? keyboard.height.value : 0,
  }));
  const logs = useListStore(s => s.logs);
  const toggleListEndorse = useListStore(s => s.toggleListEndorse);
  const deleteList = useListStore(s => s.deleteList);
  const isCertified = useListStore(s => !!s._listEndorsedIndex[id]);
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const ITEM_WIDTH = (windowWidth - 18 - 42) / 3;   // 9*2 page + 7*2 per cell x3
  const ITEM_HEIGHT = ITEM_WIDTH * 1.5;
  /**
   * The hero is measured from the safe area, not from the phone.
   *
   * It was windowHeight * 0.45, so the title landed 204pt below the notch on a
   * 852pt phone and 120pt lower on a 932pt one — the page's first impression
   * changed with the hardware. Anchored to the inset it is the same picture
   * everywhere, with a floor and a ceiling so a small phone is not swallowed by
   * its own header.
   */
  const HEADER_HEIGHT = insets.top + Math.min(320, Math.max(236, windowHeight * 0.38));


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
          filmCount: payload.filmCount,
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

  /**
   * THE TITLE IS SET, NOT SQUEEZED.
   *
   * A stack title may be 100 characters (MAX_LENGTHS.listTitle). Rye at 36pt
   * fits about 14 per line here, so numberOfLines={3} held roughly 42 — and
   * "WHEN THE MIND BECOMES THE MONSTER" is 33, which means the sample title was
   * already at the edge and anything longer was cut with an ellipsis.
   *
   * adjustsFontSizeToFit is not the answer: it is unreliable multiline on
   * Android, so the two platforms would disagree about the same title. This is
   * the editorial answer instead — a longer title is SET SMALLER, the way a
   * catalogue sets one, in three deterministic steps computed from the real
   * measured width. Identical on both platforms, and it cannot truncate: the
   * smallest step holds 100 characters on a 360dp screen with a line to spare.
   */
  const titleType = React.useMemo(() => {
    const width = windowWidth - 32;                    // one column, 16 each side
    const capacity = (size: number, lines: number) => (width / (size * 0.723)) * lines;
    const len = (list?.title?.length ?? 0);
    if (len <= capacity(36, 3)) return { fontSize: 36, lineHeight: 40, numberOfLines: 3 };
    if (len <= capacity(30, 4)) return { fontSize: 30, lineHeight: 34, numberOfLines: 4 };
    return { fontSize: 24, lineHeight: 28, numberOfLines: 6 };
  }, [windowWidth, list?.title]);

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
  // Long epigraphs (descriptions run up to 1,000 chars) clamp to 4 lines behind
  // a READ MORE fold. The toggle shows on a deterministic length threshold —
  // no platform-dependent line measurement, so it behaves identically everywhere.
  const [descExpanded, setDescExpanded] = useState(false);
  const [descLineCount, setDescLineCount] = useState(0);
  /**
   * ONE source of truth. A separate "filed" counter added to the payload's
   * number would double-count the moment the stack refetched, because the
   * server's count already includes the critique just filed. The cached payload
   * is nudged instead, exactly as the comment list itself already is.
   */
  const critiqueCount = (stackQueryData?.list as { critiqueCount?: number | null } | null)?.critiqueCount ?? null;

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
    TactileEngine.mutate();
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
    } catch (err: unknown) {
      // Was a bare `catch {` with no binding — it could not log even in principle.
      // debug, not warn: logger.warn forwards to Sentry ungated in production,
      // which would raise a warning for an ordinary offline failure on top of
      // the gated error below. One event for a real defect, none when offline.
      logger.debug('[Stack] Certification toggle failed:', err);
      addBreadcrumb('stacks.toggleCertification failed', 'telemetry');
      if (!isNetworkError(err)) captureError(err, { scope: 'stacks.toggleCertification', stackId: id });
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
                avatar_url: useAuthStore.getState().user?.avatar_url ?? null,
                content: p.content,
                created_at: new Date().toISOString()
            });
        }
        return finalComments;
      } catch (error) {
        // Finding 116: this logged ONLY under __DEV__, so a real member's failure
        // left no trace. Sentry now gets genuine defects — and only those.
        logger.debug('[Stack] Comments fetch failed:', error);
        addBreadcrumb('stacks.fetchComments failed', 'telemetry');
        if (!isNetworkError(error)) captureError(error, { scope: 'stacks.fetchComments', stackId: id });
        
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
                avatar_url: useAuthStore.getState().user?.avatar_url ?? null,
                content: p.content,
                created_at: new Date().toISOString()
            };
        });
      }
    },
    enabled: showComments && z.string().uuid().safeParse(id).success,
  });

  const handleToggleComments = useCallback(() => {
    TactileEngine.selection();
    // Focus only on the way IN. This focused the field on close too, which
    // summoned the keyboard for a surface that was going away.
    setShowComments((prev) => {
      if (!prev) setTimeout(() => commentInputRef.current?.focus(), 120);
      return !prev;
    });
  }, []);

  /**
   * An overlay is not a Modal, so it gets no back button for free.
   *
   * It is deliberately not a Modal: long-pressing a critique opens
   * ContentActionSheet, which IS one, and a Modal over a Modal is the iOS trap
   * this app already has a law about. As an overlay the moderation sheet is the
   * only Modal on screen and nothing nests — the cost is handling this by hand.
   */
  React.useEffect(() => {
    if (!showComments) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      setShowComments(false);
      return true;                       // consumed: the page stays put
    });
    return () => sub.remove();
  }, [showComments]);

  /**
   * Moves the number on the button in step with the list beneath it.
   *
   * Not applied on the offline path: the optimistic critique stays in the cache
   * there because it is queued, so the count must stay with it. Only a real
   * failure takes it back.
   */
  const bumpCritiqueCount = useCallback((by: number) => {
    queryClient.setQueryData(['stack', id], (old: any) => {
      const current = old?.list?.critiqueCount;
      if (typeof current !== 'number') return old;   // never invent a count
      return { ...old, list: { ...old.list, critiqueCount: Math.max(0, current + by) } };
    });
  }, [queryClient, id]);

  const handleSubmitComment = useCallback(async () => {
    // Pre-flight Zod validation
    if (!commentText.trim() || submittingComment || !user || !z.string().uuid().safeParse(id).success) {
        if (commentText.trim() && !z.string().uuid().safeParse(id).success) reelToast.error('Invalid stack record.');
        return;
    }
    setSubmittingComment(true);
    const content = commentText.trim();
    const tempId = `temp_${Date.now()}`;
    
    // Optimistic Update — with the member's own face, never a ghost.
    const optimisticComment: ListComment = {
      id: tempId,
      user_id: user.id,
      username: user.username || 'anon',
      avatar_url: user.avatar_url ?? null,
      content,
      created_at: new Date().toISOString()
    };
    
    // CQRS Optimistic sync directly to cache
    queryClient.setQueryData(['stackComments', id], (old: ListComment[] | undefined) => {
      if (!old) return [optimisticComment];
      return [...old, optimisticComment];
    });

    bumpCritiqueCount(+1);
    setCommentText('');
    TactileEngine.success();

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
        bumpCritiqueCount(-1);
        setCommentText(content);
        reelToast.error('Your critique could not be filed.');
      }
    } finally {
      setSubmittingComment(false);
    }
  }, [commentText, submittingComment, user, id, queryClient, bumpCritiqueCount]);

  const handleOpenShareLounge = useCallback(async () => {
    TactileEngine.selection();
    if (!user) {
      reelToast.error('You must be logged in to access the lounge.');
      return;
    }
    setShowLoungeShare(true);
  }, [user]);

  const handleDelete = useCallback(() => {
    TactileEngine.destroy();
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
              TactileEngine.warn();
              router.back();
             
            } catch (err: unknown) {
              // Finding 117: deleting a stack failed with a toast and no record of why.
              logger.debug('[Stack] Delete failed:', err);
              addBreadcrumb('stacks.deleteStack failed', 'telemetry');
              if (!isNetworkError(err)) captureError(err, { scope: 'stacks.deleteStack', stackId: id });
              reelToast.error('The collection resists destruction.');
            }
          },
        },
      ]
    );
  }, [id, deleteList, router, queryClient]);

  const handlePressFilm = useCallback((filmId: number) => {
    TactileEngine.selection();
    (router.push as any)(`/film/${filmId}` as any);
  }, [router]);

  // No dead ends: curator + critics navigate to their dossiers. Placeholder
  // identities (offline-stitched rows) are guarded — they go nowhere quietly.
  const handlePressProfile = useCallback((username?: string) => {
    if (!username || username === 'anonymous' || username === 'unknown' || username === 'anon') return;
    TactileEngine.selection();
    (router.push as any)(`/user/${username}` as any);
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
        <StackNav topInset={insets.top} onBack={() => router.back()} />
        <View style={s.loadingCenter}>
          <ActivityIndicator size="large" color={colors.sepia} />
        </View>
      </View>
    );
  }

  // CLASSIFIED covers both failure to retrieve AND a private stack reached by
  // direct link by anyone but its curator (defense-in-depth beside the RLS gate).
  if (isError || !list || (list.isPrivate && !isOwner)) {
    return (
      <View style={s.container}>
        <StackNav topInset={insets.top} onBack={() => router.back()} />
        <View style={s.loadingCenter}>
          <Text style={s.title}>CLASSIFIED</Text>
          <Text style={[s.desc, { textAlign: 'center', marginTop: 12 }]}>This stack could not be retrieved.{'\n'}It may be sealed or incinerated.</Text>
        </View>
      </View>
    );
  }

  const estDate = list.createdAt && !isNaN(Date.parse(list.createdAt)) ? formatDateMonthYear(list.createdAt) : null;
  // Measured, not guessed. This was `description.length > 240` while the clamp
  // is four lines, and the two disagree in both directions: a short description
  // carrying line breaks was clamped with NO way to open it, and a long one of
  // short words offered a READ MORE that did nothing when pressed. Only the
  // text itself knows how many lines it took.
  const descNeedsFold = descLineCount > DESC_CLAMP_LINES;



  /**
   * The first film that HAS artwork — not simply the first film.
   *
   * This read films[0].poster_path, so a stack whose opening entry happened to
   * have no poster lost its entire hero even when the other ten did. One
   * missing image should never flatten the page.
   */
  const heroPoster = (() => {
    const withArt = list.films.find(f => !!f.poster_path);
    return withArt ? tmdb.poster(withArt.poster_path!, 'w780') : null;
  })();

  return (
    <Animated.View style={[s.container, animatedContainerStyle]}>
      {/* Absolute Dynamic Nav Bar */}
      <StackNav topInset={insets.top} onBack={() => router.back()} blurStyle={navBlurStyle}>
        {isOwner ? (
          <View style={s.headerActions}>
            <PressableScale style={s.actionBtn} onPress={() => { (router.push as any)({ pathname: '/list-modal', params: { editId: id } } as import('expo-router').Href); }} hitSlop={null} haptic="selection" accessibilityRole="button" accessibilityLabel="Edit stack">
              <Edit3 size={18} color={colors.fog} />
            </PressableScale>
            <PressableScale style={s.actionBtn} onPress={handleDelete} hitSlop={null} haptic="medium" accessibilityRole="button" accessibilityLabel="Delete stack">
              <Trash2 size={18} color={colors.crimson} />
            </PressableScale>
          </View>
        ) : (
          <PressableScale
            style={s.moreBtn}
            onPress={() => setActionSheetVisible(true)}
            hitSlop={null}
            haptic="selection"
            pressedScale={0.92}
            accessibilityRole="button"
            accessibilityLabel="More options for this stack"
          >
            <MoreHorizontal size={16} color={colors.fog} strokeWidth={1.5} />
          </PressableScale>
        )}
      </StackNav>

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
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.sepia} colors={[colors.sepia]} progressBackgroundColor={colors.ink} progressViewOffset={Math.max(insets.top + 50, 70)} />}
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
              {/* No eyebrow. "FROM THE STACKS" labelled a page that is
                  unmistakably a stack, and it was the first of eight rows
                  before any content on the page most guilty of chrome. A
                  catalogue does not print its own category above its title. */}

              <Animated.Text
                entering={FadeInDown.duration(600).delay(100).reduceMotion(ReduceMotion.System)}
                style={[s.title, { fontSize: titleType.fontSize, lineHeight: titleType.lineHeight }]}
                numberOfLines={titleType.numberOfLines}
              >
                {list.title.toUpperCase()}
              </Animated.Text>

              {/* Colophon — curator (tappable) · reel count · curation date · chips.
                  flexWrap lets long names push the chips to a second line, never cramping. */}
              {/* ONE LINE OF TYPE, not four flex items that wrap.
                  Each fragment used to be its own <Text> inside a wrapping row,
                  so "· EST. MARCH 2026" could fall to the next line carrying its
                  separator — a line that begins with a middle dot. Nested Text
                  wraps as prose instead, and the separators belong to the words
                  before them. The chips stay their own elements: they are
                  objects, not punctuation. */}
              <Animated.View entering={FadeInDown.duration(600).delay(200).reduceMotion(ReduceMotion.System)} style={s.metaRow}>
                <View style={s.metaDiamond} />
                <Text style={s.metaText} numberOfLines={2}>
                  <Text style={s.metaCurator} onPress={() => handlePressProfile(list.user)} suppressHighlighting accessibilityRole="link" accessibilityLabel={`View curator @${list.user}`}>@{list.user.toUpperCase()}</Text>
                  <Text style={s.metaSep}>{'  ·  '}</Text>
                  {(list.filmCount ?? list.films.length)} {(list.filmCount ?? list.films.length) === 1 ? 'REEL' : 'REELS'}
                  {estDate ? <><Text style={s.metaSep}>{'  ·  '}</Text>EST. {estDate.toUpperCase()}</> : null}
                </Text>
                {list.isRanked && (
                  <View style={s.metaChip}><Text style={s.metaChipText}>✦ RANKED</Text></View>
                )}
                {list.isPrivate && isOwner && (
                  <View style={s.metaChip}>
                    <KeyRound size={8} color={colors.sepia} strokeWidth={2} />
                    <Text style={s.metaChipText}>SEALED</Text>
                  </View>
                )}
              </Animated.View>

              {list.description ? (
                <Animated.View entering={FadeInDown.duration(600).delay(300).reduceMotion(ReduceMotion.System)} style={s.descWrap}>
                  {/* THE MEASURER.
                      onTextLayout reports the lines it ACTUALLY laid out, so a
                      clamped Text reports the clamp — four — and "4 > 4" is
                      false, which would mean the fold never appeared at all.
                      That is worse than the character count it replaced, which
                      at least appeared sometimes.

                      So the measuring is done by a copy that is never clamped:
                      out of flow, invisible, untouchable, hidden from screen
                      readers, and unmounted the moment it has answered. It
                      spans the same width as the real one, so its line count is
                      the real one. */}
                  {descLineCount === 0 && (
                    <Text
                      style={[s.desc, s.descMeasure]}
                      onTextLayout={e => setDescLineCount(e.nativeEvent.lines.length)}
                      accessible={false}
                      importantForAccessibility="no-hide-descendants"
                      pointerEvents="none"
                    >
                      {list.description}
                    </Text>
                  )}
                  <Text style={s.desc} numberOfLines={descExpanded ? undefined : DESC_CLAMP_LINES}>
                    {list.description}
                  </Text>
                  {descNeedsFold && (
                    <PressableScale onPress={() => { TactileEngine.selection(); setDescExpanded(p => !p); }} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} haptic="selection" accessibilityRole="button" accessibilityLabel={descExpanded ? 'Collapse description' : 'Expand description'}>
                      <Text style={s.descToggle}>{descExpanded ? 'FOLD ▴' : 'READ MORE ▾'}</Text>
                    </PressableScale>
                  )}
                </Animated.View>
              ) : null}

              {/* ── ACTION BAR: Certify · Critic · Share to Lounge ── */}
              <Animated.View entering={FadeInDown.duration(600).delay(350).reduceMotion(ReduceMotion.System)} style={s.actionBar}>
                <PressableScale style={s.actionItem} onPress={handleCertify} hitSlop={null} haptic="selection" accessibilityRole="button" accessibilityLabel={isCertified ? "Uncertify stack" : "Certify stack"}>
                  <View pointerEvents="none"><Heart size={16} strokeWidth={2} color={isCertified ? colors.crimson : colors.fog} fill={isCertified ? colors.crimson : 'transparent'} /></View>
                  <Text style={[s.actionLabel, isCertified && s.actionLabelActive]} pointerEvents="none" numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>
                    {certifyCount > 0 ? `${certifyCount} ` : ''}{isCertified ? 'CERTIFIED' : 'CERTIFY'}
                  </Text>
                </PressableScale>

                <View style={s.actionDivider} />

                <PressableScale style={s.actionItem} onPress={handleToggleComments} hitSlop={null} haptic="selection" accessibilityRole="button" accessibilityState={{ expanded: showComments }} accessibilityLabel={critiqueCount === null ? 'Critiques' : `${critiqueCount} ${critiqueCount === 1 ? 'critique' : 'critiques'}`}>
                  <View pointerEvents="none"><MessageCircle size={14} color={showComments ? colors.sepia : colors.fog} /></View>
                  {/* The count is null when the server could not be asked — the
                      button then says CRITIQUES rather than a confident 0, since
                      "none" and "we could not count" are different statements. */}
                  <Text style={[s.actionLabel, showComments && s.actionLabelOpen]} pointerEvents="none" numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>
                    {critiqueCount ? `${critiqueCount} ` : ''}CRITIQUES
                  </Text>
                </PressableScale>

                <View style={s.actionDivider} />

                <PressableScale style={s.actionItem} onPress={handleOpenShareLounge} hitSlop={null} haptic="selection" accessibilityRole="button" accessibilityLabel="Share to lounge">
                  <View pointerEvents="none"><Send size={14} color={colors.fog} /></View>
                  <Text style={s.actionLabel} pointerEvents="none" numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>LOUNGE</Text>
                </PressableScale>
              </Animated.View>

              {/* The critiques are not here any more. They opened BETWEEN the
                  description and the index, so the films a reader came for were
                  pushed below a panel of unknown length — and at 500 reels that
                  panel sat on top of 167 rows. They live in an overlay now,
                  which is one tap away at any size and displaces nothing. */}
              <View style={s.trackRow}>
                <Text style={s.trackLabel}>
                  INDEXED REELS{(list.filmCount ?? 0) > list.films.length ? `  ·  FIRST ${list.films.length}` : ''}
                </Text>
                <LinearGradient colors={[colors.sepiaBorder, 'transparent']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={s.trackLine} />
              </View>
            </View>
          </>
        }
        renderItem={renderItem as any}
        ListEmptyComponent={
          <View style={s.emptyState}>
            <Text style={s.emptyTitle}>An Empty Stack</Text>
            <Text style={s.emptySubtitle}>No reels have been indexed to this collection yet.</Text>
          </View>
        }
      />

      {/* ══ THE CRITIQUES ══════════════════════════════════════════════════
          An overlay, NOT a Modal. Long-pressing a critique opens
          ContentActionSheet, which is a real RN Modal — and a Modal over a
          Modal is the iOS trap that produced this app's park-then-travel law.
          Rendered in the page instead, the moderation sheet is the only Modal
          on screen and nothing nests. It also keeps the docked input clear of
          the keyboard problems a Modal brings with it.

          It sits below the chrome so the way out stays visible, and the strip
          of page above it is a dimmed backdrop you can tap to leave. */}
      {showComments && (
        <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
          <PressableScale
            style={[s.critiqueBackdrop, { height: Math.max(insets.top + 50, 70) }]}
            onPress={handleToggleComments}
            hitSlop={null}
            pressedScale={1}
            accessibilityRole="button"
            accessibilityLabel="Close critiques"
          />
          <Animated.View
            entering={FadeInUp.duration(260).reduceMotion(ReduceMotion.System)}
            style={[s.critiqueSheet, { top: Math.max(insets.top + 50, 70) }, critiqueSheetStyle]}
          >
            <View style={s.critiqueHandleWrap}><View style={s.critiqueHandle} /></View>
            <View style={s.critiqueHead}>
              <Text style={s.critiqueTitle}>THE CRITIQUES</Text>
              {critiqueCount !== null && (
                <View style={s.critiqueCountChip}><Text style={s.critiqueCountText}>{critiqueCount}</Text></View>
              )}
              <PressableScale style={s.critiqueClose} onPress={handleToggleComments} hitSlop={null} haptic="selection" accessibilityRole="button" accessibilityLabel="Close critiques">
                <X size={16} color={colors.fog} />
              </PressableScale>
            </View>

            <ScrollView style={s.critiqueBody} contentContainerStyle={s.critiqueBodyContent} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
              {(queryComments || []).length === 0 ? (
                <Text style={s.commentEmpty}>No critiques yet. Be the first to speak.</Text>
              ) : (
                (queryComments || []).map(c => (
                  <StackCommentRow key={c.id} c={c} currentUserId={user?.id} onPressProfile={handlePressProfile} onLongPress={(comment) => {
                    setSelectedComment(comment);
                    setCommentActionSheetVisible(true);
                  }} />
                ))
              )}
            </ScrollView>

            {user && (
              <View style={[s.critiqueFoot, { paddingBottom: Platform.OS === 'ios' ? 16 : Math.max(insets.bottom, 16) }]}>
                <TextInput
                  ref={commentInputRef}
                  style={s.critiqueField}
                  placeholder="File a critique..."
                  placeholderTextColor={colors.ash}
                  value={commentText}
                  onChangeText={handleCommentTextChange}
                  returnKeyType="send"
                  onSubmitEditing={handleSubmitComment}
                  maxLength={MAX_LENGTHS.listComment}
                  multiline
                  selectionColor={colors.selection}
                  cursorColor={colors.sepia}
                  disableFullscreenUI={true}
                  keyboardAppearance="dark"
                  accessibilityLabel="Stack critique"
                />
                <PressableScale onPress={handleSubmitComment} disabled={submittingComment || !commentText.trim()} style={[s.critiqueSend, (!commentText.trim()) && s.sendBtnDisabled]} hitSlop={null} haptic="light" accessibilityRole="button" accessibilityLabel="Submit critique">
                  <Send size={15} color={colors.ink} />
                </PressableScale>
              </View>
            )}
          </Animated.View>
        </View>
      )}

      {/* ── SHARE TO LOUNGE MODAL ── */}
      <ShareToLoungeModal
        visible={showLoungeShare}
        onClose={() => setShowLoungeShare(false)}
        listId={list.id}
        listTitle={list.title}
        listFilmCount={list.filmCount ?? list.films.length}
        listCurator={list.user}
        listTopPosters={list.films.map((f: FilmItem) => f.poster_path).filter(Boolean).slice(0, 4) as string[]}
      />

      {/* ── MODERATION: ACTION SHEET & REPORT SHEET ──
          onBlock/onMute below also close the sheet. They did not, and every other
          sheet in the app does (log, dossier, lounge, profile, and all three comment
          sheets) — this one was simply missed. */}
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
        onBlock={() => {
          blockUser(list.userId);
          setActionSheetVisible(false);
        }}
        onMute={() => {
          muteUser(list.userId);
          setActionSheetVisible(false);
        }}
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
  // No border: the scrim below fades out instead of ending on a ruled line, so
  // the chrome dissolves into the film rather than sitting on top of it.
  navBar: { position: 'absolute', top: 0, left: 0, right: 0, zIndex: 100 },
  // Overhangs the bar so the gradient has room to reach zero past the chrome.
  navScrim: { position: 'absolute', top: 0, left: 0, right: 0 },
  navInner: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16 },
  // 48 by geometry, and the glyph stays hard left so it does not move: the box
  // simply extends into empty chrome. A halo could not have done this — neither
  // platform's accessibility layer can see one.
  backBtn: { width: 48, height: 48, marginLeft: -14, alignItems: 'flex-start', justifyContent: 'center' },
  headerActions: { flexDirection: 'row', gap: 12 },
  actionBtn: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center' },
  moreBtn: { width: 48, height: 48, alignItems: 'flex-end', justifyContent: 'center', marginRight: -10 },

  /**
   * ONE COLUMN.
   *
   * The scroll held 12 and the hero wrap added 16, so the title began 28pt in
   * while the posters began at 16 — two left edges on one page, which is most
   * of why it read as assembled rather than designed.
   *
   * The arithmetic, stated once: 9 here + 7 on each cell = a 16pt page margin,
   * and 7 + 7 = a 14pt gutter between cells. The hero wrap adds the same 7, so
   * the title starts exactly where the posters do. Change any one of these
   * three numbers and the column breaks.
   */
  scrollContent: { paddingBottom: 60, paddingHorizontal: 9 },
  parallaxHeader: { position: 'absolute', top: 0, left: 0, right: 0 },
  headerContentWrap: { paddingHorizontal: 7, paddingBottom: 24 },
  title: { fontFamily: fonts.display, fontSize: 36, color: colors.parchment, lineHeight: 40, textShadowColor: 'rgba(0,0,0,0.8)', textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 6 },
  // The colophon is ONE Text now, so the curator, the count and the date wrap
  // as prose and a separator can never begin a line. The row still wraps, but
  // only to let the chips fall below — they are objects, not punctuation.
  metaRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', columnGap: 7, rowGap: 6, marginTop: 16, marginBottom: 16 },
  metaDiamond: { width: 5, height: 5, backgroundColor: colors.sepia, transform: [{ rotate: '45deg' }] },
  metaCurator: { fontFamily: fonts.sub, fontSize: 10, letterSpacing: 1.5, color: colors.parchment, textDecorationLine: 'underline', textDecorationColor: colors.sepiaBorder },
  metaText: { flexShrink: 1, fontFamily: fonts.sub, fontSize: 10, lineHeight: 16, letterSpacing: 1.5, color: colors.fog },
  metaSep: { color: colors.sepia },
  metaChip: { flexDirection: 'row', alignItems: 'center', gap: 3, borderWidth: 1, borderColor: 'rgba(184,137,26,0.4)', borderRadius: 3, paddingHorizontal: 6, paddingVertical: 2 },
  metaChipText: { fontFamily: fonts.sub, fontSize: 8, letterSpacing: 1.2, color: colors.sepia, includeFontPadding: false },
  // The epigraph — prose wears Courier italic, folded past four lines.
  descWrap: { marginBottom: 24 },
  desc: { fontFamily: fonts.body, fontStyle: 'italic', fontSize: 13, color: colors.bone, lineHeight: 21, opacity: 0.9 },
  descToggle: { fontFamily: fonts.sub, fontSize: 9, letterSpacing: 2, color: colors.sepia, marginTop: 8 },
  // Out of flow and invisible: it exists only to be laid out once, so it must
  // occupy the same width as the real epigraph and none of its height.
  descMeasure: { position: 'absolute', left: 0, right: 0, top: 0, opacity: 0 },
  
  // ── Action Bar ──
  actionBar: {
    flexDirection: 'row', alignItems: 'center',
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: 'rgba(184,137,26,0.25)',
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: 'rgba(184,137,26,0.25)',
    marginBottom: 16,
  },
  // The row's padding moved into the items, so each one IS the target: 48 by
  // its own geometry rather than a 36pt control wearing a halo neither
  // platform's accessibility layer can see.
  actionItem: { flex: 1, minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  actionLabel: { fontFamily: fonts.sub, fontSize: 9, letterSpacing: 1.5, color: colors.fog },
  actionDivider: { width: 1, height: 16, backgroundColor: 'rgba(184,137,26,0.2)' },

  // ── Critiques Panel ──
  commentEmpty: { fontFamily: fonts.body, fontStyle: 'italic', fontSize: 12, color: colors.fog, textAlign: 'center', paddingVertical: 8, opacity: 0.7 },
  commentRow: { flexDirection: 'row', gap: 8, marginBottom: 10, alignItems: 'flex-start' },
  commentAvatar: {
    width: 24, height: 24, borderRadius: 12, backgroundColor: colors.soot,
    borderWidth: 1, borderColor: 'rgba(184,137,26,0.3)', overflow: 'hidden',
    alignItems: 'center', justifyContent: 'center',
  },
  commentAvatarImg: { width: '100%', height: '100%' },
  commentBodyWrap: { flex: 1 },
  commentHead: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 },
  commentUserPress: { flexShrink: 1 },
  commentUser: { fontFamily: fonts.sub, fontSize: 9, letterSpacing: 0.5, color: colors.sepia },
  // colors.ash is this app's BORDER colour, and it was being used as text:
  // 1.27:1 against the panel, where 4.5 is the floor for small type. Every
  // critique on the page was effectively undated. fog reads at 5.9:1.
  commentTime: { fontFamily: fonts.sub, fontSize: 8, letterSpacing: 0.5, color: colors.fog, includeFontPadding: false },
  commentBody: { fontFamily: fonts.body, fontSize: 12, color: colors.bone, lineHeight: 18, marginTop: 2 },

  trackRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 12, marginBottom: 20 },
  trackLabel: { fontFamily: fonts.sub, fontSize: 9, letterSpacing: 2.5, color: colors.sepia },
  trackLine: { flex: 1, height: 1 },
  
  // The gutters disagreed — 8 across, 24 down — so the sheet read tight
  // sideways and loose downward. They are one number now, and the row gap lives
  // on the item so FlashList still measures a whole cell.
  filmItem: { marginBottom: 14, marginHorizontal: 7 },
  filmCard: { borderRadius: 2, overflow: 'hidden', backgroundColor: colors.soot, borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.1)' },
  // The podium frame — only #1 of a ranked stack earns the brass hairline.
  filmCardFirst: { borderWidth: 1, borderColor: 'rgba(184,137,26,0.45)' },
  posterPlaceholder: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 8 },
  placeholderMark: { fontFamily: fonts.sub, fontSize: 15, color: colors.ash, includeFontPadding: false },
  loggedBadge: { position: 'absolute', top: 4, right: 4, width: 22, height: 22, borderRadius: 11, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(10,7,3,0.75)', borderWidth: 1, borderColor: 'rgba(184,137,26,0.5)' },
  /**
   * A CAPTION BOX, not a caption.
   *
   * numberOfLines={2} with no reserved height meant a one-line title made a
   * short cell and a two-line title a tall one, so the rows stopped sharing a
   * baseline and the index rippled. minHeight is two lines of its own
   * lineHeight — computed, not typed — so it still grows rather than clips when
   * the reader enlarges text.
   */
  filmTitle: {
    fontFamily: fonts.sub, fontSize: 11, lineHeight: 14, minHeight: 28,
    color: colors.fog, marginTop: 8, textAlign: 'center', paddingHorizontal: 2,
  },
  // The rank, off the artwork and into the catalogue line. A 28pt numeral under
  // a gradient covered the bottom of every poster to say what one line of type
  // says better — and the poster is the thing a reader came to look at.
  filmCaptionRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'center', gap: 5, marginTop: 8 },
  filmRank: { fontFamily: fonts.sub, fontSize: 10, letterSpacing: 1, color: colors.sepia, includeFontPadding: false },
  filmRankFirst: { color: colors.flicker },
  filmTitleInline: { flexShrink: 1, fontFamily: fonts.sub, fontSize: 11, lineHeight: 14, minHeight: 28, color: colors.fog, textAlign: 'center' },
  
  /* ── THE CRITIQUES ── an overlay, so the index behind it never moves ── */
  // The strip of page left visible above the sheet. Dimmed so the sheet reads
  // as sitting ON the page, and tappable, because reaching for the thing behind
  // is the most natural way anyone closes a surface like this.
  critiqueBackdrop: { position: 'absolute', top: 0, left: 0, right: 0, backgroundColor: 'rgba(5,4,2,0.72)' },
  critiqueSheet: {
    position: 'absolute', left: 0, right: 0,
    backgroundColor: colors.soot,
    borderTopLeftRadius: 14, borderTopRightRadius: 14,
    borderTopWidth: 1, borderTopColor: 'rgba(184,137,26,0.28)',
    overflow: 'hidden',
  },
  critiqueHandleWrap: { paddingTop: 10, alignItems: 'center' },
  critiqueHandle: { width: 36, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.2)' },
  critiqueHead: {
    flexDirection: 'row', alignItems: 'center', gap: 10, paddingLeft: 20, paddingRight: 8,
    paddingTop: 14, paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: 'rgba(184,137,26,0.25)',
  },
  critiqueTitle: { fontFamily: fonts.sub, fontSize: 10, letterSpacing: 2.5, color: colors.sepia, includeFontPadding: false },
  critiqueCountChip: { borderWidth: 1, borderColor: 'rgba(184,137,26,0.3)', borderRadius: 3, paddingHorizontal: 6, paddingVertical: 1 },
  critiqueCountText: { fontFamily: fonts.sub, fontSize: 9, letterSpacing: 1, color: colors.fog, includeFontPadding: false },
  // 48 by geometry, glyph hard right, so the box extends into empty chrome.
  critiqueClose: { marginLeft: 'auto', width: 48, height: 48, alignItems: 'flex-end', justifyContent: 'center', paddingRight: 4 },
  critiqueBody: { flex: 1 },
  critiqueBodyContent: { paddingHorizontal: 20, paddingTop: 6, paddingBottom: 12 },
  critiqueFoot: {
    flexDirection: 'row', alignItems: 'flex-end', gap: 10, paddingHorizontal: 20, paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: 'rgba(184,137,26,0.25)',
    backgroundColor: colors.ink,
  },
  critiqueField: {
    flex: 1, minHeight: 48, maxHeight: 120,
    backgroundColor: 'rgba(10,7,3,0.6)', borderWidth: 1, borderColor: 'rgba(184,137,26,0.2)',
    borderRadius: 4, paddingHorizontal: 12, paddingVertical: 12,
    fontFamily: fonts.body, fontSize: 13, lineHeight: 18, color: colors.bone,
  },
  critiqueSend: {
    minWidth: 48, minHeight: 48, alignItems: 'center', justifyContent: 'center',
    backgroundColor: colors.sepia, borderRadius: 4,
  },

  emptyState: { alignItems: 'center', paddingVertical: 40, paddingHorizontal: 20 },
  emptyTitle: { fontFamily: fonts.display, fontSize: 20, color: colors.sepia, marginBottom: 8 },
  emptySubtitle: { fontFamily: fonts.body, fontStyle: 'italic', fontSize: 13, color: colors.fog, textAlign: 'center' },

  loadingCenter: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  actionLabelActive: { color: colors.crimson },
  actionLabelOpen: { color: colors.sepia },
  sendBtnDisabled: { opacity: 0.3 },
});


StackDetailFilmCard.displayName = 'StackDetailFilmCard';

StackCommentRow.displayName = 'StackCommentRow';