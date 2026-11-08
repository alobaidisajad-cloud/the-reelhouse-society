 
import { useShallow } from 'zustand/react/shallow';
import { houseIso } from '@/src/lib/houseClock';
import { useAuthStore } from '@/src/stores/auth';
import { useBlockStore } from '@/src/stores/blockStore';
import { useFilmStore, useInteractionStore } from '@/src/stores/films';
import { beginTap, queueTap, settleTap, useMarkCount, withdrawTap } from '@/src/stores/markCounts';
import { tellMarks } from '@/src/stores/tellMarks';
import { markCount, mineMark, type FeedItem } from '@/src/schemas/feed.schema';
import { useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import * as Crypto from 'expo-crypto';
import TactileEngine from '@/src/utils/TactileEngine';
import { P, useRouteParams } from '@/src/utils/routeParams';
import { NotInTheArchive } from '@/src/components/NotInTheArchive';
import * as Sharing from 'expo-sharing';
import React, { useCallback, useMemo, useRef, useState } from 'react';
import { Platform, RefreshControl, Share, StyleSheet, View } from 'react-native';
import { Text, TextInput } from '@/src/components/text';
import Animated, { Extrapolation, interpolate, useAnimatedKeyboard, useAnimatedStyle, useSharedValue } from 'react-native-reanimated';
import {
  useBottomEdge, useContentBottom, usePushedHeaderTop, useColumnWidth } from '@/src/components/layout/navMetrics';
 
import { s } from '@/src/components/log/logDetailStyles';
import { PAGE } from '@/src/components/log/pageMetrics';
import { Breakdown } from '@/src/components/feed/frame/Breakdown';
import { hasRatedAutopsy } from '@/src/components/feed/frame/scores';
import { useTextScale } from '@/src/hooks/useTextScale';
import { lineWidth } from '@/src/components/lobby/measure';
import { hasPhysicalFormat } from '@/src/components/log/logRecord';
import LogShareCard from '@/src/components/film/LogShareCard';
import { CinematicScrollView } from '@/src/components/layout/CinematicScrollView';
import LogActionDeck from '@/src/components/log/LogActionDeck';
import LogChronicle from '@/src/components/log/LogChronicle';
import LogComments from '@/src/components/log/LogComments';
import LogHero, { projectionHeight } from '@/src/components/log/LogHero';
import LogReviewBody from '@/src/components/log/LogReviewBody';
import NoteSheet from '@/src/components/log/NoteSheet';
import { useVault } from '@/src/hooks/useVault';
import { useClearance } from '@/src/hooks/useClearance';
import { ropeSpoken } from '@/src/components/clearance/Clearance';
import { useLater } from '@/src/hooks/useLater';
import { useKeptWords } from '@/src/hooks/useKeptWords';
import { ContentActionSheet } from '@/src/components/moderation/ContentActionSheet';
import ReportSheet from '@/src/components/moderation/ReportSheet';
import PressableScale from '@/src/components/PressableScale';
import ShareToLoungeModal from '@/src/components/ShareToLoungeModal';
import { tmdb } from '@/src/lib/tmdb';
import { COMMENT_PAGE_SIZE, LogService } from '@/src/services/LogService';
import { colors } from '@/src/theme/theme';
import { isNetworkError, isForbiddenError } from '@/src/utils/networkError';
import { enqueueMutation, flushOfflineQueue, getOfflineQueue } from '@/src/utils/offlineQueue';
import { stillQueued } from '@/src/stores/offlineQueueStore';
import reelToast from '@/src/utils/reelToast';
import { isArchivistPlusTier, isAuteurPlusTier, resolveTier } from '@/src/utils/tier';
import { rankOf } from '@/src/components/RankBadge';
import { useTimeAgo } from '@/src/hooks/useClock';
import { ChevronLeft, MoreHorizontal, Share2 } from 'lucide-react-native';
import { captureRef } from 'react-native-view-shot';
import { z } from 'zod';
import { RoomLight } from '@/src/components/atmosphere/RoomLight';
import { nav } from '@/src/utils/typedRouter';
import { EmptyOffline, EmptyState, REFRESH_FAILED } from '@/src/components/EmptyStates';
import { BusterEyes } from '@/src/components/Buster';
import { useScreenReady } from '@/src/hooks/useScreenReady';
import { LobbyHonour } from '@/src/components/lobby/LobbyHonour';
import { offerWord } from '@/src/lib/pushPrimer';
import { dateOf } from '@/src/utils/instant';

/**
 * The bar's title, planned from the words' own widths (never grown: allowFontScaling false). Its
 * gutters are the right cluster's width, SHARE and the ··· slot, on both sides; it takes the widest
 * letter spacing that fits between them, and stands aside on a window too narrow for any.
 */
const BAR_TITLE = (() => {
  const share = Math.max(48, Math.ceil(14 + 6 + lineWidth('SHARE', 'elite', 10, 1, 2.4) + 12));
  const gutter = 6 + share + 48;
  const spacing = (window: number) =>
    [3, 2, 1.5, 1].find((ls) => lineWidth('PERMANENT RECORD', 'elite', 10, 1, ls) <= window - gutter * 2) ?? null;
  return { share, gutter, spacing };
})();

/** How long a share waits for its card's pictures before it fails and says so. */
const SHARE_CARD_WAIT_MS = 20_000;

interface LogDetail {
  id: string;
  film_id: number;
  film_title: string;
  poster_path: string | null;
  year?: number | null;
  rating: number;
  review?: string | null;
  pull_quote?: string | null;
  drop_cap?: boolean;
  alt_poster?: string | null;
  status: string;
  is_spoiler: boolean;
  watched_date?: string | null;
  watched_with?: string | null;
  physical_media?: string | null;
  abandoned_reason?: string | null;
  is_autopsied?: boolean;
  autopsy?: {
    story?: number;
    screenplay?: number;
    script?: number;
    acting?: number;
    direction?: number;
    cinematography?: number;
    editing?: number;
    pacing?: number;
    sound?: number;
  } | null;
  user_id: string;
  created_at: string;
  editorial_header?: string | null;
  viewing_history?: unknown;
  /** The viewing this log is on. A private note belongs to one of these. */
  viewing_id?: string | null;
}

interface LogProfile {
  id: string;
  username: string;
  display_name?: string | null;
  avatar_url?: string | null;
  role?: string;
  member_no?: number | null;
}

interface LogComment {
  id: string;
  user_id: string;
  username: string;
  avatar_url?: string | null;
  body: string;
  created_at: string;
}

/** What the page holds of a record: the record, its member, a page of critiques and the marks. */
interface LogRead {
  log: LogDetail | null;
  profile: LogProfile | null;
  comments: LogComment[];
  commentTotal: number;
  certifyCount: number | null;
  certifiedKnown: boolean;
  critiquesUnread: boolean;
  /** Drawn from the card the page was opened from: its critiques are still to come, never none. */
  seeded?: boolean;
}

/**
 * The record as the card it was opened from already holds it (a feed's row), so the page
 * draws it in its first frame with no wait on the network (P4.53). The critiques are not on a
 * card: until the house answers, the page reads them as still to come.
 */
function seedFromCards(queryClient: QueryClient, id: string): LogRead | undefined {
  for (const [, data] of queryClient.getQueriesData<{ pages?: unknown[] }>({ queryKey: ['feed'] })) {
    for (const page of data?.pages ?? []) {
      if (!Array.isArray(page)) continue;
      const row = (page as Partial<FeedItem>[]).find((r) => r?.id === id && typeof r.film_title === 'string');
      if (!row || row.film_id == null || !row.created_at) continue;
      return {
        log: {
          id, film_id: row.film_id, film_title: row.film_title ?? '', poster_path: row.poster_path ?? null, year: row.year ?? null,
          rating: row.rating ?? 0, review: row.review ?? null, pull_quote: row.pull_quote ?? null, drop_cap: row.drop_cap ?? undefined,
          alt_poster: row.alt_poster ?? null, status: row.status ?? 'watched', is_spoiler: !!row.is_spoiler,
          watched_with: row.watched_with ?? null, physical_media: row.physical_media ?? null, abandoned_reason: row.abandoned_reason ?? null,
          is_autopsied: !!row.is_autopsied, autopsy: (row.autopsy ?? null) as LogDetail['autopsy'],
          user_id: row.user_id ?? '', created_at: row.created_at, editorial_header: row.editorial_header ?? null,
        },
        profile: { id: row.user_id ?? '', username: row.username ?? '', avatar_url: row.avatar_url ?? null, role: row.role },
        comments: [],
        commentTotal: row.critique_count ?? 0,
        certifyCount: row.certify_count ?? null,
        certifiedKnown: typeof row.certified === 'boolean',
        critiquesUnread: false,
        seeded: true,
      };
    }
  }
  return undefined;
}

const PARAMS = { id: P.uuid };

/** The route: a link of another shape is a page not in the archive (routeParams, P4.4). */
export default function LogDetailScreenRoute() {
  const { id } = useRouteParams(PARAMS);
  return id ? <LogDetailScreen id={id} /> : <NotInTheArchive />;
}

function LogDetailScreen({ id }: { id: string }) {
  const { user, isAuthenticated } = useAuthStore(useShallow((s) => ({ user: s.user, isAuthenticated: s.isAuthenticated })));
  const windowWidth = useColumnWidth();
  const blockUser = useBlockStore((state) => state.blockUser);
  const muteUser = useBlockStore((state) => state.muteUser);
  const edge = useBottomEdge();
  const end = useContentBottom();
  const headerTop = usePushedHeaderTop();

  const queryClient = useQueryClient();

  // How many of the newest critiques to read: one page, and another each time
  // the member asks for earlier ones. A ref, so the query keeps its one key.
  const critiqueLimit = useRef(COMMENT_PAGE_SIZE);
  const [loadingOlder, setLoadingOlder] = useState(false);

  // ── React Query: MMKV-cached log detail (instant revisits) ──
  const { data: logQueryData, isLoading: logQueryLoading, isError: logQueryFailed, refetch: rereadLog } = useQuery<LogRead>({
    queryKey: ['log', id],
    placeholderData: () => seedFromCards(queryClient, id),
    queryFn: async ({ signal }): Promise<LogRead> => {
      // Taken BEFORE the requests: see tellMarkCounts.
      const askedAt = Date.now();
      try {
        // The record and one page of its critiques (newest kept, plus the TRUE total the header
        // prints, never this page's length) asked together: the critiques need only the id, and
        // asked after the record they cost the page a round trip of its own.
        const [logData, { comments: commData, total: commentTotal }] = await Promise.all([
          LogService.getLogDetails(id, signal),
          LogService.getLogComments(id, signal, critiqueLimit.current),
        ]);

        const profile = logData ? (Array.isArray(logData.profiles) ? logData.profiles[0] : logData.profiles) : null;

        const mappedComments = (commData || []).map((c: Record<string, any>) => ({
          id: c.id,
          body: c.body,
          created_at: c.created_at,
          user_id: c.user_id,
          // '' when the author's name could not be read: drawn as "a member", never linked.
          username: (Array.isArray(c.profiles) ? (c.profiles[0] as any)?.username : (c.profiles as any)?.username) || '',
          avatar_url: (Array.isArray(c.profiles) ? (c.profiles[0] as any)?.avatar_url : (c.profiles as any)?.avatar_url) || null,
        }));

        const queue = getOfflineQueue();
        const pendingAdds = queue.filter(q => q.type === 'add_log_comment' && q.payload.log_id === id);
        const pendingRemoves = new Set(queue.filter(q => q.type === 'remove_log_comment').map(q => q.payload.comment_id as string));

        const finalCommentsMap = new Map<string, any>();

        pendingAdds.forEach(q => {
           finalCommentsMap.set(q.payload.id as string, {
               id: q.payload.id as string,
               user_id: q.payload.user_id as string,
               username: useAuthStore.getState().user?.username || 'anonymous',
               avatar_url: useAuthStore.getState().user?.avatar_url || null,
               body: q.payload.body as string,
               created_at: new Date(q.timestamp).toISOString(),
           });
        });

        mappedComments.forEach((c: any) => {
           if (!pendingRemoves.has(c.id)) {
               finalCommentsMap.set(c.id, c);
           }
        });

        pendingRemoves.forEach(id => {
            finalCommentsMap.delete(id);
        });

        const finalComments = Array.from(finalCommentsMap.values()).sort((a, b) => dateOf(a.created_at).getTime() - dateOf(b.created_at).getTime());

        // The total counts what the SERVER holds, plus anything queued offline
        // that is not in it yet — mirroring the dossier screen.
        const pendingNotYetCounted = finalComments.length - mappedComments.length;
        const total = Math.max(commentTotal + pendingNotYetCounted, finalComments.length);
        // The bar's two numbers, told to the store every card reads — so the
        // Reel's card for this log shows what this page shows the moment the
        // member goes back. Null when the log came from the offline queue.
        const certifyCount = markCount.parse(logData?.certify_count);
        // The SERVER's critique total, not this page's: the page adds what is
        // still waiting in the offline queue, and those are already held as
        // queued taps in the store — telling it `total` would count them twice.
        // With the viewer's own mark, from the same request: the heart is the
        // server's answer, not the sign-in index's newest 500.
        const certified = mineMark.parse(logData?.certified);
        tellMarks('log', [{ id, certify: certifyCount, critique: commentTotal, certified }], askedAt);
        return {
          log: logData as LogDetail | null,
          profile: profile as LogProfile | null,
          comments: finalComments as LogComment[],
          commentTotal: total,
          certifyCount,
          // Whether the member's own certification was answered: the heart is known only then.
          certifiedKnown: typeof certified === 'boolean',
          critiquesUnread: false,
        };
      } catch (err: unknown) {
        const cachedData = queryClient.getQueryData(['log', id]);
        if (cachedData) throw err;

        const localLogs = useFilmStore.getState().logs;
        const localLog = localLogs.find((l: any) => l.id === id);
        
        if (localLog) {
          const mappedLocalLog: LogDetail = {
            id: localLog.id,
            film_id: localLog.filmId,
            film_title: localLog.title || '',
            poster_path: localLog.poster || null,
            year: localLog.year,
            rating: localLog.rating || 0,
            review: localLog.review,
            status: localLog.status || 'watched',
            is_spoiler: localLog.isSpoiler || false,
            watched_date: localLog.watchedDate,
            watched_with: localLog.watchedWith,
            // The composer's 'None' sentinel is no format, here as on the
            // server's copy: one answer, never FORMAT: NONE.
            physical_media: hasPhysicalFormat(localLog.physicalMedia) ? localLog.physicalMedia : null,
            abandoned_reason: localLog.abandonedReason,
            is_autopsied: localLog.isAutopsied,
            autopsy: (() => {
               if (!localLog.autopsy) return null;
               if (typeof localLog.autopsy === 'object') return localLog.autopsy;
               try { return JSON.parse(localLog.autopsy); } catch { return null; }
            })(),
            alt_poster: localLog.altPoster,
            editorial_header: localLog.editorialHeader,
            drop_cap: localLog.dropCap,
            pull_quote: localLog.pullQuote,
            user_id: useAuthStore.getState().user?.id || '',
            created_at: localLog.createdAt || houseIso(),
            viewing_history: localLog.viewingHistory,
            viewing_id: localLog.viewingId ?? null,
          };
          const queue = getOfflineQueue();
          const pendingAdds = queue.filter(q => q.type === 'add_log_comment' && q.payload.log_id === id);
          const finalComments = pendingAdds.map(q => ({
             id: q.payload.id as string,
             user_id: q.payload.user_id as string,
             username: useAuthStore.getState().user?.username || 'anonymous',
             avatar_url: useAuthStore.getState().user?.avatar_url || null,
             body: q.payload.body as string,
             created_at: new Date(q.timestamp).toISOString(),
          }));

          return {
            log: mappedLocalLog,
            profile: {
              id: useAuthStore.getState().user?.id || '',
              username: useAuthStore.getState().user?.username || 'unknown',
              role: resolveTier(useAuthStore.getState().user)
            },
            comments: finalComments,
            // Only the queued ones: what anyone else wrote could not be read.
            commentTotal: finalComments.length,
            // And nobody has certified a log the server has not seen yet.
            certifyCount: null,
            // Nor is the member's own mark on it known.
            certifiedKnown: false,
            // Said as such, never "No critiques yet".
            critiquesUnread: true,
          };
        }
        // The card it was opened from still holds the record: kept on the page, its critiques
        // said to be out of reach, rather than the record taken away.
        const seed = seedFromCards(queryClient, id);
        if (seed) return { ...seed, seeded: false, critiquesUnread: true };
        throw err;
      }
    },
    staleTime: 5 * 60 * 1000,  // 5 min — logs can get new comments
    enabled: !!id && z.string().uuid().safeParse(id).success,
  });

  const log = logQueryData?.log ?? null;
  const filedAgo = useTimeAgo(log?.created_at);
  const profile = logQueryData?.profile ?? null;
  const comments = logQueryData?.comments ?? [];
  const commentTotal = logQueryData?.commentTotal ?? comments.length;
  // CERTIFY reads the shared store, as every card of this log does; the cached
  // page's number stands in until a fresh answer has been told to it. CRITIQUE
  // is this page's own total — the one the section header prints — because this
  // page moves it by hand on every post and delete; it tells the store too, and
  // records each post as a tap, so the cards follow it.
  const certifyShown = useMarkCount('certify', id, logQueryData?.certifyCount ?? null);
  const loading = logQueryLoading;
  // The record in, or said out of reach: its mark goes in every tree below.
  const readyMark = useScreenReady('log', loading ? 'reading' : !log && logQueryFailed ? 'failed' : 'ready');

  /**
   * THE VAULT. Asked for only when this member owns the log — a visitor's
   * device never sends the request at all, so there is nothing for RLS to have
   * to refuse. Held here, above the early returns, because hooks must be.
   */
  const vault = useVault(id, !!user?.id && !!log && user.id === log.user_id);
  /**
   * May the READER write in the Vault — decides whether EDIT is offered on the
   * current viewing's note. The reader's own clearance, through useClearance,
   * like every rank decision in the app: never the log author's profile.
   */
  const vaultClearance = useClearance('vault-editing');
  /** Sharing this log into a salon is speaking there: without the rank, LOUNGE opens the rope. */
  const loungeClearance = useClearance('lounge-speaking', `/log/${id}`);
  const loungeDeck = useMemo(() => ({
    held: loungeClearance.held,
    spoken: loungeClearance.held ? 'Share to a lounge' : ropeSpoken('Share to a lounge', loungeClearance.rank, loungeClearance.standing),
  }), [loungeClearance.held, loungeClearance.rank, loungeClearance.standing]);

  /**
   * The ONE way this screen changes the critique list.
   *
   * The list is a bounded page with a separate total, so every optimistic add,
   * edit, delete and rollback moves both together, here: the total follows the
   * list by construction and cannot disagree, whatever a future edit does.
   */
  const updateComments = useCallback(
    (updater: (list: LogComment[]) => LogComment[]) => {
      queryClient.setQueryData(['log', id], (old: any) => {
        if (!old) return old;
        const before = (old.comments ?? []) as LogComment[];
        const after = updater(before);
        const prevTotal = old.commentTotal ?? before.length;
        // Never report fewer than are on screen.
        return { ...old, comments: after, commentTotal: Math.max(prevTotal + (after.length - before.length), after.length) };
      });
    },
    [queryClient, id],
  );

  const effectivePosterPath = log?.alt_poster || log?.poster_path;
  const posterUri = effectivePosterPath ? tmdb.poster(effectivePosterPath, 'w185') : null;

  const [refreshing, setRefreshing] = useState(false);
  // A critique being written is kept until the house or the queue has it (useKeptWords).
  const [newComment, setNewComment, letGoOfComment] = useKeptWords(user?.id, 'critique', id ? `log:${id}` : null);
  const [posting, setPosting] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [posterLoaded, setPosterLoaded] = useState(false);
  const isReadyToShare = !posterUri || posterLoaded;

  // Callback isolation: stabilize critique input handler
  const handleNewCommentChange = useCallback((text: string) => {
    setNewComment(text);
  }, [setNewComment]);
  const [showLoungeShare, setShowLoungeShare] = useState(false);
  // Mounted only while a share is in flight — see handleShare.
  const [shareCardMounted, setShareCardMounted] = useState(false);
  const [actionSheetVisible, setActionSheetVisible] = useState(false);
  const [reportSheetVisible, setReportSheetVisible] = useState(false);
  const [commentReportSheetVisible, setCommentReportSheetVisible] = useState(false);
  const [selectedComment, setSelectedComment] = useState<{ id: string; user_id: string; username: string } | null>(null);
  const viewShotRef = useRef<View>(null);
  // The share card says when every picture on it is drawn; handleShare waits for that.
  const shareCardDrawn = useRef<(() => void) | null>(null);
  const shareCardWait = useLater();
  const critiqueInputRef = useRef<TextInput>(null);
  /** The compose box's focus, once the scroll to it has landed. */
  const focusCritique = useLater();
  const scrollViewRef = useRef<any>(null);
  // Absolute Y of the critiques section within the scroll content (padder height + in-card offset).
  const critiquesSectionY = useRef(0);

  // Endorse
  /**
   * Selectors, not the whole store.
   *
   * Reading the whole store would subscribe this screen — hero image, full
   * essay, critique list — to EVERY field, re-rendering it whenever anything in
   * the film store changed anywhere in the app. One value at a time, as the
   * feed card reads them. (useFilmStore / useWatchlistStore /
   * useInteractionStore are three names for one store.)
   */
  const endorsed = useInteractionStore(st => !!st._endorsedIndex[id]);
  // A certification made here is known; otherwise only the house's answer says.
  const certifyKnown = endorsed || !!logQueryData?.certifiedKnown;
  const toggleEndorse = useInteractionStore(st => st.toggleEndorse);

  // SAVE, as on the feed card: read a review properly, decide you want the
  // film, and keep it. The deck is presentational, so the screen owns the state
  // and hands it down — same shape as its other handlers.
  const filmSaved = useInteractionStore(st => !!st._watchlistIndex[log?.film_id ?? -1]);
  // Known once their watchlist is held whole (marksLedger); saved is known at once.
  const filmSaveKnown = useInteractionStore(st => !user || filmSaved || st.marksKnown === 'held');
  const addToWatchlist = useInteractionStore(st => st.addToWatchlist);
  const removeFromWatchlist = useInteractionStore(st => st.removeFromWatchlist);

  // Mirrors the feed card's handler exactly, including the toasts — the same
  // action on two surfaces should not confirm itself two different ways.
  const handleToggleSave = useCallback(() => {
    if (!log) return;
    if (filmSaved) {
      removeFromWatchlist(log.film_id);
      reelToast.success('Removed from watchlist');
    } else {
      addToWatchlist({
        id: log.film_id,
        title: log.film_title,
        poster_path: log.poster_path,
        release_date: log.year ? `${log.year}-01-01` : undefined,
      });
      reelToast.success('Saved to watchlist ✦');
    }
  }, [log, filmSaved, addToWatchlist, removeFromWatchlist]);

  // The page's bar: clear over the projection, its scrim in as the page goes under it.
  const scrollY = useSharedValue(0);
  const scrimEnd = useSharedValue<number>(PAGE.stillUnderBar);
  React.useEffect(() => {
    scrimEnd.value = projectionHeight(headerTop, !!log?.editorial_header) - headerTop - PAGE.bar;
  }, [scrimEnd, headerTop, log?.editorial_header]);
  const barScrimStyle = useAnimatedStyle(() => ({
    opacity: interpolate(scrollY.value, [scrimEnd.value - 60, scrimEnd.value], [0, 1], Extrapolation.CLAMP),
  }));
  const textScale = useTextScale();
  // Where the page's body begins in the scroll: the critiques' place is measured from it.
  const bodyY = useRef(0);

  const keyboard = useAnimatedKeyboard();
  const animatedContainerStyle = useAnimatedStyle(() => ({
    // iOS only: on Android the root ends at the keyboard (KeyboardRoom);
    // padding both would double-shift the content.
    paddingBottom: Platform.OS === 'ios' ? keyboard.height.value : 0,
  }));

  // The cache is the single source of truth; no local useEffect sync required.

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await queryClient.invalidateQueries({ queryKey: ['log', id] });
    setRefreshing(false);
    // The page stays as it was; a pull that reached nothing says so, as every list does.
    if (queryClient.getQueryState(['log', id])?.status === 'error') reelToast.error(REFRESH_FAILED);
  }, [queryClient, id]);

  const handlePostComment = async () => {
    if (!isAuthenticated) { nav.push('/login'); return; }
    if (!newComment.trim() || posting) return;

    // Pre-flight Log ID validation to prevent stuck UI on malformed ID
    if (!z.string().uuid().safeParse(id).success) {
      reelToast.error('Invalid log record.');
      return;
    }

    setPosting(true);
    const commentBody = newComment.trim();
    const commentId = Crypto.randomUUID();
    
    // Optimistic Update
    const optimisticComment: LogComment = {
      id: commentId,
      user_id: user?.id || '',
      username: user?.username || 'anonymous',
      avatar_url: user?.avatar_url || null,
      body: commentBody,
      created_at: houseIso(),
    };
    
    await queryClient.cancelQueries({ queryKey: ['log', id] });

    // No snapshot is taken on purpose: the failure path below rolls back by
    // filtering out this one optimistic comment, which preserves any comment
    // that arrived while the write was in flight.
    updateComments(list => [...list, optimisticComment]);
    // The same +1, for every card of this log (see markCounts).
    const tap = beginTap('critique', id, 1);

    setNewComment('');
    TactileEngine.success();

    try {
      const data = await LogService.addLogComment({
        id: commentId,
        log_id: id,
        user_id: user?.id,
        body: commentBody,
      });

      if (data) {
        const mappedData: LogComment = {
          id: data.id,
          user_id: data.user_id,
          username: (Array.isArray(data.profiles) ? (data.profiles[0] as any)?.username : (data.profiles as any)?.username) || 'anonymous',
          avatar_url: (Array.isArray(data.profiles) ? (data.profiles[0] as any)?.avatar_url : (data.profiles as any)?.avatar_url) || null,
          body: data.body,
          created_at: data.created_at,
        };
        // Ensure UI displays the saved data (profiles etc.)
        updateComments(list => list.map(c => (c.id === commentId ? mappedData : c)));
        letGoOfComment();
        settleTap('critique', id, tap);
        // Filed, where members may certify or answer it: the moment to ask to send word.
        if (user) void offerWord('critique', user.id);
      } else {
        throw new Error('Insert failed');
      }
    } catch (error: unknown) {
      // Kept for the network's return; one the phone had no room to keep comes off the page.
      if (isNetworkError(error) && enqueueMutation({
         type: 'add_log_comment',
         payload: {
             id: commentId,
             log_id: id as string,
             user_id: user?.id,
             body: commentBody
         }
      })) {
        flushOfflineQueue();
        letGoOfComment();
        // Queued, not delivered: it stays on top of every count until the
        // queue delivers it (markCounts.settleDelivered).
        queueTap('critique', id, tap);
        TactileEngine.success();
        // Said, as on a stack: it stayed on the page with nothing to tell it
        // from a critique the house holds.
        reelToast('Critique saved offline. Will sync when connected.');
      } else {
        updateComments(list => list.filter(c => c.id !== commentId));
        // Refused: the words go back in the box, never to be typed twice.
        setNewComment((now) => (now.trim() ? now : commentBody));
        withdrawTap('critique', id, tap);
        reelToast.error(isForbiddenError(error) ? 'This member limits who may annotate their critiques.' : 'Your critique could not be filed.');
      }
    } finally {
      setPosting(false);
    }
  };

  const handleDeleteComment = useCallback(async (commentId: string) => {
    TactileEngine.destroy();
    
    await queryClient.cancelQueries({ queryKey: ['log', id] });
    const previousData = queryClient.getQueryData<any>(['log', id]);
    const targetComment = previousData?.comments?.find((c: LogComment) => c.id === commentId);
    
    updateComments(list => list.filter(c => c.id !== commentId));
    // A critique that was on the page is counted in every card's number.
    const tap = targetComment ? beginTap('critique', id, -1) : null;

    const keepForLater = () => {
      if (enqueueMutation({
          type: 'remove_log_comment',
          // log_id rides along so the queue can say WHICH log's count its
          // delivery settles (markCounts.settleDelivered).
          payload: { comment_id: commentId, user_id: user?.id, log_id: id }
      })) {
        flushOfflineQueue();
        if (tap) queueTap('critique', id, tap);
        TactileEngine.success();
        reelToast('Removed offline. Will sync when connected.');
      }
    };

    // Not sent yet: the house has no row to delete (it would find none, and
    // the filing would then arrive and stand), so the removal waits in the
    // queue behind it, as on a stack.
    if (stillQueued('add_log_comment', commentId)) {
      keepForLater();
      return;
    }

    try {
      await LogService.deleteLogComment(commentId);
      if (tap) settleTap('critique', id, tap);
    } catch (error: unknown) {
      if (isNetworkError(error)) {
        keepForLater();
      } else {
        if (tap) withdrawTap('critique', id, tap);
        if (targetComment) updateComments(list => [...list, targetComment].sort((a, b) => dateOf(a.created_at).getTime() - dateOf(b.created_at).getTime()));
        reelToast.error('Your critique could not be removed.');
      }
    }
  }, [queryClient, id, user, updateComments]);

  const handleShare = async () => {
    // The ref is not checked here: the card it points at does not exist until
    // this function mounts it, three lines down.
    if (!isReadyToShare || sharing) return;
    try {
      TactileEngine.navigate();
      setSharing(true);

      /**
       * Mount the share card NOW, not on page open: it is a complete second
       * rendering of the log, poster included, and a member who never shares
       * should never pay for it.
       *
       * It is captured only once it says every picture on it is drawn. The page
       * having shown the poster is not enough: the card draws it again, in two
       * views of its own, and on Android each loads from disk — a capture two
       * frames after mounting could take the card with a hole where the poster
       * goes. A poster that fails turns the card to its no-poster face, which
       * is ready at once; one that has not answered in 20 s fails the share,
       * and says so.
       */
      const drawn = new Promise<void>((resolve, reject) => {
        shareCardDrawn.current = resolve;
        shareCardWait.later(() => reject(new Error('SHARE_CARD_NOT_DRAWN')), SHARE_CARD_WAIT_MS);
      });
      setShareCardMounted(true);
      await drawn;
      shareCardWait.cancel();
      // One frame more, for the last picture's draw to reach the view.
      await new Promise(resolve => requestAnimationFrame(resolve));

      if (!viewShotRef.current) throw new Error('SHARE_CARD_NOT_MOUNTED');

      const uri = await captureRef(viewShotRef, {
        format: 'png',
        quality: 1,
      });

      if (Platform.OS === 'android') {
        const isAvailable = await Sharing.isAvailableAsync();
        if (isAvailable) {
          await Sharing.shareAsync(uri, {
            mimeType: 'image/png',
            dialogTitle: `Check out my log for ${log?.film_title} on ReelHouse.`,
          });
        }
      } else {
        await Share.share({
          url: uri, // Triggers native sheet with image payload
          message: `Check out my log for ${log?.film_title} on ReelHouse.`, 
        });
      }
    } catch {
       TactileEngine.error();
       // A share that failed says so, as the film's file does.
       reelToast.error('The log could not be shared. Try again.');
    } finally {
       setSharing(false);
       shareCardWait.cancel();
       shareCardDrawn.current = null;
       // Always unmount, including after a failed capture — a share card left
       // behind is the very cost this change exists to remove.
       setShareCardMounted(false);
    }
  };

  // A spinner, not a blank screen: a member on a slow connection can tell the
  // app from a crash. `centerFull` is the style the not-found branch uses.
  if (loading) {
    return (
      <View style={[s.container, s.centerFull]}>
        <RoomLight room="film" />
        {/* Labelled because the eyes are the ONLY thing on screen, so a
            screen-reader member hears it too. */}
        <BusterEyes label="Loading record" />
        {readyMark}
      </View>
    );
  }

  // The way out says where it goes: back, or (opened cold) to the Lobby. Asked
  // only where a way out is drawn.
  const wayOutLabel = () => (nav.canGoBack() ? 'Go back' : 'Return to the Lobby');

  // Unreachable, not missing: a log that could not be read is never "not found".
  if (!log && logQueryFailed) {
    const wayOut = wayOutLabel();
    return (
      <View style={[s.container, s.centerFull]}>
        <RoomLight room="film" />
        <EmptyOffline onRetry={() => { void rereadLog(); }} wayOut={{ label: wayOut, onPress: () => { nav.back(); } }} />
        {readyMark}
      </View>
    );
  }

  if (!log) {
    const wayOut = wayOutLabel();
    return (
      <View style={[s.container, s.centerFull]}>
        <RoomLight room="film" />
        <EmptyState buster="suspicious" title="No Such Record" subtitle="Its member withdrew it, or it was never filed." compact />
        <PressableScale touch="wayOut" style={s.backBtnRow} onPress={() => { nav.back(); }} hitSlop={{ top: 20, bottom: 20, left: 20, right: 20 }} haptic="selection" pressedScale={0.92}
          accessibilityRole="button" accessibilityLabel={wayOut}>
            <ChevronLeft size={12} color={colors.bone} strokeWidth={1.5} />
            <Text style={s.backBtnText}>{wayOut.toUpperCase()}</Text>
        </PressableScale>
        {readyMark}
      </View>
    );
  }

  // The one door to the editor, from the deck and from an open note alike.
  const openEditor = () => {
    nav.push('/log-modal', {
      editLogId: id, filmId: String(log.film_id), filmTitle: log.film_title, filmPoster: log.poster_path ?? '',
    });
  };

  const isAuteur = isAuteurPlusTier(profile?.role);
  const isArchivist = isArchivistPlusTier(profile?.role);

  // The still projected behind the page: the editorial header, when the member set one.
  const stillUri = log.editorial_header ? tmdb.backdrop(log.editorial_header, 'w780') ?? null : null;
  const isOwner = user?.id === log.user_id;
  const rank = isAuteur ? 'aut' : isArchivist ? 'arch' : 'cine';
  // The page is cut from its author's stock, as the frame was; the rank's ink for the name and initial.
  const ground = rank === 'aut' ? colors.sootAuteur : colors.soot;
  const accent = rank === 'cine' ? colors.bone : colors.sepia;
  const nameInk = rank === 'cine' ? colors.parchment : colors.sepia;
  const autopsy = (log.autopsy ?? undefined) as Record<string, number> | undefined;
  const scored = !!log.is_autopsied && hasRatedAutopsy(autopsy);

  return (
    <Animated.View style={[s.page, { backgroundColor: ground }, animatedContainerStyle]}>
      {readyMark}

      {/* The share card, mounted ONLY while a share is in flight: a complete
          second rendering of this log, poster and all, which a member who never
          shares never pays for. */}
      {shareCardMounted && (
      <View style={s.hiddenShareContainer} collapsable={false} pointerEvents="none">
         <View ref={viewShotRef} collapsable={false} style={s.inkBg}>
            <LogShareCard data={{
               filmTitle: log.film_title,
               year: log.year?.toString(),
               posterUri: posterUri || '',
               rating: log.rating,
               review: log.review || undefined,
               pullQuote: log.pull_quote || undefined,
               // No handle at all when the author's name could not be read.
               username: profile?.username ?? '',
               status: log.status as "watched" | "rewatched" | "abandoned" | undefined,
               memberNo: profile?.member_no,
               rank: rankOf(profile?.role),
            }} onReady={() => shareCardDrawn.current?.()} />
         </View>
      </View>
      )}

      {/* The page's bar, over the projection: its scrim comes in as the page goes under it. First in
          the tree, so a screen reader meets the way back first; drawn over the page by its zIndex. */}
      <View style={[s.bar, { paddingTop: headerTop }]}>
        <Animated.View style={[StyleSheet.absoluteFill, s.barScrim, barScrimStyle]} pointerEvents="none" />
        <View style={s.barRow}>
          <PressableScale touch="wayOut" style={s.barButton} onPress={() => { nav.back(); }} hitSlop={null} haptic="selection" pressedScale={0.92} accessibilityLabel="Go back">
            <ChevronLeft size={22} color={colors.sepia} strokeWidth={1.5} />
          </PressableScale>

          {/* Centred between equal gutters, owner or visitor: it never moves, and stands aside where it cannot fit. */}
          {BAR_TITLE.spacing(windowWidth) !== null ? (
            <View style={[s.barTitleWrap, { left: BAR_TITLE.gutter, right: BAR_TITLE.gutter }]} pointerEvents="none">
              <Text style={[s.barTitle, { letterSpacing: BAR_TITLE.spacing(windowWidth) ?? 0 }]} numberOfLines={1} allowFontScaling={false}>PERMANENT RECORD</Text>
            </View>
          ) : null}

          <View style={s.barRight}>
            <PressableScale room style={[s.barShare, { width: BAR_TITLE.share }]} onPress={() => { handleShare(); }} hitSlop={null} haptic="light" pressedScale={0.92}
              accessibilityRole="button" accessibilityLabel={(!isReadyToShare || sharing) ? 'Share. Preparing the card.' : 'Share this log'}
              accessibilityState={{ busy: sharing }}>
               <Share2 size={14} color={colors.parchment} strokeWidth={1.5} />
               <Text style={s.barShareText} numberOfLines={1} allowFontScaling={false}>{(!isReadyToShare || sharing) ? '...' : 'SHARE'}</Text>
            </PressableScale>
            {/* The ···'s place is kept on the member's own record too, so the title stands where it always does. */}
            {!isOwner ? (
              <PressableScale style={s.barButton} onPress={() => setActionSheetVisible(true)} hitSlop={null} haptic="selection" pressedScale={0.92}
                accessibilityLabel="More options" accessibilityHint="Report, block, or mute this member">
                <MoreHorizontal size={16} color={colors.parchment} strokeWidth={1.5} />
              </PressableScale>
            ) : <View style={s.barButton} />}
          </View>
        </View>
      </View>

      <CinematicScrollView
        ref={scrollViewRef}
        externalScrollY={scrollY}
        contentContainerStyle={{ paddingBottom: end, backgroundColor: ground }}
        bottomInset={edge}
        topInset={headerTop + PAGE.bar}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.sepia} colors={[colors.sepia]} progressBackgroundColor={colors.ink} progressViewOffset={headerTop + PAGE.bar} />}
      >
        <LogHero
          log={log}
          profile={profile}
          stillUri={stillUri}
          posterUri={posterUri}
          barTop={headerTop}
          ground={ground}
          nameInk={nameInk}
          timeAgo={filedAgo}
          onPosterLoaded={() => setPosterLoaded(true)}
          onPressUser={() => { if (profile?.username) nav.push(`/user/${encodeURIComponent(profile.username)}`); }}
          onPressFilm={() => { nav.push(`/film/${log.film_id}`); }}
        />

        <View style={s.pageBody} onLayout={(e) => { bodyY.current = e.nativeEvent.layout.y; }}>
          {/* The honour stays: the day this log hung in the Lobby, if it did. */}
          <LobbyHonour kind="log" id={log.id} style={s.lobbyHonour} />

          <LogReviewBody
            review={log.review}
            pullQuote={log.pull_quote}
            dropCap={log.drop_cap}
            accent={accent}
            isOwner={isOwner}
            isSpoiler={log.is_spoiler}
            note={isOwner ? vault.noteFor(log.viewing_id) : ''}
            noteUnreachable={isOwner && vault.unreachable}
            onRereadNote={vault.reload}
            onOpenNote={log.viewing_id
              ? () => vault.openNote(log.viewing_id as string, '◆ CURRENT', vaultClearance.held)
              : undefined}
          />

          <LogChronicle
            log={log}
            // A visitor's device is not given the means to ask for a note, let
            // alone draw one: no reader, no opener.
            noteFor={isOwner ? vault.noteFor : undefined}
            onOpenNote={isOwner
              ? ({ viewingId, label, isCurrent }) => vault.openNote(viewingId, label, isCurrent && vaultClearance.held)
              : undefined}
          />

          {/* The breakdown names itself on its own rule, as on the frame. */}
          {scored ? (
            <View style={s.breakdown}>
              <Breakdown autopsy={autopsy} width={windowWidth - PAGE.pad * 2} scale={textScale} accent={accent} />
            </View>
          ) : null}

          <LogActionDeck
            isOwner={isOwner}
            endorsed={endorsed}
            certifyCount={certifyShown}
            critiqueCount={commentTotal}
            filmSaved={filmSaved}
            saveKnown={filmSaveKnown}
            onSavePress={handleToggleSave}
            // The store has already rolled back and said so; a rejection left
            // unhandled here would only reach the error tracker as noise.
            // Not known whether they certified it: the house is asked again, never a second filed blind.
            onToggleEndorse={() => { if (!certifyKnown) { void rereadLog(); return; } toggleEndorse(id).catch(() => {}); }}
            certifyKnown={certifyKnown}
            onCritiquePress={() => {
               // To the critiques, then the field, ready.
               scrollViewRef.current?.scrollTo({ y: Math.max(0, critiquesSectionY.current - headerTop - PAGE.bar - 12), animated: true });
               focusCritique.later(() => { critiqueInputRef.current?.focus(); }, 300);
            }}
            onEditPress={() => { if (log.film_id) openEditor(); }}
            onLoungePress={() => { if (loungeClearance.held) setShowLoungeShare(true); else loungeClearance.openOr(() => setShowLoungeShare(true)); }}
            lounge={loungeDeck}
          />

          <LogComments
            comments={comments}
            commentTotal={commentTotal}
            currentUserId={user?.id}
            newComment={newComment}
            posting={posting}
            critiqueInputRef={critiqueInputRef as React.RefObject<TextInput>}
            onNewCommentChange={handleNewCommentChange}
            onPostComment={handlePostComment}
            onWithdrawComment={handleDeleteComment}
            onPressUser={(username) => { nav.push(`/user/${encodeURIComponent(username)}`); }}
            onSectionLayout={(y) => { critiquesSectionY.current = bodyY.current + y; }}
            // A member's report; a reader not signed in has no report to file.
            onReportComment={user ? (comment) => {
              setSelectedComment({ id: comment.id, user_id: comment.user_id, username: comment.username });
              setCommentReportSheetVisible(true);
            } : undefined}
            onSignIn={isAuthenticated ? undefined : () => { nav.push('/login'); }}
            unread={!!logQueryData?.critiquesUnread}
            reading={!!logQueryData?.seeded}
            onReread={() => { void rereadLog(); }}
            loadingOlder={loadingOlder}
            onLoadOlder={() => {
              critiqueLimit.current += COMMENT_PAGE_SIZE;
              setLoadingOlder(true);
              void rereadLog().finally(() => setLoadingOlder(false));
            }}
          />
        </View>
      </CinematicScrollView>

      {/* Share to Lounge Modal */}
      <ShareToLoungeModal
        visible={showLoungeShare}
        onClose={() => setShowLoungeShare(false)}
        filmTitle={log.film_title}
        filmId={String(log.film_id)}
        posterPath={log.poster_path}
        logId={id}
        ownerUsername={profile?.username || user?.username || ''}
      />

      {/* Content Action Sheet (Report/Block/Mute) */}
      <ContentActionSheet
        visible={actionSheetVisible}
        targetUserId={log.user_id}
        targetUsername={profile?.username || 'unknown'}
        contentType="log"
        contentId={log.id}
        onClose={() => setActionSheetVisible(false)}
        onReport={() => {
          setActionSheetVisible(false);
          setReportSheetVisible(true);
        }}
        onBlock={() => {
          blockUser(log.user_id);
          setActionSheetVisible(false);
        }}
        onMute={() => {
          muteUser(log.user_id);
          setActionSheetVisible(false);
        }}
      />

      {/* Report Sheet */}
      <ReportSheet
        visible={reportSheetVisible}
        contentType="log"
        contentId={log.id}
        targetUserId={log.user_id}
        targetUsername={profile?.username || 'unknown'}
        onDismiss={() => setReportSheetVisible(false)}
      />

      {/* A critique's REPORT: the report sheet, which can also block its author. */}
      {selectedComment && (
        <ReportSheet
          visible={commentReportSheetVisible}
          contentType="log_comment"
          contentId={selectedComment.id}
          targetUserId={selectedComment.user_id}
          targetUsername={selectedComment.username}
          onDismiss={() => {
            setCommentReportSheetVisible(false);
            setSelectedComment(null);
          }}
        />
      )}

      {/* THE VAULT — a note, opened. Rendered only for the owner, and only once
          there is a note open: nothing about a member's private writing is
          mounted on anybody else's screen. */}
      {isOwner && vault.openedNote && (
        <NoteSheet
          visible
          note={vault.noteFor(vault.openedNote.viewingId)}
          viewingLabel={vault.openedNote.label}
          canEdit={vault.openedNote.canEdit}
          onClose={vault.closeNote}
          // Editing a note is editing the record it belongs to: the same form,
          // opened the same way as the deck's own EDIT — one door, not two.
          onEdit={log.film_id ? () => {
            vault.closeNote();
            openEditor();
          } : undefined}
          onRemove={vault.confirmRemove}
        />
      )}
    </Animated.View>
  );
}

// Expo Router per-route crash net — see src/components/RouteErrorBoundary.tsx
export { RouteErrorBoundary as ErrorBoundary } from '@/src/components/RouteErrorBoundary';
