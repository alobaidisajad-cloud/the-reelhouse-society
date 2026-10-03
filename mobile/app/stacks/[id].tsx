import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as Crypto from 'expo-crypto';
 
import { CinematicFlashList } from '@/src/components/layout/CinematicFlashList';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { BlurView } from 'expo-blur';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ArrowLeft, Heart, CheckCircle2, Edit3, KeyRound, MessageCircle, MessageSquare, MoreHorizontal, Send, Trash2, X } from 'lucide-react-native';
import { Alert, BackHandler, Platform, RefreshControl, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { Text, TextInput } from '@/src/components/text';
import { AnimatedText } from '@/src/components/text/AnimatedText';
import Animated, { FadeInDown, FadeInUp, ReduceMotion, interpolate, useAnimatedKeyboard, useAnimatedStyle, useDerivedValue, useSharedValue } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ContentActionSheet } from '@/src/components/moderation/ContentActionSheet';
import { offerWord } from '@/src/lib/pushPrimer';
import ReportSheet from '@/src/components/moderation/ReportSheet';
import PressableScale from '@/src/components/PressableScale';
import { MarkFigure, certifyLabel, critiqueLabel } from '@/src/components/MarkFigure';
import { deckLabelProps } from '@/src/constants/textScaling';
import { formatCount } from '@/src/components/dispatch/paper/paperMetrics';
import ShareToLoungeModal from '@/src/components/ShareToLoungeModal';
import { tmdb } from '@/src/lib/tmdb';
import { STACK_COMMENT_PAGE, StackService } from '@/src/services/StackService';
import { useAuthStore } from '@/src/stores/auth';
import { useBlockStore } from '@/src/stores/blockStore';
import { useListStore } from '@/src/stores/films';
import { tellMarks } from '@/src/stores/tellMarks';
import { addBreadcrumb, captureError } from '@/src/lib/sentry';
import { colors, fonts } from '@/src/theme/theme';
import { logger } from '@/src/utils/logger';
import { enqueueMutation, flushOfflineQueue } from '@/src/utils/offlineQueue';
import { isForbiddenError, isNetworkError } from '@/src/utils/networkError';
import { stillQueued, useOfflineQueueStore } from '@/src/stores/offlineQueueStore';
import { CritiqueRow, type Critique } from '@/src/components/critique/CritiqueRow';
import { TryAgainLine } from '@/src/components/TryAgain';
import { MAX_LENGTHS } from '@/src/utils/sanitizeInput';
import reelToast from '@/src/utils/reelToast';
import TactileEngine from '@/src/utils/TactileEngine';
import { formatDateMonthYear } from '@/src/utils/timeAgo';
import { z } from 'zod';
import { EDGE_LIT } from '@/src/theme/light';
import { useLineScale } from '@/src/hooks/useTextScale';
import { RoomLight, RoomVeil, type VeilStops } from '@/src/components/atmosphere/RoomLight';
import { EmptyOffline, REFRESH_FAILED } from '@/src/components/EmptyStates';
import Buster, { BusterEyes } from '@/src/components/Buster';
import { nav } from '@/src/utils/typedRouter';
import { LobbyHonour } from '@/src/components/lobby/LobbyHonour';

const blurhash = 'L87n_O~q00_300E1t7Rj00%#RjV@';

/** The epigraph's fold: ONE number for the clamp and for the test of it. */
const DESC_CLAMP_LINES = 4;
/** A film caption's line. Its two-line box is this × 2 × the text size. */
const FILM_TITLE_LINE = 14;

/** The hero's fade into the room: how much house it lays down, top to hem. */
const HERO_VEIL: VeilStops = [[0, 0.4], [0.6, 0.9], [1, 1]];

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
  /** How many critiques; null when the server could not be asked. */
  critiqueCount?: number | null;
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
  // The podium: in a ranked stack only #1 earns metal (brass, and candlelight).
  const isFirst = isRanked && index === 0;
  // Two caption lines at the size the phone draws them, so rows share a baseline.
  const titleBox = { minHeight: FILM_TITLE_LINE * 2 * useLineScale() };
  return (
    <Animated.View entering={index < 15 ? FadeInUp.duration(400).delay(index * 30).reduceMotion(ReduceMotion.System) : undefined} style={[s.filmItem, { width: itemWidth }]}>
      <PressableScale
        style={[s.filmCard, { width: itemWidth, height: itemHeight }, isFirst && s.filmCardFirst]}
        onPress={() => onPress(item.id)}
        accessibilityRole="link"
        accessibilityLabel={item.title}
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
          // A mark, not the title again: the caption beneath already names it.
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
          <Text style={[s.filmTitleInline, titleBox]} numberOfLines={2}>{item.title}</Text>
        </View>
      ) : (
        <Text style={[s.filmTitle, titleBox]} numberOfLines={2}>{item.title}</Text>
      )}
    </Animated.View>
  );
});

/**
 * THE CHROME, WITH A GROUND: one component for the loading, unreachable and
 * real pages, so the way back never sits under the notch.
 *
 * A gradient is the ground and the blur a bonus: NO PLATFORM-SPECIFIC EFFECT
 * MAY BE THE ONLY MECHANISM (expo-blur is weak on Android, and a blur of dark
 * on dark separates nothing). The scrim overhangs the bar by 44pt and fades to
 * nothing, so the chrome dissolves into the film with no ruled edge.
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
                    colors={['rgba(13,11,9,0.92)', 'rgba(13,11,9,0.78)', 'rgba(13,11,9,0.34)', 'rgba(13,11,9,0)']}
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
    // The page stays as it was; a pull that reached nothing says so, as every list does.
    if (queryClient.getQueryState(['stack', id])?.status === 'error'
      || queryClient.getQueryState(['stackComments', id])?.status === 'error') {
      reelToast.error(REFRESH_FAILED);
    }
  }, [queryClient, id]);
  const keyboard = useAnimatedKeyboard();
  const animatedContainerStyle = useAnimatedStyle(() => ({
    paddingBottom: Platform.OS === 'ios' ? keyboard.height.value : 0,
  }));
  // The overlay is absolute, so the container's padding cannot lift it — its
  // own foot rides the keyboard instead. On Android the root ends at the
  // keyboard (KeyboardRoom), so there is nothing to lift there.
  const critiqueSheetStyle = useAnimatedStyle(() => ({
    bottom: Platform.OS === 'ios' ? keyboard.height.value : 0,
  }));
  const logs = useListStore(s => s.logs);
  const toggleListEndorse = useListStore(s => s.toggleListEndorse);
  const deleteList = useListStore(s => s.deleteList);
  const isCertified = useListStore(s => !!s._listEndorsedIndex[id]);
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  // Two columns below 360pt: a third of 320 breaks "Chungking" mid-letter at large type.
  const COLUMNS = windowWidth < 360 ? 2 : 3;
  const ITEM_WIDTH = (windowWidth - 18 - 14 * COLUMNS) / COLUMNS;   // 9*2 page + 7*2 per cell
  const ITEM_HEIGHT = ITEM_WIDTH * 1.5;
  // From the safe area, floored and capped, in whole points (the veil meets the hem).
  const HEADER_HEIGHT = Math.round(insets.top + Math.min(320, Math.max(236, windowHeight * 0.38)));


  // ── React Query: MMKV-cached stack detail (instant revisits & offline fallback) ──
  const { data: stackQueryData, isLoading: stackQueryLoading, isError, refetch: rereadStack } = useQuery({
    queryKey: ['stack', id],
    queryFn: async () => {
      // Taken BEFORE the request: see tellMarkCounts.
      const askedAt = Date.now();
      try {
        const payload = await StackService.getStackFullPayload(id);
        // Not there, or sealed from this viewer: an answer, drawn as CLASSIFIED.
        if (!payload) return null;
        const { endorseCount, certified, ...stack } = payload;
        // The shared store, which the Reel's card reads too.
        tellMarks('list', [{ id, certify: endorseCount, certified }], askedAt);

        // Everything else, whole: a field copied by hand can be left behind.
        const listDetail: ListDetail = stack;
        return { list: listDetail, endorseCount };
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
   * A long title is SET SMALLER, as a catalogue sets one: three fixed steps
   * from the measured width (adjustsFontSizeToFit is unreliable multiline on
   * Android). The smallest holds the 100-character maximum on a 360dp screen.
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
  const [commentReportSheetVisible, setCommentReportSheetVisible] = useState(false);
  const [selectedComment, setSelectedComment] = useState<ListComment | null>(null);
  const [descExpanded, setDescExpanded] = useState(false);
  // The epigraph's line count, and WHICH text it was measured for: a refresh can
  // bring new words without a remount, and an old answer must not decide the fold.
  const [descLineCount, setDescLineCount] = useState(0);
  const [measuredFor, setMeasuredFor] = useState<string | null>(null);
  /** The cached payload's count, nudged in place: a second tally would double on a refetch. */
  const critiqueCount = stackQueryData?.list?.critiqueCount ?? null;
  // The critique sheet's chip: nothing for none or for unknown, `1.2K` past a thousand.
  const sheetCount = formatCount(critiqueCount ?? 0);

  const blockUser = useBlockStore(s => s.blockUser);
  const muteUser = useBlockStore(s => s.muteUser);

  const commentInputRef = useRef<TextInput>(null);

  // Callback isolation: stabilize comment input handler
  const handleCommentTextChange = useCallback((text: string) => {
    setCommentText(text);
  }, []);

  // Scroll animations
  const scrollY = useSharedValue(0);

  // The hero's parallax drift, and how far it has really risen (for its veil).
  const heroDrift = useDerivedValue(() => interpolate(scrollY.value, [-100, 0, HEADER_HEIGHT], [0, 0, HEADER_HEIGHT * 0.5]));
  const heroLifted = useDerivedValue(() => scrollY.value - heroDrift.value);

  const headerStyle = useAnimatedStyle(() => {
    return {
      height: HEADER_HEIGHT,
      transform: [
        { translateY: heroDrift.value },
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
      // debug, not warn (which reaches Sentry): one event for a real defect,
      // from captureError below, and none for going offline.
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

  // How many of the newest critiques the sheet reads: a page, and another each
  // time the member asks for earlier ones. A ref, so the query keeps its key.
  const critiqueLimit = useRef(STACK_COMMENT_PAGE);
  const [loadingEarlier, setLoadingEarlier] = useState(false);

  // ── COMMENTS (CQRS) ──
  // What the house holds. A failed read is a failed read: it drew the queued
  // critiques alone (or none, "No critiques yet") as though they were all.
  const { data: queryComments, isError: critiquesUnread, refetch: rereadCritiques } = useQuery({
    queryKey: ['stackComments', id],
    queryFn: async () => {
      try {
        return await StackService.getStackComments(id, critiqueLimit.current);
      } catch (error) {
        // Sentry gets genuine defects, never an offline failure.
        logger.debug('[Stack] Comments fetch failed:', error);
        addBreadcrumb('stacks.fetchComments failed', 'telemetry');
        if (!isNetworkError(error)) captureError(error, { scope: 'stacks.fetchComments', stackId: id });
        throw error;
      }
    },
    enabled: showComments && z.string().uuid().safeParse(id).success,
  });

  // And what this phone wrote that has not gone yet, from the queue itself, so
  // it shows whether or not the read worked. Each carries the id it will have
  // (made here, as on a log), so it is never drawn twice and can be taken back
  // while it waits.
  const queued = useOfflineQueueStore((st) => st.queued);
  const critiques = useMemo<Critique[]>(() => {
    // Taken back and waiting to say so: gone from the page already.
    const takenBack = new Set(queued.filter((m) => m.type === 'remove_list_comment').map((m) => m.payload.comment_id));
    const held: Critique[] = (queryComments ?? [])
      .filter((c) => !takenBack.has(c.id))
      .map((c) => ({ ...c, body: c.content }));
    const seen = new Set(held.map((c) => c.id));
    const waiting: Critique[] = queued
      .filter((m) => m.type === 'add_list_comment' && m.payload.list_id === id
        && typeof m.payload.id === 'string' && !seen.has(m.payload.id) && !takenBack.has(m.payload.id))
      .map((m) => ({
        id: m.payload.id as string,
        user_id: String(m.payload.user_id),
        // The queue is only ever this member's (it is emptied at sign-out).
        username: user?.username || 'anonymous',
        avatar_url: user?.avatar_url ?? null,
        body: String(m.payload.content),
        created_at: new Date(m.timestamp).toISOString(),
      }));
    return [...held, ...waiting];
  }, [queryComments, queued, id, user?.username, user?.avatar_url]);

  // A critique the queue has just delivered leaves the queue before the next
  // read brings it back: read again, or it would vanish in between.
  const waitingHere = queued.filter((m) => m.type === 'add_list_comment' && m.payload.list_id === id).length;
  const waitedBefore = useRef(waitingHere);
  useEffect(() => {
    if (waitingHere < waitedBefore.current) void queryClient.invalidateQueries({ queryKey: ['stackComments', id] });
    waitedBefore.current = waitingHere;
  }, [waitingHere, queryClient, id]);

  const nothingRead = critiquesUnread && !queryComments;

  // Earlier critiques the house holds beyond the sheet's page. Offered only when
  // the page came back full, so a count still settling never offers an empty ask.
  const earlier = queryComments && queryComments.length >= critiqueLimit.current && critiqueCount != null
    ? Math.max(0, critiqueCount - queryComments.length) : 0;
  const loadEarlierCritiques = useCallback(() => {
    critiqueLimit.current += STACK_COMMENT_PAGE;
    setLoadingEarlier(true);
    void rereadCritiques().finally(() => setLoadingEarlier(false));
  }, [rereadCritiques]);

  /** A critique's REPORT: the report sheet, which can also block its author. */
  const handleReportCritique = useCallback((c: Critique) => {
    const comment = (queryComments ?? []).find((x) => x.id === c.id);
    if (!comment) return;
    setSelectedComment(comment);
    setCommentReportSheetVisible(true);
  }, [queryComments]);

  const handleToggleComments = useCallback(() => {
    TactileEngine.selection();
    // Focus only on the way IN: never a keyboard for a sheet that is closing.
    setShowComments((prev) => {
      if (!prev) setTimeout(() => commentInputRef.current?.focus(), 120);
      return !prev;
    });
  }, []);

  // Android's back closes the critiques: an overlay (not a Modal, so the
  // moderation sheet over it never nests) gets no back button for free.
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
    // The id it will have in the house, made here as a log's critique's is: the
    // same row whether it is sent now or from the queue, and a replay after a
    // lost answer cannot file it twice.
    const commentId = Crypto.randomUUID();

    // Optimistic Update — with the member's own face, never a ghost.
    const optimisticComment: ListComment = {
      id: commentId,
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
        id: commentId,
        user_id: user.id,
        list_id: id,
        content: content
      });

      // The house's copy, with its cleaned words and joined profile.
      queryClient.setQueryData(['stackComments', id], (old: ListComment[] | undefined) => {
        if (!old) return [newComment];
        return old.map(c => c.id === commentId ? newComment : c);
      });
      // Filed, where members may certify or answer it: the moment to ask to send word.
      void offerWord('critique', user.id);

    } catch (err: unknown) {
      if (isNetworkError(err)) {
        enqueueMutation({
          type: 'add_list_comment',
          payload: { id: commentId, list_id: id, user_id: user.id, content }
        });
        flushOfflineQueue();
        // Leave the optimistic comment in cache since it's queued
        reelToast('Critique saved offline. Will sync when connected.');
      } else {
        // Atomic Rollback
        queryClient.setQueryData(['stackComments', id], (old: ListComment[] | undefined) => {
          if (!old) return [];
          return old.filter(c => c.id !== commentId);
        });
        bumpCritiqueCount(-1);
        setCommentText(content);
        // As on a log: a stack whose maker limits who may annotate it says so.
        reelToast.error(isForbiddenError(err) ? 'This member limits who may annotate their critiques.' : 'Your critique could not be filed.');
      }
    } finally {
      setSubmittingComment(false);
    }
  }, [commentText, submittingComment, user, id, queryClient, bumpCritiqueCount]);

  /**
   * Take back one's own critique, once the member has said yes (CritiqueRow
   * asks) — as on a log's page.
   */
  const handleDeleteComment = useCallback(async (commentId: string) => {
    if (!user) return;
    TactileEngine.destroy();
    const target = queryClient.getQueryData<ListComment[]>(['stackComments', id])?.find((c) => c.id === commentId);
    queryClient.setQueryData(['stackComments', id], (old: ListComment[] | undefined) =>
      (old ?? []).filter((c) => c.id !== commentId));
    bumpCritiqueCount(-1);
    // Not sent yet: the house has no row to delete, so the removal waits in the
    // queue behind its filing, and the two go out in that order.
    if (stillQueued('add_list_comment', commentId)) {
      enqueueMutation({ type: 'remove_list_comment', payload: { comment_id: commentId, user_id: user.id } });
      flushOfflineQueue();
      reelToast('Removed offline. Will sync when connected.');
      return;
    }
    try {
      await StackService.deleteStackComment(commentId, user.id);
    } catch (err: unknown) {
      if (isNetworkError(err)) {
        enqueueMutation({ type: 'remove_list_comment', payload: { comment_id: commentId, user_id: user.id } });
        flushOfflineQueue();
        reelToast('Removed offline. Will sync when connected.');
        return;
      }
      captureError(err, { scope: 'stacks.deleteComment', stackId: id });
      // Refused: it is back where it was, and said so.
      if (target) {
        queryClient.setQueryData(['stackComments', id], (old: ListComment[] | undefined) =>
          [...(old ?? []), target].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()));
      }
      bumpCritiqueCount(+1);
      reelToast.error('Your critique could not be removed.');
    }
  }, [user, id, queryClient, bumpCritiqueCount]);

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
              nav.back();
             
            } catch (err: unknown) {
              logger.debug('[Stack] Delete failed:', err);
              addBreadcrumb('stacks.deleteStack failed', 'telemetry');
              if (!isNetworkError(err)) captureError(err, { scope: 'stacks.deleteStack', stackId: id });
              reelToast.error('The collection resists destruction.');
            }
          },
        },
      ]
    );
  }, [id, deleteList, queryClient]);

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
        <RoomLight room="default" />
        <StackNav topInset={insets.top} onBack={() => nav.back()} />
        <View style={s.loadingCenter}>
          <BusterEyes label="Loading stack" />
        </View>
      </View>
    );
  }

  // Could not be reached, and nothing of it held here: said as that, with TRY
  // AGAIN. It used to be CLASSIFIED — "sealed or incinerated" — of a stack
  // that was simply out of reach.
  if (isError && !list) {
    return (
      <View style={s.container}>
        <RoomLight room="default" />
        <StackNav topInset={insets.top} onBack={() => nav.back()} />
        <View style={s.loadingCenter}>
          <EmptyOffline onRetry={() => { void rereadStack(); }} />
        </View>
      </View>
    );
  }

  // CLASSIFIED: no such stack, or a private one reached by direct link by
  // anyone but its curator (defense-in-depth beside the RLS gate).
  if (!list || (list.isPrivate && !isOwner)) {
    return (
      <View style={s.container}>
        <RoomLight room="default" />
        <StackNav topInset={insets.top} onBack={() => nav.back()} />
        <View style={s.loadingCenter}>
          <Buster size={80} mood="suspicious" style={s.classifiedBuster} />
          <Text style={s.title}>CLASSIFIED</Text>
          <Text style={[s.desc, { textAlign: 'center', marginTop: 12 }]}>This stack could not be retrieved.{'\n'}It may be sealed or incinerated.</Text>
        </View>
      </View>
    );
  }

  const estDate = list.createdAt && !isNaN(Date.parse(list.createdAt)) ? formatDateMonthYear(list.createdAt) : null;
  // Measured lines, never a character count: only the text knows how it wraps.
  const descNeedsFold = measuredFor === list.description && descLineCount > DESC_CLAMP_LINES;



  // The first film that HAS artwork: one missing poster never flattens the hero.
  const heroPoster = (() => {
    const withArt = list.films.find(f => !!f.poster_path);
    return withArt ? tmdb.poster(withArt.poster_path!, 'w780') : null;
  })();

  return (
    <Animated.View style={[s.container, animatedContainerStyle]}>
      {/* The room's light hangs from where the hero ends, and blooms from it. */}
      <RoomLight room="default" hem={heroPoster ? HEADER_HEIGHT : undefined} art={heroPoster} />
      {/* Absolute Dynamic Nav Bar */}
      <StackNav topInset={insets.top} onBack={() => nav.back()} blurStyle={navBlurStyle}>
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
        numColumns={COLUMNS}
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
              {/* No picture, no veil: there is nothing to fade, and a veil
                  over nothing is a dark block hiding the room's light. */}
              {heroPoster ? (
                <>
                  <Image source={heroPoster} style={StyleSheet.absoluteFillObject} contentFit="cover" blurRadius={20} cachePolicy="memory-disk" />
                  <RoomVeil room="default" hem={HEADER_HEIGHT} art={heroPoster} stops={HERO_VEIL} lifted={heroLifted} />
                </>
              ) : null}
            </Animated.View>

            {/* Content Overlaid on Header */}
            <View style={[s.headerContentWrap, { marginTop: HEADER_HEIGHT - 120 }]}>
              {/* No eyebrow: a catalogue does not print its category above its title. */}
              <AnimatedText
                entering={FadeInDown.duration(600).delay(100).reduceMotion(ReduceMotion.System)}
                style={[s.title, { fontSize: titleType.fontSize, lineHeight: titleType.lineHeight }]}
                numberOfLines={titleType.numberOfLines}
              >
                {list.title.toUpperCase()}
              </AnimatedText>

              {/* The colophon: ONE line of type (curator, count, date), so it
                  wraps as prose and no line begins with a separator; the chips
                  are objects, so they wrap below as their own elements. */}
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

              {/* The honour stays: the day this stack hung in the Lobby, if it did. */}
              <LobbyHonour kind="list" id={id} style={s.lobbyHonour} />

              {list.description ? (
                <Animated.View entering={FadeInDown.duration(600).delay(300).reduceMotion(ReduceMotion.System)} style={s.descWrap}>
                  {/* THE MEASURER: an unclamped copy (a clamped Text reports the
                      clamp), invisible, out of flow, unspoken, at the same width,
                      and unmounted once it has answered. */}
                  {measuredFor !== list.description && (
                    <Text
                      style={[s.desc, s.descMeasure]}
                      onTextLayout={e => {
                        setDescLineCount(e.nativeEvent.lines.length);
                        setMeasuredFor(list.description);
                      }}
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
                {/* The house's one bar anatomy (MarkFigure): icon over word, the
                    count beside the icon, the log bar's icons for the same acts. */}
                <PressableScale style={s.actionItem} onPress={handleCertify} hitSlop={null} haptic="selection" accessibilityRole="button" accessibilityState={{ selected: isCertified }} accessibilityLabel={certifyLabel(certifyCount, isCertified, 'this stack')}>
                  <MarkFigure iconSize={15} count={certifyCount} style={[s.actionLabel, isCertified && s.actionLabelActive]}>
                    <Heart size={15} strokeWidth={2} color={isCertified ? colors.crimson : colors.fog} fill={isCertified ? colors.crimson : 'transparent'} />
                  </MarkFigure>
                  <Text style={[s.actionLabel, isCertified && s.actionLabelActive]} pointerEvents="none" {...deckLabelProps}>
                    {isCertified ? 'CERTIFIED' : 'CERTIFY'}
                  </Text>
                </PressableScale>

                <View style={s.actionDivider} />

                {/* The count is null when the server could not be asked — the
                    bar then draws no number rather than a confident 0, since
                    "none" and "we could not count" are different statements. */}
                <PressableScale style={s.actionItem} onPress={handleToggleComments} hitSlop={null} haptic="selection" accessibilityRole="button" accessibilityState={{ expanded: showComments }} accessibilityLabel={critiqueLabel(critiqueCount, 'Critiques')}>
                  <MarkFigure iconSize={16} count={critiqueCount} style={[s.actionLabel, showComments && s.actionLabelOpen]}>
                    <MessageSquare size={16} strokeWidth={2} color={showComments ? colors.sepia : colors.fog} />
                  </MarkFigure>
                  <Text style={[s.actionLabel, showComments && s.actionLabelOpen]} pointerEvents="none" {...deckLabelProps}>
                    CRITIQUE
                  </Text>
                </PressableScale>

                <View style={s.actionDivider} />

                <PressableScale style={s.actionItem} onPress={handleOpenShareLounge} hitSlop={null} haptic="selection" accessibilityRole="button" accessibilityLabel="Share to lounge">
                  <MessageCircle size={15} strokeWidth={2} color={colors.fog} />
                  <Text style={s.actionLabel} pointerEvents="none" {...deckLabelProps}>LOUNGE</Text>
                </PressableScale>
              </Animated.View>

              {/* The critiques open in an overlay, never between here and the films. */}
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

      {/* ══ THE CRITIQUES ══ an overlay, NOT a Modal: the moderation sheet a
          long-press opens IS one, and a Modal over a Modal is the iOS trap. It
          sits below the chrome; the dimmed strip above it closes it. */}
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
              {/* No chip for none, and the house's one number format. */}
              {sheetCount ? (
                <View style={s.critiqueCountChip}><Text style={s.critiqueCountText}>{sheetCount}</Text></View>
              ) : null}
              <PressableScale style={s.critiqueClose} onPress={handleToggleComments} hitSlop={null} haptic="selection" accessibilityRole="button" accessibilityLabel="Close critiques">
                <X size={16} color={colors.fog} />
              </PressableScale>
            </View>

            <ScrollView style={s.critiqueBody} contentContainerStyle={s.critiqueBodyContent} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
              {/* Nothing could be read: what is below is only what this phone
                  wrote and has not sent, if anything. (A later read that fails
                  keeps what was read, and says nothing.) */}
              {nothingRead ? (
                <View style={s.critiquesUnread}>
                  <Text style={s.commentEmpty}>The critiques could not be reached.</Text>
                  <TryAgainLine onPress={() => { void rereadCritiques(); }} accessibilityLabel="Read the critiques again" />
                </View>
              ) : null}
              {/* The oldest are at the top, so the earlier ones are asked for there. */}
              {earlier > 0 ? (
                <PressableScale
                  style={s.critiqueEarlier}
                  onPress={loadEarlierCritiques}
                  disabled={loadingEarlier}
                  hitSlop={null}
                  haptic="selection"
                  accessibilityRole="button"
                  accessibilityLabel={loadingEarlier ? 'Reading earlier critiques' : `Load ${earlier} earlier critiques`}
                >
                  <Text style={s.critiqueEarlierText}>{loadingEarlier ? 'READING EARLIER CRITIQUES…' : `LOAD EARLIER · ${formatCount(earlier)} MORE`}</Text>
                </PressableScale>
              ) : null}
              {critiques.length === 0 ? (
                nothingRead ? null : <Text style={s.commentEmpty}>No critiques yet. Be the first to speak.</Text>
              ) : (
                critiques.map(c => (
                  <CritiqueRow
                    key={c.id}
                    c={c}
                    currentUserId={user?.id}
                    onPressUser={handlePressProfile}
                    onWithdraw={handleDeleteComment}
                    // A member's report; a reader not signed in has no report to file.
                    onReport={user ? handleReportCritique : undefined}
                  />
                ))
              )}
            </ScrollView>

            {user && (
              <View style={[s.critiqueFoot, { paddingBottom: Platform.OS === 'ios' ? 16 : Math.max(insets.bottom, 16) }]}>
                <TextInput
                  ref={commentInputRef}
                  style={s.critiqueField}
                  placeholder="File a critique..."
                  placeholderTextColor={colors.fog}
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

      {/* ── MODERATION: every act closes the sheet, as every sheet in the app does ── */}
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

      {/* A critique's REPORT: the report sheet, which can also block its author. */}
      {selectedComment && (
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
      )}
    </Animated.View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.ink },
  navBar: { position: 'absolute', top: 0, left: 0, right: 0, zIndex: 100 },
  // Overhangs the bar so the gradient has room to reach zero past the chrome.
  navScrim: { position: 'absolute', top: 0, left: 0, right: 0 },
  navInner: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16 },
  // 48 by geometry (a halo is invisible to accessibility), glyph hard left.
  backBtn: { width: 48, height: 48, marginLeft: -14, alignItems: 'flex-start', justifyContent: 'center' },
  headerActions: { flexDirection: 'row', gap: 12 },
  actionBtn: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center' },
  moreBtn: { width: 48, height: 48, alignItems: 'flex-end', justifyContent: 'center', marginRight: -10 },

  // ONE left edge: 9 here + 7 on each cell = 16 (and a 14 gutter); the hero
  // wrap's 7 puts the title on it too. These three numbers move together.
  scrollContent: { paddingBottom: 60, paddingHorizontal: 9 },
  parallaxHeader: { position: 'absolute', top: 0, left: 0, right: 0 },
  headerContentWrap: { paddingHorizontal: 7, paddingBottom: 24 },
  title: { fontFamily: fonts.display, fontSize: 36, color: colors.parchment, lineHeight: 40, textShadowColor: 'rgba(0,0,0,0.8)', textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 6 },
  // Wraps only to let the chips fall below the one line of type.
  metaRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', columnGap: 7, rowGap: 6, marginTop: 16, marginBottom: 16 },
  /** "✦ FEATURED IN THE LOBBY · 30 SEPTEMBER", under the colophon. */
  lobbyHonour: { marginTop: -6, marginBottom: 16 },
  metaDiamond: { width: 5, height: 5, backgroundColor: colors.sepia, transform: [{ rotate: '45deg' }] },
  metaCurator: { fontFamily: fonts.sub, fontSize: 10, letterSpacing: 1.5, color: colors.parchment, textDecorationLine: 'underline', textDecorationColor: colors.sepiaBorder },
  metaText: { flexShrink: 1, fontFamily: fonts.sub, fontSize: 10, lineHeight: 16, letterSpacing: 1.5, color: colors.fog },
  metaSep: { color: colors.sepia },
  metaChip: { flexDirection: 'row', alignItems: 'center', gap: 3, borderWidth: 1, borderColor: 'rgba(184,137,26,0.4)', borderRadius: 3, paddingHorizontal: 6, paddingVertical: 2 },
  metaChipText: { fontFamily: fonts.sub, fontSize: 9, letterSpacing: 0.9, color: colors.sepia, includeFontPadding: false },
  // The epigraph — prose wears Courier italic, folded past four lines.
  descWrap: { marginBottom: 24 },
  desc: { fontFamily: fonts.body, fontStyle: 'italic', fontSize: 13, color: colors.bone, lineHeight: 21 },
  descToggle: { fontFamily: fonts.sub, fontSize: 10, letterSpacing: 1.6, color: colors.sepia, marginTop: 8 },
  // The epigraph's width and none of its height, invisible.
  descMeasure: { position: 'absolute', left: 0, right: 0, top: 0, opacity: 0 },
  
  // ── Action Bar ──
  actionBar: {
    flexDirection: 'row', alignItems: 'center',
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: 'rgba(184,137,26,0.25)',
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: 'rgba(184,137,26,0.25)',
    marginBottom: 16,
  },
  // Each item IS the 48pt target, icon over word, as every bar in the house.
  actionItem: { flex: 1, minHeight: 48, paddingVertical: 10, alignItems: 'center', justifyContent: 'center', gap: 5 },
  actionLabel: { fontFamily: fonts.sub, fontSize: 10, letterSpacing: 1.2, color: colors.fog, includeFontPadding: false },
  actionDivider: { width: 1, height: 16, backgroundColor: 'rgba(184,137,26,0.2)' },

  // ── Critiques Panel ──
  commentEmpty: { fontFamily: fonts.body, fontStyle: 'italic', fontSize: 12, color: colors.fogQuiet, textAlign: 'center', paddingVertical: 8 },
  critiqueEarlier: { alignSelf: 'center', minHeight: 48, justifyContent: 'center', paddingHorizontal: 16 },
  critiqueEarlierText: { fontFamily: fonts.sub, fontSize: 10, letterSpacing: 2, color: colors.sepia, includeFontPadding: false },
  critiquesUnread: { alignItems: 'center', gap: 4 },

  trackRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 12, marginBottom: 20 },
  trackLabel: { fontFamily: fonts.sub, fontSize: 10, letterSpacing: 2, color: colors.sepia },
  trackLine: { flex: 1, height: 1 },
  
  // One gutter both ways (14); the row gap on the item, so FlashList measures it.
  filmItem: { marginBottom: 14, marginHorizontal: 7 },
  filmCard: { ...EDGE_LIT, borderRadius: 2, overflow: 'hidden', backgroundColor: colors.soot, borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.1)' },
  // The podium frame — only #1 of a ranked stack earns the brass hairline.
  filmCardFirst: { borderWidth: 1, borderColor: 'rgba(184,137,26,0.45)' },
  posterPlaceholder: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 8 },
  placeholderMark: { fontFamily: fonts.sub, fontSize: 15, color: colors.ash, includeFontPadding: false },
  loggedBadge: { position: 'absolute', top: 4, right: 4, width: 22, height: 22, borderRadius: 11, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(13,11,9,0.75)', borderWidth: 1, borderColor: 'rgba(184,137,26,0.5)' },
  /** Its two-line height is reserved on the card (`titleBox`), at the phone's text size. */
  filmTitle: {
    fontFamily: fonts.sub, fontSize: 11, lineHeight: FILM_TITLE_LINE,
    color: colors.fog, marginTop: 8, textAlign: 'center', paddingHorizontal: 2,
  },
  // The rank in the catalogue line, never over the poster.
  filmCaptionRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'center', gap: 5, marginTop: 8 },
  filmRank: { fontFamily: fonts.sub, fontSize: 10, letterSpacing: 1, color: colors.sepia, includeFontPadding: false },
  filmRankFirst: { color: colors.flicker },
  filmTitleInline: { flexShrink: 1, fontFamily: fonts.sub, fontSize: 11, lineHeight: FILM_TITLE_LINE, color: colors.fog, textAlign: 'center' },
  
  /* ── THE CRITIQUES ── an overlay, so the index behind it never moves ── */
  // The strip above the sheet: dimmed, and a tap on it closes the sheet.
  critiqueBackdrop: { position: 'absolute', top: 0, left: 0, right: 0, backgroundColor: 'rgba(6,5,4,0.72)' },
  critiqueSheet: { ...EDGE_LIT,
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
  critiqueCountText: { fontFamily: fonts.sub, fontSize: 10, letterSpacing: 0.8, color: colors.fog, includeFontPadding: false },
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
    backgroundColor: colors.well, borderWidth: 1, borderColor: 'rgba(184,137,26,0.2)',
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
  classifiedBuster: { marginBottom: 12 },
  actionLabelActive: { color: colors.crimsonInk },
  actionLabelOpen: { color: colors.sepia },
  sendBtnDisabled: { opacity: 0.3 },
});


StackDetailFilmCard.displayName = 'StackDetailFilmCard';


// Expo Router per-route crash net — see src/components/RouteErrorBoundary.tsx
export { RouteErrorBoundary as ErrorBoundary } from '@/src/components/RouteErrorBoundary';
