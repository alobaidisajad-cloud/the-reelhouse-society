import React, { useEffect, useState, useCallback, useRef } from 'react';
import { View, Text, StyleSheet, ScrollView, RefreshControl, TextInput, Share, useWindowDimensions } from 'react-native';
import { Image } from 'expo-image';
import Animated, { FadeInDown, SlideInUp, Easing, useAnimatedKeyboard, useAnimatedStyle } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '@/src/stores/auth';
import { useFilmStore } from '@/src/stores/films';
import { supabase } from '@/src/lib/supabase';
import { colors, fonts } from '@/src/theme/theme';
import { SectionDivider, ReelRating } from '@/src/components/Decorative';
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { tmdb } from '@/src/lib/tmdb';
import { captureRef } from 'react-native-view-shot';
import LogShareCard from '@/src/components/film/LogShareCard';
import ShareToLoungeModal from '@/src/components/ShareToLoungeModal';
import AutopsyGauge from '@/src/components/AutopsyGauge';
import PressableScale from '@/src/components/PressableScale';
import { Heart, MessageSquare, Edit3, MessageCircle, ChevronLeft, ChevronDown, Sparkles, Film as FilmIcon, Star, Archive, Share2, X, Lock } from 'lucide-react-native';

const TMDB_IMG = 'https://image.tmdb.org/t/p/w185';
const AnimatedView = Animated.createAnimatedComponent(View);
function timeAgo(dateStr: string | Date | undefined): string {
  if (!dateStr) return '';
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'JUST NOW';
  if (mins < 60) return `${mins}m AGO`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h AGO`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d AGO`;
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }).toUpperCase();
}

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
  autopsied: boolean;
  is_autopsied?: boolean;
  isAutopsied?: boolean;
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
  };
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
}

interface LogComment {
  id: string;
  user_id: string;
  username: string;
  body: string;
  created_at: string;
}

interface ViewingHistoryEntry {
  date?: string;
  rating: number;
  review?: string;
  watchedWith?: string;
}

// ── Memoized Comment Row ──
 
const CommentRow = React.memo(({ 
  c, 
  currentUserId, 
  onDelete, 
  onPressUser 
}: { 
  c: LogComment; 
  currentUserId?: string; 
  onDelete: (id: string) => void; 
  onPressUser: (username: string) => void;
}) => (
  <View style={s.commentItem}>
    <View style={s.userInfoRow}>
      <PressableScale style={s.shrinkable} onPress={() => onPressUser(c.username)} pressedScale={0.95} haptic="selection">
        <Text style={s.commUsername} numberOfLines={1}>@{c.username}</Text>
      </PressableScale>
      <Text style={s.commDate}>{new Date(c.created_at).toLocaleDateString()}</Text>
    </View>
    <Text style={s.commBody} selectable>{c.body}</Text>
    {currentUserId === c.user_id && (
      <PressableScale onPress={() => onDelete(c.id)} style={s.commDeleteBtn} hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }} haptic="heavy" pressedScale={0.92}>
        <Text style={s.commDelete} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>DELETE</Text>
      </PressableScale>
    )}
  </View>
));

// ── Memoized Viewing History Card ──
 
const ChronicleCard = React.memo(({ entry, cardWidth }: { entry: Record<string, any>; cardWidth: number }) => (
  <View style={[s.chronicleCard, { width: cardWidth }]}>
    <View style={s.chronicleLabelRow}>
      <View style={[s.chronicleLabelBadge, entry.isCurrent && s.chronicleLabelBadgeCurrent]}>
        <Text style={[s.chronicleLabelText, entry.isCurrent && s.chronicleLabelTextCurrent]}>
          {entry.label}
        </Text>
      </View>
      {entry.date && (
        <Text style={s.chronicleDateText}>
          · {new Date(entry.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
        </Text>
      )}
    </View>
    {entry.rating > 0 && (
      <View style={s.chronicleRatingWrap}>
        <ReelRating rating={entry.rating} size={12} />
      </View>
    )}
    {entry.review ? (
      <ScrollView style={s.maxHeight200} nestedScrollEnabled showsVerticalScrollIndicator={false}>
        <Text style={[s.chronicleReviewText, entry.isCurrent && s.chronicleReviewTextCurrent, !entry.isCurrent && s.chronicleReviewTextPast]} adjustsFontSizeToFit minimumFontScale={0.8}>
          {entry.isCurrent ? '' : '"'}{(entry.review || '').replace(/<[^>]+>/g, '').trim()}{entry.isCurrent ? '' : '"'}
        </Text>
      </ScrollView>
    ) : null}
    {entry.watchedWith ? (
      <Text style={s.chronicleWatchedWith}>
        ♡ {entry.watchedWith}
      </Text>
    ) : null}
  </View>
));

export default function LogDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { user, isAuthenticated } = useAuthStore();
  const { width: windowWidth } = useWindowDimensions();

  const queryClient = useQueryClient();

  // ── React Query: MMKV-cached log detail (instant revisits) ──
  const { data: logQueryData, isLoading: logQueryLoading } = useQuery({
    queryKey: ['log', id],
    queryFn: async () => {
      const { data: logData, error } = await supabase
        .from('logs')
        .select(`
          id, film_id, film_title, poster_path, year, 
          rating, review, status, is_spoiler, 
          watched_date, watched_with, private_notes, physical_media, 
          abandoned_reason, is_autopsied, autopsy, alt_poster, editorial_header, drop_cap, pull_quote, viewing_history, 
          user_id, created_at,
          profiles!logs_user_id_fkey(username, avatar_url, display_name)
        `)
        .eq('id', id)
        .single();

      if (error && __DEV__) console.error('Log fetch error:', error);

      const profile = logData ? (Array.isArray(logData.profiles) ? logData.profiles[0] : logData.profiles) : null;

      // Fetch comments (included in the query for initial load)
      const { data: commData } = await supabase
        .from('log_comments')
        .select('id, body, created_at, user_id, profiles(username, avatar_url, display_name)')
        .eq('log_id', id)
        .order('created_at', { ascending: true });

      const mappedComments = (commData || []).map((c: Record<string, any>) => ({
        id: c.id,
        body: c.body,
        created_at: c.created_at,
        user_id: c.user_id,
        username: Array.isArray(c.profiles) ? c.profiles[0]?.username : c.profiles?.username,
      }));

      return { log: logData as LogDetail | null, profile: profile as LogProfile | null, comments: mappedComments as LogComment[] };
    },
    staleTime: 5 * 60 * 1000,  // 5 min — logs can get new comments
    enabled: !!id,
  });

  const log = logQueryData?.log ?? null;
  const profile = logQueryData?.profile ?? null;
  const [comments, setComments] = useState<LogComment[]>([]);
  const loading = logQueryLoading;
  const [refreshing, setRefreshing] = useState(false);
  const [autopsyOpen, setAutopsyOpen] = useState(false);
  const [newComment, setNewComment] = useState('');
  const [posting, setPosting] = useState(false);
  const [sharing, setSharing] = useState(false);

  // Callback isolation: stabilize critique input handler
  const handleNewCommentChange = useCallback((text: string) => {
    setNewComment(text);
  }, []);
  const [chronicleActiveIdx, setChronicleActiveIdx] = useState(0);
  const [showLoungeShare, setShowLoungeShare] = useState(false);
  const viewShotRef = useRef<View>(null);
  const critiqueInputRef = useRef<TextInput>(null);
  const scrollViewRef = useRef<ScrollView>(null);

  // Endorse
  const { hasEndorsed, toggleEndorse } = useFilmStore();
  const endorsed = hasEndorsed(id);

  const keyboard = useAnimatedKeyboard();
  const animatedContainerStyle = useAnimatedStyle(() => ({
    paddingBottom: keyboard.height.value,
  }));

  // Sync comments from query data (but allow local mutations)
  useEffect(() => {
    if (logQueryData?.comments) {
      setComments(logQueryData.comments);
    }
  }, [logQueryData?.comments]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await queryClient.invalidateQueries({ queryKey: ['log', id] });
    setRefreshing(false);
  }, [queryClient, id]);

  const handlePostComment = useCallback(async () => {
    if (!isAuthenticated) return router.push('/login' as any);
    if (!newComment.trim() || posting) return;

    setPosting(true);
    const commentBody = newComment.trim();
    const tempId = `temp_${Date.now()}`;
    
    // Optimistic Update
    const optimisticComment: LogComment = {
      id: tempId,
      user_id: user?.id || '',
      username: user?.username || 'anonymous',
      body: commentBody,
      created_at: new Date().toISOString(),
    };
    
    setComments(prev => [...prev, optimisticComment]);
    setNewComment('');
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

    try {
      const { data, error } = await supabase.from('log_comments').insert({
        log_id: id,
        user_id: user?.id,
        username: user?.username,
        body: commentBody,
      }).select().single();

      if (!error && data) {
        // Swap temp with real
        setComments(prev => prev.map(c => c.id === tempId ? data : c));
      } else {
        throw new Error('Insert failed');
      }
    } catch { 
      // Rollback
      setComments(prev => prev.filter(c => c.id !== tempId));
      setNewComment(commentBody);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setPosting(false);
    }
  }, [isAuthenticated, newComment, posting, user, id, router]);

  const handleDeleteComment = useCallback(async (commentId: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    
    // Optimistic Delete
    let previousComments: LogComment[] = [];
    setComments(prev => {
        previousComments = [...prev];
        return prev.filter(c => c.id !== commentId);
    });
    
    try {
      const { error } = await supabase.from('log_comments').delete().eq('id', commentId);
      if (error) throw new Error('Delete failed');
    } catch {
      // Rollback
      setComments(previousComments);
    }
  }, []);

  const handleShare = async () => {
    if (!viewShotRef.current || !log) return;
    setSharing(true);
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      const uri = await captureRef(viewShotRef, {
        format: 'png',
        quality: 1,
      });

      await Share.share({
        url: uri, // Triggers native sheet with image payload
        message: `Check out my log for ${log.film_title} on ReelHouse.`, 
      });
    } catch {
       Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
       setSharing(false);
    }
  };

  if (loading) return <View style={s.container} />;

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

  const isAuteur = profile?.role === 'auteur';
  const isArchivist = profile?.role === 'archivist';

  const effectivePosterPath = log.alt_poster || log.poster_path;
  const posterUri = effectivePosterPath ? `${TMDB_IMG}${effectivePosterPath}` : null;
  const isPoster = user?.id === log.user_id;

  return (
    <Animated.View style={[s.container, animatedContainerStyle]}>
      {/* ── IMMERSIVE FULL-BLEED BACKDROP (BEHIND SCROLLVIEW) ── */}
      {(log.editorial_header || posterUri) && (
          <View style={[StyleSheet.absoluteFillObject, s.backdropContainer]}>
             <View style={s.fullSize}>
                <Image 
                   source={{ uri: log.editorial_header ? `${TMDB_IMG.replace('w185', 'w1280')}${log.editorial_header}` : (posterUri || '') }} 
                   style={[StyleSheet.absoluteFillObject, log.editorial_header ? s.opacity30 : s.opacity20]}
                   contentFit="cover"
                   blurRadius={4}
                   cachePolicy="memory-disk"
                />
                <LinearGradient colors={['rgba(10,7,3,0)', 'rgba(10,7,3,0.4)', 'rgba(10,7,3,0.95)', colors.ink]} style={StyleSheet.absoluteFillObject} />
                {/* Scan lines texture — Web: repeating-linear-gradient for film grain */}
                <View style={[StyleSheet.absoluteFillObject, s.textureOverlay]} />
                
                {log.editorial_header && (
                  <View style={s.editorialBadge}>
                    <Sparkles size={7} color={'rgba(218,165,32,0.85)'} strokeWidth={1.5} />
                    <Text style={s.editorialBadgeText}>EDITORIAL</Text>
                  </View>
                )}
             </View>
          </View>
      )}

      <View style={s.header}>
        <PressableScale style={s.backBtn} onPress={() => { router.back(); }} hitSlop={{top:20,bottom:20,left:20,right:20}} haptic="selection" pressedScale={0.92}>
          <ChevronLeft size={22} color={colors.sepia} strokeWidth={1.5} />
        </PressableScale>
        <Text style={s.headerTitle} />
        <PressableScale style={s.shareBtn} onPress={() => { handleShare(); }} hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }} haptic="light" pressedScale={0.92}>
           <Share2 size={14} color={colors.sepia} strokeWidth={1.5} />
           <Text style={s.shareBtnText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>{sharing ? '...' : 'SHARE'}</Text>
        </PressableScale>
      </View>

      {/* Hidden Share Card */}
      <View style={s.hiddenShareContainer} collapsable={false}>
         <View ref={viewShotRef} collapsable={false} style={s.inkBg}>
            <LogShareCard data={{
               filmTitle: log.film_title,
               year: log.year?.toString(),
               posterUri: posterUri || '',
               backdropUri: posterUri ? `${TMDB_IMG.replace('w185','w500')}${log.poster_path}` : undefined,
               rating: log.rating,
               review: log.review || undefined,
               pullQuote: log.pull_quote || undefined,
               dropCap: log.drop_cap,
               watchedWith: log.watched_with || undefined,
               username: profile?.username || 'unknown',
               role: profile?.role,
               status: log.status as "watched" | "rewatched" | "abandoned" | undefined,
            }} />
         </View>
      </View>

      <ScrollView 
        ref={scrollViewRef}
        contentContainerStyle={s.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.sepia} />}
      >
        {/* Transparent Padder for Parallax Overlap — Web: height IS_TOUCH ? '10vh' ≈ 80px */}
        <View style={s.parallaxPadder} />

        {/* Overlapping Content Card — Web: bg rgba(10,7,3,0.85), backdropFilter blur(16px), borderRadius 12px 12px 0 0, boxShadow 0 -20px 40px rgba(0,0,0,0.8) */}
        <View style={[s.contentCard, isAuteur && s.contentCardAuteur]}>
          {isAuteur && (
            <LinearGradient colors={['rgba(125,31,31,0.08)', 'transparent']} start={{x: 0, y: 0}} end={{x: 0.5, y: 0.5}} style={StyleSheet.absoluteFillObject} />
          )}
        
        <AnimatedView entering={SlideInUp.duration(500).easing(Easing.out(Easing.cubic))} style={s.logCardInner}>
          
          <View style={s.logCenter}>
            {/* TOP: User Info — Web: fontSize 0.75rem=12px, ls 0.15em=1.8px, color var(--sepia) */}
            <View style={s.userRow}>
              <View style={s.userRowLeft}>
                <PressableScale style={{ flexShrink: 1 }} onPress={() => { if (isPoster) { router.push(`/user/${profile?.username}` as any); } }} pressedScale={0.95} haptic={isPoster ? "selection" : undefined} disabled={!isPoster}>
                  <Text style={s.userRefText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>@{(profile?.username || 'unknown').toUpperCase()}</Text>
                </PressableScale>
                {isArchivist && (
                  <View style={s.archivistBadge}>
                    <Archive size={7} color={colors.sepia} strokeWidth={1.5} />
                    <Text style={s.archivistBadgeText}>ARCHIVIST</Text>
                  </View>
                )}
                {isAuteur && (
                  <View style={s.auteurBadge}>
                    <Star size={7} color={colors.ink} fill={colors.ink} />
                    <Text style={s.auteurBadgeLabel}>AUTEUR</Text>
                  </View>
                )}
              </View>
              <Text style={s.timestamp}>{timeAgo(log.created_at)}</Text>
            </View>

            {/* CENTER: Poster Component — Web: 140x210, radial glow behind for premium */}
            <View style={s.posterSection}>
              {/* Premium radial glow behind poster */}
              {(isAuteur || isArchivist) && posterUri && (
                <View style={[s.posterGlow, isAuteur ? s.posterGlowAuteur : s.posterGlowArchivist]} />
              )}
              <PressableScale onPress={() => { router.push(`/film/${log.film_id}` as any); }} style={[s.posterBounds, isAuteur && s.posterBoundsAuteur]} pressedScale={0.95} haptic="selection">
                {posterUri ? (
                  <Image source={{ uri: posterUri }} style={s.posterCentered} contentFit="cover" cachePolicy="memory-disk" />
                ) : (
                  <View style={[s.posterCentered, s.posterPlaceholder]}>
                    <FilmIcon size={20} color={colors.sepia} strokeWidth={1} />
                  </View>
                )}
              </PressableScale>
            </View>

            {/* BOTTOM: Title & Meta — Web: clamp(2rem,8vw,2.75rem), lineHeight 1.1, textShadow 0 4px 12px */}
            <View style={s.titleSection}>
              <PressableScale onPress={() => { router.push(`/film/${log.film_id}` as any); }} pressedScale={0.95} haptic="selection">
                 <Text style={s.logFilmTitle} adjustsFontSizeToFit numberOfLines={3} minimumFontScale={0.8}>{log.film_title}</Text>
              </PressableScale>
              {log.year && <Text style={s.logFilmYear}>{log.year}</Text>}
            </View>

            {log.rating > 0 && (
              <View style={s.ratingWrap}>
                <ReelRating rating={log.rating} size={18} />
              </View>
            )}

            {log.status === 'abandoned' && (
              <View style={s.abandonedWrap}>
                <View style={s.abandonedBadge}>
                  <X size={12} color={colors.bloodReel} strokeWidth={2} />
                  <Text style={s.abandonedText}>
                     ABANDONED{log.abandoned_reason ? ` — ${log.abandoned_reason.toUpperCase()}` : ''}
                  </Text>
                </View>
              </View>
            )}

            
            {(log.watched_date || log.watched_with || log.physical_media) && (
               <View style={s.metaRow}>
                  {log.watched_date && (
                    <Text style={s.metaDateText}>
                       WATCHED {new Date(log.watched_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).toUpperCase()}
                    </Text>
                  )}
                  {log.watched_date && (log.watched_with || log.physical_media) && <Text style={s.metaDot}>·</Text>}
                  {log.watched_with && (
                    <Text style={s.metaWithText}>
                       WITH {log.watched_with.toUpperCase()}
                    </Text>
                  )}
                  {log.watched_with && log.physical_media && <Text style={s.metaDot}>·</Text>}
                  {log.physical_media && (
                    <Text style={s.metaFormatText}>
                       FORMAT: {log.physical_media.toUpperCase()}
                    </Text>
                  )}
               </View>
            )}
          </View>

          {/* Full Width Review / Pull Quote — Web: padding 1.5rem 1.5rem, textAlign center */}
          <View style={s.reviewSection}>
            {log.editorial_header && (
               <Text style={[s.editorialHeadline, (log.pull_quote || log.review) && s.editorialHeadlineSpaced]}>
                  {log.editorial_header}
               </Text>
            )}
            {log.pull_quote && (
              <View style={s.featuredQuoteWrap}>
                 {/* Ornamental divider */}
                 <View style={s.ornamentalRow}>
                   <View style={s.ornamentalLine} />
                   <Sparkles size={8} color={colors.sepia} strokeWidth={1.5} style={s.ornamentalStar} />
                   <View style={s.ornamentalLine} />
                 </View>
                 <Text style={[s.featuredQuote, isAuteur && s.featuredQuoteAuteur]} adjustsFontSizeToFit numberOfLines={6} minimumFontScale={0.7}>« {log.pull_quote} »</Text>
                 {/* Ornamental divider bottom */}
                 <View style={s.ornamentalRow}>
                   <View style={s.ornamentalLine} />
                   <Sparkles size={8} color={colors.sepia} strokeWidth={1.5} style={s.ornamentalStar} />
                   <View style={s.ornamentalLine} />
                 </View>
              </View>
            )}
            
            {log.review && (
              <View style={s.reviewBodyWrap}>
                {(() => {
                  const cleanReview = log.review.replace(/<(p|div|br)[^>]*>/gi, '\n').replace(/<[^>]+>/g, '').trim();
                  if (!cleanReview) return null;
                  return (
                    <Text style={[s.review, log.drop_cap && s.reviewDropCapReset]}>
                      {log.drop_cap ? (
                        <Text style={s.dropCapLetter}>{cleanReview.charAt(0)}</Text>
                      ) : null}
                      <Text style={log.drop_cap ? s.dropCapBodyLine : undefined}>
                        {log.drop_cap ? cleanReview.slice(1) : cleanReview}
                      </Text>
                    </Text>
                  );
                })()}
              </View>
            )}

            {/* PRIVATE NOTES (Only visible to the log owner) */}
            {isPoster && log.private_notes && (
              <View style={s.privateNotesWrap}>
                 <View style={s.privateNotesHeader}>
                    <Lock size={10} color={colors.sepia} />
                    <Text style={s.privateNotesLabel}>PRIVATE ARCHIVIST NOTES</Text>
                 </View>
                 <Text style={s.privateNotesBody}>
                    {log.private_notes}
                 </Text>
              </View>
            )}
          </View>

          {/* ═══ VIEWING CHRONICLE — Horizontal swipeable carousel ═══ */}
          {(() => {
            const rawHist = log.viewing_history;
            const history: ViewingHistoryEntry[] = Array.isArray(rawHist)
              ? rawHist
              : (typeof rawHist === 'string'
                ? (() => { try { return JSON.parse(rawHist); } catch { return []; } })()
                : []);
            if (!history.length) return null;

            const allViewings = [
              // Past reviews
              ...history.map((entry: ViewingHistoryEntry, idx: number) => ({
                label: idx === history.length - 1 ? '◆ FIRST WATCH' : `VIEWING ${history.length - idx}`,
                date: entry.date,
                rating: entry.rating,
                review: entry.review,
                watchedWith: entry.watchedWith,
                isCurrent: false,
              })),
            ];

            const cardWidth = windowWidth - 34; // 32 margin + 2 border

            return (
              <View style={s.chronicleWrap}>
                {/* Header */}
                <View style={s.chronicleHeader}>
                  <View style={s.chronicleDot} />
                  <Text style={s.chronicleTitle}>
                    VIEWING CHRONICLE — {allViewings.length} viewings
                  </Text>
                </View>

                {/* Horizontal scroll */}
                <ScrollView
                  horizontal
                  pagingEnabled={false}
                  snapToInterval={cardWidth}
                  snapToAlignment="start"
                  decelerationRate="fast"
                  showsHorizontalScrollIndicator={false}
                  onMomentumScrollEnd={(e) => {
                    const page = Math.round(e.nativeEvent.contentOffset.x / cardWidth);
                    setChronicleActiveIdx(page);
                  }}
                  style={s.flexGrowZero}
                >
                  {allViewings.map((entry, idx) => (
                    <ChronicleCard key={idx} entry={entry} cardWidth={cardWidth} />
                  ))}
                </ScrollView>

                {/* Dot indicators */}
                {allViewings.length > 1 && (
                  <View style={s.chronicleDots}>
                    {allViewings.map((_, idx) => (
                      <View key={idx} style={[s.chronicleDotIndicator, idx === chronicleActiveIdx && s.chronicleDotActive]} />
                    ))}
                  </View>
                )}
              </View>
            );
          })()}

          {/* Autopsy Celluloid Gauge */}
          {(log.is_autopsied || log.isAutopsied) && log.autopsy && (
            <View style={s.autopsyWrap}>
               <PressableScale 
                  onPress={() => { setAutopsyOpen(!autopsyOpen); }} 
                  style={s.autopsyToggle}
                  hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }}
                  pressedScale={0.98}
                  haptic="selection"
                >
                  <View style={s.autopsyToggleInner}>
                     <View style={s.autopsyPulse} />
                     <Text style={s.autopsyToggleTitle}>THE AUTOPSY</Text>
                     <Text style={s.autopsyToggleConf}>CONFIDENTIAL</Text>
                   </View>
                   <ChevronDown size={12} color={colors.fog} style={autopsyOpen ? s.rotated : undefined} />
               </PressableScale>

               {autopsyOpen && (
                 <AnimatedView entering={FadeInDown.duration(400)}>
                   <AutopsyGauge autopsy={log.autopsy} />
                 </AnimatedView>
               )}
            </View>
          )}

          <View style={s.actionDeckWrap}>
            <View style={s.actionDeck}>
               {/* CERTIFY — wired to toggleEndorse */}
               <PressableScale style={s.deckBtn} onPress={() => { toggleEndorse(id); }} hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }} haptic="light" pressedScale={0.92}>
                  <Heart size={16} strokeWidth={2} color={endorsed ? colors.sepia : colors.fog} fill={endorsed ? colors.sepia : 'transparent'} />
                  <Text style={[s.deckLabel, endorsed && s.deckLabelActive]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>{endorsed ? 'CERTIFIED' : 'CERTIFY'}</Text>
               </PressableScale>

               {/* CRITIQUE — scrolls to comment input */}
               <PressableScale style={s.deckBtn} onPress={() => { critiqueInputRef.current?.focus(); }} hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }} haptic="selection" pressedScale={0.92}>
                  <MessageSquare size={16} strokeWidth={2} color={colors.fog} />
                  <Text style={s.deckLabel} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>CRITIQUE</Text>
               </PressableScale>

               {isPoster && (
                 <PressableScale style={s.deckBtn} onPress={() => {
                   if (log.film_id) {
                     router.push({ pathname: '/log-modal', params: { editLogId: id, filmId: String(log.film_id), filmTitle: log.film_title, filmPoster: log.poster_path } } as import('expo-router').Href);
                   }
                 }} hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }} haptic="light" pressedScale={0.92}>
                    <Edit3 size={16} strokeWidth={2} color={colors.sepia} />
                    <Text style={[s.deckLabel, s.deckLabelActive]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>EDIT</Text>
                 </PressableScale>
               )}

               {/* LOUNGE — opens ShareToLoungeModal with this log's film */}
               <PressableScale style={s.deckBtn} onPress={() => { setShowLoungeShare(true); }} hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }} haptic="medium" pressedScale={0.92}>
                  <MessageCircle size={16} strokeWidth={2} color={colors.fog} />
                  <Text style={s.deckLabel} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>LOUNGE</Text>
               </PressableScale>
            </View>
          </View>

        </AnimatedView>


        
        <View style={s.commentsSection}>
          <SectionDivider label={`CRITIQUES (${comments.length})`} />
          
          {comments.map((c: LogComment) => (
             <CommentRow 
               key={c.id} 
               c={c} 
               currentUserId={user?.id} 
               onDelete={handleDeleteComment} 
               onPressUser={(username) => router.push(`/user/${username}` as any)} 
             />
          ))}

          {comments.length === 0 && (
             <Text style={s.emptyComments}>No critiques yet. Leave a mark on this record.</Text>
          )}

          {/* Inline Critique Input — Web: AnnotationPanel style */}
          <View style={s.critiqueInputWrap}>
            <TextInput
              ref={critiqueInputRef}
              style={s.critiqueInput}
              placeholder="File an enduring critique..."
              placeholderTextColor={colors.fog}
              value={newComment}
              onChangeText={handleNewCommentChange}
              multiline
              maxLength={500}
              selectionColor={'rgba(218,165,32,0.3)'}
              cursorColor={colors.sepia}
              disableFullscreenUI={true}
              keyboardAppearance="dark"
              accessibilityLabel="Write a critique on this log"
            />
            <PressableScale 
              style={[s.critiqueSubmitBtn, !newComment.trim() && s.critiqueSubmitDisabled]} 
              onPress={handlePostComment} 
              disabled={!newComment.trim() || posting} 
              hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }}
              pressedScale={0.95}
              haptic="medium"
            >
              <Text style={s.critiqueSubmitText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>{posting ? 'FILING...' : 'SUBMIT CRITIQUE'}</Text>
              <Sparkles size={10} color={colors.ink} strokeWidth={1.5} />
            </PressableScale>
          </View>
        </View>
        </View>
      </ScrollView>

      {/* Share to Lounge Modal */}
      <ShareToLoungeModal
        visible={showLoungeShare}
        onClose={() => setShowLoungeShare(false)}
        filmTitle={log.film_title}
        filmId={log.film_id}
        posterPath={log.poster_path}
      />
    </Animated.View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.ink },
  centerFull: { justifyContent: 'center', alignItems: 'center', gap: 16 },
  notFoundText: { color: colors.fog, fontFamily: fonts.body, fontSize: 14, marginTop: 8 },
  shrinkable: { flexShrink: 1 },
  maxHeight200: { maxHeight: 200 },
  backdropContainer: { height: 360 },
  fullSize: { width: '100%', height: '100%' },
  opacity30: { opacity: 0.3 },
  opacity20: { opacity: 0.2 },
  textureOverlay: { backgroundColor: 'rgba(0,0,0,0.03)' },
  hiddenShareContainer: { position: 'absolute', top: -10000, left: 0 },
  inkBg: { backgroundColor: colors.ink },
  parallaxPadder: { height: 80, width: '100%' },
  flexGrowZero: { flexGrow: 0 },
  header: {
    paddingTop: 56, paddingHorizontal: 16, paddingBottom: 16,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.ash,
  },
  backBtn: { width: 50 },
  headerTitle: { fontFamily: fonts.display, fontSize: 18, color: colors.bone },
  shareBtn: { width: 50, flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 4 },
  shareBtnText: { fontFamily: fonts.uiBold, fontSize: 10, color: colors.sepia, letterSpacing: 1 },
  
  content: { paddingBottom: 40 },

  // Content Card
  contentCard: { backgroundColor: 'rgba(10,7,3,0.92)', minHeight: 800, borderTopWidth: 1, borderColor: 'rgba(139,105,20,0.15)', borderTopLeftRadius: 12, borderTopRightRadius: 12, overflow: 'hidden', shadowColor: '#000', shadowOffset: { width: 0, height: -20 }, shadowOpacity: 0.8, shadowRadius: 40, elevation: 24 },
  contentCardAuteur: { backgroundColor: 'rgba(25,10,10,0.92)', borderColor: 'rgba(180,45,45,0.25)' },
  logCardInner: { paddingHorizontal: 16, paddingBottom: 16, marginTop: 0, paddingTop: 24 },
  logCenter: { alignItems: 'center' },

  // User Row
  userRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingBottom: 24, width: '100%' },
  userRowLeft: { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1, minWidth: 0 },
  userRefText: { fontFamily: fonts.ui, fontSize: 12, letterSpacing: 1.8, color: colors.sepia, textTransform: 'uppercase' },
  timestamp: { fontFamily: fonts.ui, fontSize: 10, letterSpacing: 2, color: colors.fog },
  archivistBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 2, backgroundColor: 'rgba(196,150,26,0.1)', borderWidth: 1, borderColor: 'rgba(196,150,26,0.3)', borderRadius: 2 },
  archivistBadgeText: { fontFamily: fonts.ui, fontSize: 6.5, letterSpacing: 1, color: colors.sepia },
  auteurBadge: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 8, paddingVertical: 2, backgroundColor: '#DAA520', borderRadius: 2 },
  auteurBadgeLabel: { fontFamily: fonts.ui, fontSize: 6.5, letterSpacing: 1, color: colors.ink },

  // Poster
  posterSection: { width: '100%', alignItems: 'center', marginBottom: 24, zIndex: 10 },
  posterGlow: { position: 'absolute', top: '50%', left: '50%', width: 180, height: 250, marginLeft: -90, marginTop: -125, borderRadius: 125, zIndex: 0 },
  posterGlowAuteur: { backgroundColor: 'rgba(125,31,31,0.12)' },
  posterGlowArchivist: { backgroundColor: 'rgba(139,105,20,0.12)' },
  posterBounds: { width: 140, height: 210, borderRadius: 2, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(196,150,26,0.35)', backgroundColor: colors.soot, shadowColor: '#000', shadowOffset: {width: 0, height: 20}, shadowOpacity: 0.8, shadowRadius: 40, elevation: 12 },
  posterBoundsAuteur: { borderColor: 'rgba(180,45,45,0.35)', shadowColor: 'rgba(125,31,31,0.2)', shadowOffset: {width:0, height:20}, shadowOpacity: 0.8, shadowRadius: 40 },
  posterCentered: { width: '100%', height: '100%' },
  posterPlaceholder: { backgroundColor: colors.soot, justifyContent: 'center', alignItems: 'center' },

  // Title
  titleSection: { alignItems: 'center', marginBottom: 12 },
  logFilmTitle: { fontFamily: fonts.display, fontSize: 32, lineHeight: 35, color: colors.parchment, textAlign: 'center', textShadowColor: 'rgba(0,0,0,0.5)', textShadowOffset: {width:0, height:4}, textShadowRadius: 12 },
  logFilmYear: { fontFamily: fonts.ui, fontSize: 12, letterSpacing: 3.6, color: colors.fog, marginTop: 8 },
  ratingWrap: { marginTop: 12 },

  // Review
  reviewSection: { marginTop: 24, marginBottom: 16, paddingHorizontal: 24 },
  ornamentalRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 16, marginBottom: 16, marginTop: 16 },
  ornamentalLine: { flex: 1, maxWidth: 80, height: 1, backgroundColor: 'rgba(139,105,20,0.4)' },
  ornamentalStar: { opacity: 0.7 },
  featuredQuoteWrap: { paddingVertical: 24, alignItems: 'center' },
  featuredQuote: { fontFamily: fonts.display, fontSize: 20, color: colors.sepia, fontStyle: 'italic', lineHeight: 27, textAlign: 'center', textShadowColor: 'rgba(139,105,20,0.15)', textShadowOffset: {width:0, height:2}, textShadowRadius: 12 },
  featuredQuoteAuteur: { color: 'rgba(180,45,45,0.9)', textShadowColor: 'rgba(125,31,31,0.15)' },
  reviewBodyWrap: { paddingHorizontal: 0, marginTop: 0 },
  review: { fontSize: 13, color: colors.bone, lineHeight: 22, opacity: 0.9 },
  dropCapRow: { flexDirection: 'row', alignItems: 'flex-start' },
  dropCapLetter: { fontFamily: fonts.display, fontSize: 34, color: colors.sepia, lineHeight: 36, marginRight: 6, marginTop: -2, textShadowColor: 'rgba(139,105,20,0.2)', textShadowOffset: {width:0, height:2}, textShadowRadius: 6 },
  dropCapBody: { flex: 1, paddingTop: 3, fontFamily: fonts.body, fontSize: 15, color: colors.bone, lineHeight: 28, opacity: 0.9 },

  // Editorial Badge
  editorialBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, position: 'absolute', top: 90, left: 16, backgroundColor: 'rgba(11,10,8,0.5)', paddingHorizontal: 14, paddingVertical: 6, borderRadius: 2, borderWidth: 1, borderColor: 'rgba(196,150,26,0.2)' },
  editorialBadgeText: { fontFamily: fonts.ui, fontSize: 7, letterSpacing: 2.2, color: 'rgba(218,165,32,0.85)' },

  // Viewing Chronicle
  chronicleWrap: { marginHorizontal: 16, marginTop: 8, marginBottom: 16, backgroundColor: '#050403', borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(139,105,20,0.18)', borderRadius: 2, overflow: 'hidden' },
  chronicleHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, padding: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: 'rgba(139,105,20,0.1)' },
  chronicleDot: { width: 4, height: 4, borderRadius: 2, backgroundColor: colors.sepia },
  chronicleTitle: { fontFamily: fonts.ui, fontSize: 9, letterSpacing: 1.5, color: colors.sepia },
  chronicleCard: { padding: 14 },
  chronicleLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  chronicleLabelBadge: { borderRadius: 2 },
  chronicleLabelBadgeCurrent: { backgroundColor: 'rgba(139,105,20,0.12)', paddingHorizontal: 6, paddingVertical: 2 },
  chronicleLabelText: { fontFamily: fonts.ui, fontSize: 8, letterSpacing: 1, color: colors.fog },
  chronicleLabelTextCurrent: { color: colors.sepia },
  chronicleDateText: { fontFamily: fonts.ui, fontSize: 8, letterSpacing: 0.8, color: colors.fog },
  chronicleRatingWrap: { marginBottom: 6 },
  chronicleReviewText: { fontFamily: fonts.body, fontSize: 13, color: colors.bone, lineHeight: 20, opacity: 0.75 },
  chronicleReviewTextCurrent: { fontSize: 14, lineHeight: 22, opacity: 0.9, fontStyle: 'normal' },
  chronicleReviewTextPast: { fontStyle: 'italic' },
  chronicleWatchedWith: { fontFamily: fonts.ui, fontSize: 8, letterSpacing: 0.8, color: colors.fog, marginTop: 6 },
  chronicleDots: { flexDirection: 'row', justifyContent: 'center', gap: 6, paddingBottom: 10, paddingTop: 4 },
  chronicleDotIndicator: { width: 6, height: 2, borderRadius: 1, backgroundColor: 'rgba(139,105,20,0.25)' },
  chronicleDotActive: { backgroundColor: colors.sepia, width: 12 },

  // Autopsy
  autopsyWrap: { paddingHorizontal: 16 },
  autopsyToggle: { width: '100%', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 12, paddingHorizontal: 16, backgroundColor: 'rgba(11,10,8,0.95)', borderRadius: 4, borderWidth: 1, borderColor: 'rgba(139,105,20,0.25)', borderBottomWidth: 0, borderBottomLeftRadius: 0, borderBottomRightRadius: 0, marginBottom: -1, zIndex: 2 },
  autopsyToggleInner: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  autopsyPulse: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.sepia, shadowColor: 'rgba(139,105,20,0.6)', shadowOffset: {width:0, height:0}, shadowRadius: 8, shadowOpacity: 1 },
  autopsyToggleTitle: { fontFamily: fonts.display, fontSize: 12, letterSpacing: 2.5, color: colors.parchment },
  autopsyToggleConf: { fontFamily: fonts.ui, fontSize: 7, letterSpacing: 3, color: colors.sepia, opacity: 0.6 },
  rotated: { transform: [{ rotate: '180deg' }] },
  autopsyCard: { backgroundColor: colors.ink, padding: 24, borderRadius: 2, borderWidth: 1, borderColor: colors.ash, borderTopWidth: 0, marginTop: -2, borderTopLeftRadius: 0, borderTopRightRadius: 0, shadowColor: '#000', shadowOffset: {width:0, height:10}, shadowOpacity: 0.5, shadowRadius: 10 },
  autopsyContent: { gap: 24 },
  autopsyBarHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 6 },
  autopsyLabel: { fontFamily: fonts.ui, fontSize: 10, letterSpacing: 2, color: colors.fog },
  autopsyValue: { fontFamily: fonts.display, fontSize: 20, lineHeight: 22, color: colors.parchment, opacity: 0.85, letterSpacing: 1 },
  autopsyTrack: { width: '100%', height: 8, backgroundColor: colors.soot, borderRadius: 1, borderWidth: 1, borderColor: 'rgba(10, 7, 3, 0.8)', overflow: 'hidden' },
  autopsyFill: { height: '100%' },

  // Action Deck
  actionDeckWrap: { paddingHorizontal: 16, marginTop: 8 },
  actionDeck: { flexDirection: 'row', backgroundColor: '#050403', borderRadius: 2, borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(139,105,20,0.1)', marginBottom: 16, overflow: 'hidden', padding: 1, gap: StyleSheet.hairlineWidth, zIndex: 1 },
  deckBtn: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 18, gap: 6, backgroundColor: colors.ink, borderRadius: 1 },
  deckLabel: { fontFamily: fonts.ui, fontSize: 8, letterSpacing: 2, color: colors.fog },
  deckLabelActive: { color: colors.sepia },

  // Comments
  commentsSection: { paddingHorizontal: 16, marginTop: 16, paddingBottom: 40 },
  emptyComments: { fontFamily: fonts.body, fontSize: 12, fontStyle: 'italic', color: colors.fog, textAlign: 'center', marginTop: 24 },
  commentItem: { paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.ash },
  userInfoRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
  commUsername: { fontFamily: fonts.uiBold, fontSize: 10, letterSpacing: 1, color: colors.sepia },
  commBody: { fontFamily: fonts.body, fontSize: 13, color: colors.bone, lineHeight: 20 },
  commDate: { fontFamily: fonts.ui, fontSize: 9, color: colors.fog },
  commDeleteBtn: { marginTop: 8, alignSelf: 'flex-end' },
  commDelete: { fontFamily: fonts.uiMedium, fontSize: 9, letterSpacing: 1, color: colors.bloodReel },

  // Critique Input
  critiqueInputWrap: { 
    marginTop: 32, paddingTop: 24, 
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: 'rgba(139,105,20,0.15)',
  },
  critiqueInput: {
    backgroundColor: '#050403', borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(139,105,20,0.2)',
    borderRadius: 2, paddingHorizontal: 16, paddingVertical: 16,
    color: colors.bone, fontFamily: fonts.body, fontSize: 13, lineHeight: 22,
    minHeight: 120, textAlignVertical: 'top',
  },
  critiqueSubmitBtn: { 
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: colors.sepia, borderRadius: 2, 
    paddingVertical: 14, marginTop: 12, 
  },
  critiqueSubmitText: { fontFamily: fonts.uiBold, fontSize: 10, letterSpacing: 2, color: colors.ink },
  critiqueSubmitDisabled: { opacity: 0.4 },
  
  backBtnRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 24, paddingVertical: 12, paddingHorizontal: 24, borderWidth: 1, borderColor: colors.ash, borderRadius: 2 },
  backBtnText: { fontFamily: fonts.uiMedium, fontSize: 10, letterSpacing: 2, color: colors.bone },

  // Abandoned Badge
  abandonedWrap: { marginTop: 12, alignItems: 'center' },
  abandonedBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: 'rgba(125,31,31,0.1)', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 4, borderWidth: 1, borderColor: 'rgba(125,31,31,0.3)' },
  abandonedText: { fontFamily: fonts.ui, fontSize: 10, letterSpacing: 2, color: colors.bloodReel },

  // Watched Metadata Row
  metaRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', flexWrap: 'wrap', gap: 8, marginTop: 12 },
  metaDateText: { fontFamily: fonts.ui, fontSize: 9, color: colors.fog, letterSpacing: 1.5 },
  metaDot: { color: colors.ash, fontSize: 10 },
  metaWithText: { fontFamily: fonts.ui, fontSize: 9, color: colors.sepia, letterSpacing: 1.5 },
  metaFormatText: { fontFamily: fonts.ui, fontSize: 9, color: colors.bone, letterSpacing: 1.5 },

  // Editorial Headline
  editorialHeadline: { fontFamily: fonts.display, fontSize: 24, textAlign: 'center', color: colors.parchment },
  editorialHeadlineSpaced: { marginBottom: 24 },

  // Drop Cap Override
  reviewDropCapReset: { lineHeight: undefined },
  dropCapBodyLine: { lineHeight: 24 },

  // Private Notes
  privateNotesWrap: { marginTop: 24, padding: 16, backgroundColor: 'rgba(10,7,3,0.5)', borderWidth: 1, borderColor: 'rgba(139,105,20,0.2)', borderRadius: 4 },
  privateNotesHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 },
  privateNotesLabel: { fontFamily: fonts.ui, fontSize: 9, letterSpacing: 2, color: colors.sepia },
  privateNotesBody: { fontFamily: fonts.bodyItalic, fontSize: 12, color: colors.fog, lineHeight: 20 },
});


ChronicleCard.displayName = 'ChronicleCard';

CommentRow.displayName = 'CommentRow';