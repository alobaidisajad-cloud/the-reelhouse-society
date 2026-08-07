 
import { useAuthStore } from '@/src/stores/auth';
import { useBlockStore } from '@/src/stores/blockStore';
import { useFilmStore, useInteractionStore } from '@/src/stores/films';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import * as Crypto from 'expo-crypto';
import TactileEngine from '@/src/utils/TactileEngine';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as Sharing from 'expo-sharing';
import React, { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, Platform, RefreshControl, Share, StyleSheet, Text, TextInput, useWindowDimensions, View } from 'react-native';
import Animated, { Easing, SlideInUp, useAnimatedKeyboard, useAnimatedStyle } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
 
import { s, PARALLAX_PADDER_HEIGHT } from '@/src/components/log/logDetailStyles';
import LogShareCard from '@/src/components/film/LogShareCard';
import { CinematicScrollView } from '@/src/components/layout/CinematicScrollView';
import LogActionDeck from '@/src/components/log/LogActionDeck';
import LogChronicle from '@/src/components/log/LogChronicle';
import LogComments from '@/src/components/log/LogComments';
import LogHero from '@/src/components/log/LogHero';
import LogReviewBody from '@/src/components/log/LogReviewBody';
import { ContentActionSheet } from '@/src/components/moderation/ContentActionSheet';
import ReportSheet from '@/src/components/moderation/ReportSheet';
import PressableScale from '@/src/components/PressableScale';
import ShareToLoungeModal from '@/src/components/ShareToLoungeModal';
import { tmdb } from '@/src/lib/tmdb';
import { LogService } from '@/src/services/LogService';
import { colors } from '@/src/theme/theme';
import { isNetworkError, isForbiddenError } from '@/src/utils/networkError';
import { enqueueMutation, flushOfflineQueue, getOfflineQueue } from '@/src/utils/offlineQueue';
import reelToast from '@/src/utils/reelToast';
import { isArchivistPlusTier, isAuteurPlusTier, resolveTier } from '@/src/utils/tier';
import { timeAgo } from '@/src/utils/timeAgo';
import { ChevronLeft, Film as FilmIcon, MoreHorizontal, Share2, Sparkles } from 'lucide-react-native';
import { captureRef } from 'react-native-view-shot';
import { z } from 'zod';

// TMDB_IMG hardcoded string removed in favor of tmdb.poster / tmdb.backdrop
const AnimatedView = Animated.createAnimatedComponent(View);
// #75 / finding 109 — a local timeAgo used to live here, one of four near-copies. It had no
// weeks bucket at all, so a fortnight-old log jumped straight from "6d AGO" to a bare
// "MAR 5" with no year. The shared util is imported at the top of this file.

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
  private_notes?: string | null;
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

export default function LogDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { user, isAuthenticated } = useAuthStore();
  const { width: windowWidth } = useWindowDimensions();
  const blockUser = useBlockStore((state) => state.blockUser);
  const muteUser = useBlockStore((state) => state.muteUser);
  const insets = useSafeAreaInsets();

  const queryClient = useQueryClient();

  // ── React Query: MMKV-cached log detail (instant revisits) ──
  const { data: logQueryData, isLoading: logQueryLoading } = useQuery({
    queryKey: ['log', id],
    queryFn: async ({ signal }) => {
      try {
        const logData = await LogService.getLogDetails(id, signal);

        // -------------------------------------------------------

        const profile = logData ? (Array.isArray(logData.profiles) ? logData.profiles[0] : logData.profiles) : null;

        // One page of critiques, newest kept, plus the TRUE total. The header
        // used to count this array — which was only right while the fetch was
        // unbounded.
        const { comments: commData, total: commentTotal } = await LogService.getLogComments(id, signal);

        const mappedComments = (commData || []).map((c: Record<string, any>) => ({
          id: c.id,
          body: c.body,
          created_at: c.created_at,
          user_id: c.user_id,
          username: (Array.isArray(c.profiles) ? (c.profiles[0] as any)?.username : (c.profiles as any)?.username) || 'anonymous',
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

        const finalComments = Array.from(finalCommentsMap.values()).sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

        // The total counts what the SERVER holds, plus anything queued offline
        // that is not in it yet — mirroring the dossier screen.
        const pendingNotYetCounted = finalComments.length - mappedComments.length;
        return {
          log: logData as LogDetail | null,
          profile: profile as LogProfile | null,
          comments: finalComments as LogComment[],
          commentTotal: Math.max(commentTotal + pendingNotYetCounted, finalComments.length),
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
            private_notes: localLog.privateNotes,
            physical_media: localLog.physicalMedia,
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
            created_at: localLog.createdAt || new Date().toISOString(),
            viewing_history: localLog.viewingHistory,
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
            // Offline: the queued comments ARE the whole truth we have.
            commentTotal: finalComments.length,
          };
        }
        throw err;
      }
    },
    staleTime: 5 * 60 * 1000,  // 5 min — logs can get new comments
    enabled: !!id && z.string().uuid().safeParse(id).success,
  });

  const log = logQueryData?.log ?? null;
  const profile = logQueryData?.profile ?? null;
  const comments = logQueryData?.comments ?? [];
  const commentTotal = logQueryData?.commentTotal ?? comments.length;
  const loading = logQueryLoading;

  /**
   * The ONE way this screen changes the critique list.
   *
   * The list is now a bounded page with a separate total, so every optimistic
   * add, edit, delete and rollback has to move both together. There are five such
   * places; maintaining a counter by hand at five sites is precisely the drift
   * this batch keeps finding. Here the total follows the list by construction —
   * it cannot disagree, whatever a future edit does.
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
  const [autopsyOpen, setAutopsyOpen] = useState(false);
  const [newComment, setNewComment] = useState('');
  const [posting, setPosting] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [posterLoaded, setPosterLoaded] = useState(false);
  const isReadyToShare = !posterUri || posterLoaded;

  // Callback isolation: stabilize critique input handler
  const handleNewCommentChange = useCallback((text: string) => {
    setNewComment(text);
  }, []);
  const [chronicleActiveIdx, setChronicleActiveIdx] = useState(0);
  const [showLoungeShare, setShowLoungeShare] = useState(false);
  const [actionSheetVisible, setActionSheetVisible] = useState(false);
  const [reportSheetVisible, setReportSheetVisible] = useState(false);
  const [commentActionSheetVisible, setCommentActionSheetVisible] = useState(false);
  const [commentReportSheetVisible, setCommentReportSheetVisible] = useState(false);
  const [selectedComment, setSelectedComment] = useState<{ id: string; user_id: string; username: string } | null>(null);
  const viewShotRef = useRef<View>(null);
  const critiqueInputRef = useRef<TextInput>(null);
  const scrollViewRef = useRef<any>(null);
  // Absolute Y of the critiques section within the scroll content (padder height + in-card offset).
  const critiquesSectionY = useRef(0);

  // Endorse
  const { hasEndorsed, toggleEndorse } = useInteractionStore();
  const endorsed = hasEndorsed(id);

  const keyboard = useAnimatedKeyboard();
  const animatedContainerStyle = useAnimatedStyle(() => ({
    // iOS only: Android's window resize (softwareKeyboardLayoutMode) already
    // lifts the composer; padding both would double-shift the content.
    paddingBottom: Platform.OS === 'ios' ? keyboard.height.value : 0,
  }));

  // The cache is the single source of truth; no local useEffect sync required.

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await queryClient.invalidateQueries({ queryKey: ['log', id] });
    setRefreshing(false);
  }, [queryClient, id]);

  const handlePostComment = async () => {
    if (!isAuthenticated) return (router.push as any)('/login' as any);
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
      created_at: new Date().toISOString(),
    };
    
    await queryClient.cancelQueries({ queryKey: ['log', id] });

    // No snapshot is taken on purpose: the failure path below rolls back by
    // filtering out this one optimistic comment, which preserves any comment
    // that arrived while the write was in flight.
    updateComments(list => [...list, optimisticComment]);
    
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
      } else {
        throw new Error('Insert failed');
      }
    } catch (error: unknown) { 
      if (isNetworkError(error)) {
        enqueueMutation({
           type: 'add_log_comment',
           payload: {
               id: commentId,
               log_id: id as string,
               user_id: user?.id,
               body: commentBody
           }
        });
        flushOfflineQueue();
        TactileEngine.success();
      } else {
        updateComments(list => list.filter(c => c.id !== commentId));
        reelToast.error(isForbiddenError(error) ? 'This member limits who may annotate their critiques.' : 'Failed to file critique.');
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
    
    try {
      await LogService.deleteLogComment(commentId);
    } catch (error: unknown) {
      if (error instanceof Error && error.message === 'Already deleted') {
          return;
      }
      if (isNetworkError(error)) {
        enqueueMutation({
            type: 'remove_log_comment',
            payload: { comment_id: commentId, user_id: user?.id }
        });
        flushOfflineQueue();
        TactileEngine.success();
      } else {
        if (targetComment) updateComments(list => [...list, targetComment].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()));
        reelToast.error('Failed to delete critique.');
      }
    }
  }, [queryClient, id, user, updateComments]);

  const handleShare = async () => {
    if (!isReadyToShare || !viewShotRef.current) return;
    try {
      TactileEngine.navigate();
      setSharing(true);
      
      // Additional deterministic UI lock: wait one frame to ensure layout is fully calculated
      await new Promise(resolve => requestAnimationFrame(resolve));

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
    } finally {
       setSharing(false);
    }
  };

  // A spinner, not a blank screen. This returned a bare <View>, so a member on a
  // slow connection saw nothing at all and could not tell the app from a crash.
  // The dossier and lounge screens both show this; `centerFull` is the same style
  // the not-found branch below already uses.
  if (loading) {
    return (
      <View style={[s.container, s.centerFull]}>
        <ActivityIndicator color={colors.sepia} />
      </View>
    );
  }

  if (!log) {
    return (
      <View style={[s.container, s.centerFull]}>
        <FilmIcon size={40} color={colors.sepia} strokeWidth={1} />
        <Text style={s.notFoundText}>Log not found.</Text>
        <PressableScale style={s.backBtnRow} onPress={() => { router.back(); }} hitSlop={{ top: 20, bottom: 20, left: 20, right: 20 }} haptic="selection" pressedScale={0.92}>
            <ChevronLeft size={12} color={colors.bone} strokeWidth={1.5} />
            <Text style={s.backBtnText}>GO BACK</Text>
        </PressableScale>
      </View>
    );
  }

  const isAuteur = isAuteurPlusTier(profile?.role);
  const isArchivist = isArchivistPlusTier(profile?.role);

  const backdropPosterUri = effectivePosterPath ? tmdb.poster(effectivePosterPath, 'w780') : null;
  const isOwner = user?.id === log.user_id;

  return (
    <Animated.View style={[s.container, animatedContainerStyle]}>
      {/* ── IMMERSIVE FULL-BLEED BACKDROP (BEHIND SCROLLVIEW) ── */}
      {(log.editorial_header || backdropPosterUri) && (
          <View style={[StyleSheet.absoluteFillObject, s.backdropContainer]}>
             <View style={s.fullSize}>
                <Image 
                   source={{ uri: log.editorial_header ? tmdb.backdrop(log.editorial_header, 'w780') : (backdropPosterUri || '') }} 
                   style={[StyleSheet.absoluteFillObject, log.editorial_header ? s.opacity30 : s.opacity20]}
                   contentFit="cover"
                   blurRadius={4}
                   cachePolicy="memory-disk" transition={150}
                />
                <LinearGradient colors={['rgba(10,7,3,0)', 'rgba(10,7,3,0.4)', 'rgba(10,7,3,0.95)', colors.ink]} style={StyleSheet.absoluteFillObject} />
                {/* Scan lines texture — Web: repeating-linear-gradient for film grain */}
                <View style={[StyleSheet.absoluteFillObject, s.textureOverlay]} />
                
                {log.editorial_header && (
                  <View style={[s.editorialBadge, { top: Math.max(insets.top + 8, 56) + 44 }]}>
                    <Sparkles size={7} color={'rgba(218,165,32,0.85)'} strokeWidth={1.5} />
                    <Text style={s.editorialBadgeText}>EDITORIAL</Text>
                  </View>
                )}
             </View>
          </View>
      )}

      <View style={[s.header, { paddingTop: Math.max(insets.top + 8, 56) }]}>
        <View style={s.headerRow}>
          <PressableScale style={s.backBtn} onPress={() => { router.back(); }} hitSlop={{top:20,bottom:20,left:20,right:20}} haptic="selection" pressedScale={0.92}>
            <ChevronLeft size={22} color={colors.sepia} strokeWidth={1.5} />
          </PressableScale>

          {/* Absolutely centered — never shifts owner↔visitor */}
          <View style={s.eyebrowWrap} pointerEvents="none">
            <Text style={s.eyebrow} numberOfLines={1} allowFontScaling={false}>FROM THE PERMANENT RECORD</Text>
          </View>

          <View style={s.headerRight}>
            <PressableScale style={s.shareBtn} onPress={() => { handleShare(); }} hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }} haptic="light" pressedScale={0.92}>
               <Share2 size={14} color={colors.sepia} strokeWidth={1.5} />
               <Text style={s.shareBtnText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>{(!isReadyToShare || sharing) ? '...' : 'SHARE'}</Text>
            </PressableScale>
            {!isOwner && (
              <PressableScale
                style={s.moreBtn}
                onPress={() => setActionSheetVisible(true)}
                hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }}
                haptic="selection"
                pressedScale={0.92}
                accessibilityLabel="More options"
                accessibilityHint="Report, block, or mute this member"
              >
                <MoreHorizontal size={16} color={colors.fog} strokeWidth={1.5} />
              </PressableScale>
            )}
          </View>
        </View>
      </View>

      {/* Hidden Share Card */}
      <View style={s.hiddenShareContainer} collapsable={false} pointerEvents="none">
         <View ref={viewShotRef} collapsable={false} style={s.inkBg}>
            <LogShareCard data={{
               filmTitle: log.film_title,
               year: log.year?.toString(),
               posterUri: posterUri || '',
               rating: log.rating,
               review: log.review || undefined,
               pullQuote: log.pull_quote || undefined,
               dropCap: log.drop_cap,
               watchedWith: log.watched_with || undefined,
               username: profile?.username || 'unknown',
               role: profile?.role,
               status: log.status as "watched" | "rewatched" | "abandoned" | undefined,
               memberNo: profile?.member_no,
            }} />
         </View>
      </View>

      <CinematicScrollView 
        ref={scrollViewRef}
        contentContainerStyle={s.content}
        bottomInset={insets.bottom}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.sepia} colors={[colors.sepia]} progressBackgroundColor={colors.ink} />}
      >
        {/* Transparent Padder for Parallax Overlap — Web: height IS_TOUCH ? '10vh' ≈ 80px */}
        <View style={s.parallaxPadder} />

        {/* Overlapping Content Card — Web: bg rgba(10,7,3,0.85), backdropFilter blur(16px), borderRadius 12px 12px 0 0, boxShadow 0 -20px 40px rgba(0,0,0,0.8) */}
        <View style={[s.contentCard, isAuteur && s.contentCardAuteur]}>
          {isAuteur && (
            <LinearGradient colors={['rgba(125,31,31,0.08)', 'transparent']} start={{x: 0, y: 0}} end={{x: 0.5, y: 0.5}} style={StyleSheet.absoluteFillObject} />
          )}
        
        <AnimatedView entering={SlideInUp.duration(500).easing(Easing.out(Easing.cubic))} style={s.logCardInner}>
          
          <LogHero
            log={log}
            profile={profile}
            posterUri={posterUri}
            isAuteur={isAuteur}
            isArchivist={isArchivist}
            timeAgo={timeAgo(log.created_at)}
            onPosterLoaded={() => setPosterLoaded(true)}
            onPressUser={() => { if (profile?.username) (router.push as any)(`/user/${profile.username}` as any); }}
            onPressFilm={() => { (router.push as any)(`/film/${log.film_id}` as any); }}
          />

          {/* Full Width Review / Pull Quote — Web: padding 1.5rem 1.5rem, textAlign center */}
          <LogReviewBody
            review={log.review}
            pullQuote={log.pull_quote}
            dropCap={log.drop_cap}
            isAuteur={isAuteur}
            isOwner={isOwner}
            isSpoiler={log.is_spoiler}
            privateNotes={log.private_notes}
          />

          {/* ═══ VIEWING CHRONICLE — Horizontal swipeable carousel ═══ */}
          <LogChronicle
            log={log}
            windowWidth={windowWidth}
            chronicleActiveIdx={chronicleActiveIdx}
            onChronicleIdxChange={setChronicleActiveIdx}
          />

          <LogActionDeck
            logId={id}
            log={log}
            isOwner={isOwner}
            endorsed={endorsed}
            autopsyOpen={autopsyOpen}
            onToggleEndorse={() => { toggleEndorse(id); }}
            onToggleAutopsy={() => { setAutopsyOpen(!autopsyOpen); }}
            onCritiquePress={() => {
               // Scroll to the compose box at the top of the critiques section, then focus it.
               scrollViewRef.current?.scrollTo({ y: Math.max(0, critiquesSectionY.current - 12), animated: true });
               setTimeout(() => { critiqueInputRef.current?.focus(); }, 300);
            }}
            onEditPress={() => {
              if (log.film_id) {
                (router.push as any)({ pathname: '/log-modal', params: { editLogId: id, filmId: String(log.film_id), filmTitle: log.film_title, filmPoster: log.poster_path } } as import('expo-router').Href);
              }
            }}
            onLoungePress={() => { setShowLoungeShare(true); }}
          />

        </AnimatedView>


        
        <LogComments
          comments={comments}
          commentTotal={commentTotal}
          currentUserId={user?.id}
          newComment={newComment}
          posting={posting}
          critiqueInputRef={critiqueInputRef as React.RefObject<TextInput>}
          onNewCommentChange={handleNewCommentChange}
          onPostComment={handlePostComment}
          onDeleteComment={handleDeleteComment}
          onPressUser={(username) => (router.push as any)(`/user/${username}` as any)}
          onSectionLayout={(y) => { critiquesSectionY.current = PARALLAX_PADDER_HEIGHT + y; }}
          onLongPressComment={(comment) => {
            setSelectedComment({ id: comment.id, user_id: comment.user_id, username: comment.username });
            setCommentActionSheetVisible(true);
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

      {/* Comment Moderation: Action Sheet & Report Sheet */}
      {selectedComment && (
        <>
          <ContentActionSheet
            visible={commentActionSheetVisible}
            contentType="log_comment"
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
            contentType="log_comment"
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