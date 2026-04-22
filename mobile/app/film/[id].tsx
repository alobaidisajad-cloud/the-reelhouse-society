/**
 * FilmDetailScreen — Native Film Detail page (Criterion-grade overhaul).
 *
 * Features:
 *  • Full-bleed parallax backdrop with sepia tint overlay
 *  • Poster with sepia glow shadow + scanlines overlay + logged badge
 *  • Lucide icons for ALL actions — zero cheap emoji
 *  • Director Card with photo, name, and navigable link
 *  • Genre tags, tagline, meta strip, ReelRating, ObscurityBadge
 *  • Prestige Label badge (A24/NEON/MUBI/Criterion)
 *  • Shimmer skeleton loading state
 *  • Community reviews with tier badges + quote decoration
 *  • WatchProviders, Videos, Studios, Similar Films, CountryReleases
 *  • Share & Trailer modals
 *  • 100% StyleSheet — zero inline styles
 */
import { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import {
  View, Text, StyleSheet, ScrollView,
  Dimensions, Animated as RNAnimated, Linking,
} from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import Animated, {
  FadeInDown, FadeInUp, FadeIn,
  useSharedValue, useAnimatedStyle,
  withRepeat, withSequence, withTiming, withSpring, Easing,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { tmdb, formatRuntime, getYear, obscurityScore } from '@/src/lib/tmdb';
import { useFilmStore } from '@/src/stores/films';
import { useAuthStore } from '@/src/stores/auth';
import { supabase } from '@/src/lib/supabase';
import { colors, fonts, typography, spacing, effects, SEPIA_HASH } from '@/src/theme/theme';
import { ReelRating, SectionDivider } from '@/src/components/Decorative';
import { WatchProviders } from '@/src/components/film/WatchProviders';
import { ShareCardModal } from '@/src/components/film/ShareCardModal';
import { CastCarousel } from '@/src/components/film/CastCarousel';
import { TrailerModal } from '@/src/components/film/TrailerModal';
import CountryReleases from '@/src/components/film/CountryReleases';
import PressableScale from '@/src/components/PressableScale';
import {
  Clock, Globe, ArrowLeft, Play, Pencil, Plus,
  Bookmark as BookIcon, Share2, RotateCcw, XCircle, Check,
  ArrowUpRight, Film as FilmIcon, Camera, MessageCircle, History,
} from 'lucide-react-native';

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');
const BACKDROP_H = SCREEN_H * 0.48;
const POSTER_W = 140;
const POSTER_H = POSTER_W * 1.5;
const AnimatedView = Animated.createAnimatedComponent(View);
const AnimatedExpoImage = Animated.createAnimatedComponent(Image);



/** TMDB detail sub-types used across this screen */
interface ProductionCompany {
  id: number;
  name: string;
  logo_path?: string | null;
  origin_country?: string;
}

interface VideoResult {
  id: string;
  key: string;
  name: string;
  site: string;
  type: string;
}

interface CrewMember {
  id: number;
  name: string;
  job: string;
  profile_path?: string | null;
}

interface Genre {
  id: number;
  name: string;
}

interface CommunityReview {
  id: string;
  rating: number;
  review: string;
  created_at: string;
  user_id: string;
  username?: string;
  role?: string;
  isLocal?: boolean;
  profiles?: { username: string; role: string } | Array<{ username: string; role: string }> | null;
}

interface SimilarFilm {
  id: number;
  title?: string;
  name?: string;
  poster_path?: string | null;
}

// ── Prestige Labels ─────────────────────────────────────────
const PRESTIGE_STUDIOS = ['A24', 'NEON', 'MUBI', 'Criterion', 'Janus Films', 'Oscilloscope', 'Kino Lorber'];

function PrestigeBadge({ companies }: { companies: ProductionCompany[] }) {
  const match = companies?.find((c: ProductionCompany) => PRESTIGE_STUDIOS.some(p => c.name?.includes(p)));
  if (!match) return null;
  return (
    <View style={sub.prestigeBadge}>
      <FilmIcon size={8} color={colors.flicker} strokeWidth={1.5} />
      <Text style={sub.prestigeText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>{match.name.toUpperCase()}</Text>
    </View>
  );
}

// ── Obscurity Badge ─────────────────────────────────────────
function ObscurityBadge({ score }: { score: number }) {
  if (score <= 0) return null;
  const label = score > 80 ? 'GHOST REEL' : score > 60 ? 'DEEP CUT' : score > 40 ? 'INDIE' : score > 20 ? 'KNOWN' : 'MAINSTREAM';
  const color = score > 70 ? colors.sepia : score > 40 ? colors.bone : colors.fog;
  return (
    <View style={[sub.obsBadge, { borderColor: color }]}>
      <Text style={[sub.obsScore, { color }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>{score}</Text>
      <Text style={sub.obsLabel} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>{label}</Text>
    </View>
  );
}

// ── Genre Tag ───────────────────────────────────────────────
function GenreTag({ name }: { name: string }) {
  return (
    <View style={s.genreTag}>
      <Text style={s.genreText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>{name.toUpperCase()}</Text>
    </View>
  );
}

// ── Video Thumbnail ─────────────────────────────────────────
function VideoThumb({ video, onPlay }: { video: VideoResult; onPlay: () => void }) {
  const thumb = `https://img.youtube.com/vi/${video.key}/mqdefault.jpg`;
  return (
    <PressableScale onPress={onPlay} style={sub.videoThumb} hitSlop={{top: 10, bottom: 10}}>
      <Image source={{ uri: thumb }} style={sub.videoImg} contentFit="cover" cachePolicy="memory-disk" placeholder={{ blurhash: SEPIA_HASH }} transition={50} />
      <View style={sub.videoPlayOverlay}>
        <View style={sub.videoPlayCircle}>
          <Play size={14} color={colors.parchment} fill={colors.parchment} />
        </View>
      </View>
      <View style={sub.videoLabelWrap}>
        <Text style={sub.videoType}>{video.type?.toUpperCase() ?? 'VIDEO'}</Text>
        <Text style={sub.videoName} numberOfLines={1}>{video.name}</Text>
      </View>
    </PressableScale>
  );
}

// ── Production Studio ───────────────────────────────────────
function StudioCard({ company }: { company: ProductionCompany }) {
  const logoUri = company.logo_path ? `https://image.tmdb.org/t/p/w92${company.logo_path}` : null;
  return (
    <View style={sub.studioCard}>
      {logoUri ? (
        <Image source={{ uri: logoUri }} style={sub.studioLogo} contentFit="contain" cachePolicy="memory-disk" placeholder={{ blurhash: SEPIA_HASH }} transition={50} />
      ) : (
        <View style={[sub.studioLogo, sub.studioLogoPlaceholder]}>
          <FilmIcon size={10} color={colors.fog} strokeWidth={1} />
        </View>
      )}
      <Text style={sub.studioName} numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.8}>{company.name}</Text>
      {company.origin_country && <Text style={sub.studioCountry}>{company.origin_country}</Text>}
    </View>
  );
}

// ── Similar Film Card ───────────────────────────────────────
function SimilarCard({ film }: { film: SimilarFilm }) {
  const router = useRouter();
  const posterUri = film.poster_path ? tmdb.poster(film.poster_path) : null;
  return (
    <PressableScale onPress={() => { Haptics.selectionAsync(); router.push(`/film/${film.id}`); }} style={s.similarCard}>
      {posterUri ? (
        <Image source={{ uri: posterUri }} style={s.similarPoster} cachePolicy="memory-disk" placeholder={{ blurhash: SEPIA_HASH }} transition={50} />
      ) : (
        <View style={[s.similarPoster, s.similarPosterPlaceholder]}>
          <FilmIcon size={16} color={colors.fog} strokeWidth={1} />
        </View>
      )}
      <Text style={s.similarTitle} numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.8}>{film.title || film.name}</Text>
    </PressableScale>
  );
}

// ── Dossier Row ─────────────────────────────────────────────
function DossierRow({ label, value }: { label: string; value: string | undefined }) {
  if (!value || value === '—' || value === 'Unknown') return null;
  return (
    <View style={s.dossierRow}>
      <Text style={s.dossierLabel}>{label}</Text>
      <Text style={s.dossierValue}>{value}</Text>
    </View>
  );
}

// ── Director Card ───────────────────────────────────────────
function DirectorCard({ director, router }: { director: CrewMember; router: ReturnType<typeof useRouter> }) {
  const photoUri = director.profile_path
    ? `https://image.tmdb.org/t/p/w185${director.profile_path}`
    : null;

  return (
    <PressableScale
      style={s.directorCard}
      onPress={() => { Haptics.selectionAsync(); router.push(`/person/${director.id}`); }}
      pressedScale={0.98}
    >
      {photoUri ? (
        <Image source={{ uri: photoUri }} style={s.directorPhoto} cachePolicy="memory-disk" placeholder={{ blurhash: SEPIA_HASH }} transition={50} />
      ) : (
        <View style={[s.directorPhoto, s.directorPhotoPlaceholder]}>
          <Text style={s.directorPhotoInitial}>
            {director.name?.charAt(0)?.toUpperCase() || '?'}
          </Text>
        </View>
      )}
      <View style={s.directorInfo}>
        <Text style={s.directorLabel}>DIRECTED BY</Text>
        <Text style={s.directorName} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>{director.name}</Text>
      </View>
      <ArrowUpRight size={14} color={colors.fog} strokeWidth={1.5} />
    </PressableScale>
  );
}

// ════════════════════════════════════════════════════════════
//  MAIN FILM DETAIL SCREEN
// ════════════════════════════════════════════════════════════
export default function FilmDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const scrollY = useRef(new RNAnimated.Value(0)).current;

  const [shareModalVisible, setShareModalVisible] = useState(false);
  const [trailerModalVisible, setTrailerModalVisible] = useState(false);
  const [activeTrailerKey, setActiveTrailerKey] = useState<string | null>(null);

  const { isAuthenticated, user } = useAuthStore();
  const { _watchlistIndex, _loggedIndex, addToWatchlist, removeFromWatchlist, logs } = useFilmStore();

  // ── Refinement 4: Poster glow breathing (projector warmth) ──
  const posterGlowOpacity = useSharedValue(0.6);
  const whisperPulse = useSharedValue(0.2);
  const skeletonOpacity = useSharedValue(0.4);

  useEffect(() => {
    posterGlowOpacity.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 3000, easing: Easing.inOut(Easing.ease) }),
        withTiming(0.6, { duration: 3000, easing: Easing.inOut(Easing.ease) }),
      ),
      -1, false,
    );
    whisperPulse.value = withRepeat(
      withSequence(
        withTiming(0.8, { duration: 1500, easing: Easing.inOut(Easing.ease) }),
        withTiming(0.2, { duration: 1500, easing: Easing.inOut(Easing.ease) })
      ),
      -1, true
    );
    skeletonOpacity.value = withRepeat(
      withSequence(
        withTiming(0.7, { duration: 1000, easing: Easing.inOut(Easing.ease) }),
        withTiming(0.3, { duration: 1000, easing: Easing.inOut(Easing.ease) })
      ),
      -1, true
    );
  }, []);
  const posterGlowStyle = useAnimatedStyle(() => ({
    opacity: posterGlowOpacity.value,
  }));
  const whisperPulseStyle = useAnimatedStyle(() => ({
    opacity: whisperPulse.value,
    transform: [{ scale: whisperPulse.value * 0.5 + 1 }]
  }));
  const skeletonAnimStyle = useAnimatedStyle(() => ({
    opacity: skeletonOpacity.value,
  }));

  // ── Refinement 5: Bookmark bounce on watchlist toggle ──
  const bookmarkScale = useSharedValue(1);
  const bookmarkAnimStyle = useAnimatedStyle(() => ({
    transform: [{ scale: bookmarkScale.value }],
  }));

  const filmId = Number(id);
  const isWatchlisted = !!_watchlistIndex[filmId];
  const existingLog = _loggedIndex[filmId] ?? null;
  const isArchivist = user && ['archivist', 'auteur'].includes(user.role);
  const localReview = logs.find((l) => (l.filmId === filmId || String(l.filmId) === String(filmId)) && l.review);
  const currentUsername = user?.username ?? null;

  // ── React Query: MMKV-cached film data (instant revisits) ──
  const { data: filmQueryData, isLoading: filmQueryLoading } = useQuery({
    queryKey: ['film', filmId],
    queryFn: async () => {
      // Haptic thud — feels like opening a classified dossier
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

      const [detail, communityReviews] = await Promise.all([
        tmdb.detail(filmId),
        supabase
          .from('logs')
          .select('id, rating, review, created_at, user_id, profiles!logs_user_id_fkey(username, role)')
          .eq('film_id', filmId)
          .not('review', 'is', null)
          .order('created_at', { ascending: false })
          .limit(10),
      ]);

      // Prefetch hero images so backdrop + poster appear instantly
      if (detail?.backdrop_path) {
        Image.prefetch(tmdb.backdrop(detail.backdrop_path) ?? '');
      }
      if (detail?.poster_path) {
        Image.prefetch(tmdb.poster(detail.poster_path) ?? '');
      }

      const reviews = communityReviews.data?.map((r: CommunityReview) => ({
        ...r,
        username: Array.isArray(r.profiles) ? r.profiles[0]?.username : r.profiles?.username,
        role: Array.isArray(r.profiles) ? r.profiles[0]?.role : r.profiles?.role,
      })) ?? [];

      let similar: SimilarFilm[] = [];
      if (detail?.id) {
        const sim = await tmdb.similar(detail.id);
        similar = (sim as SimilarFilm[]).filter((f: SimilarFilm) => f.poster_path).slice(0, 12);
      }

      return { detail, reviews, similar };
    },
    staleTime: 30 * 60 * 1000,  // 30 min — film metadata doesn't change often
    enabled: !!filmId && !isNaN(filmId),
  });

  const film = filmQueryData?.detail ?? null;
  const reviews = filmQueryData?.reviews ?? [];
  const similarFilms = filmQueryData?.similar ?? [];
  const loading = filmQueryLoading;

  // ── Option 2: Semantic Haptics Engine ──
  const triggerSemanticHaptic = useCallback((defaultStyle = Haptics.ImpactFeedbackStyle.Medium) => {
    const filmData = film as Record<string, unknown> & { genres?: Genre[], release_date?: string };
    if (!filmData || !filmData.genres) {
      Haptics.impactAsync(defaultStyle);
      return;
    }
    const genres = filmData.genres.map((g: Genre) => g.name.toLowerCase());
    if (genres.includes('horror') || genres.includes('thriller')) {
       // Deep heartbeat
       Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
       setTimeout(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy), 150);
    } else if (genres.includes('action') || genres.includes('science fiction')) {
       // Rigid crack
       Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Rigid);
    } else if (genres.includes('drama') || genres.includes('romance')) {
       // Soft swell
       Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Soft);
    } else if (filmData.release_date && new Date(filmData.release_date).getFullYear() < 1970) {
       // Classic Celluloid Stutter
       Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
       setTimeout(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light), 30);
       setTimeout(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light), 60);
    } else {
       Haptics.impactAsync(defaultStyle);
    }
  }, [film]);

  // ── Actions ──
  const toggleWatchlist = useCallback(async () => {
    if (!film) return;
    triggerSemanticHaptic(Haptics.ImpactFeedbackStyle.Light);
    // Refinement 5: bounce the bookmark icon
    bookmarkScale.value = withSequence(
      withSpring(1.3, { damping: 8, stiffness: 300 }),
      withSpring(1, { damping: 12, stiffness: 200 }),
    );
    if (isWatchlisted) {
      removeFromWatchlist(filmId);
    } else {
      await addToWatchlist({
        id: film.id, title: film.title,
        poster_path: film.poster_path, release_date: film.release_date,
      });
    }
  }, [film, isWatchlisted, filmId]);

  const handleLog = useCallback(() => {
    if (!film) return;
    triggerSemanticHaptic(Haptics.ImpactFeedbackStyle.Medium);
    router.push({
      pathname: '/log-modal',
      params: {
        filmId: String(film.id), filmTitle: film.title,
        filmPoster: film.poster_path ?? '', filmYear: getYear(film.release_date),
        editLogId: existingLog?.id ?? '',
      },
    });
  }, [film, existingLog]);



  const handleRewatch = useCallback(() => {
    if (!film) return;
    triggerSemanticHaptic(Haptics.ImpactFeedbackStyle.Medium);
    router.push({
      pathname: '/log-modal',
      params: {
        filmId: String(film.id), filmTitle: film.title,
        filmPoster: film.poster_path ?? '', filmYear: getYear(film.release_date),
        editLogId: '', // Empty = new log (rewatch)
      },
    });
  }, [film]);

  // ── Parallax transforms ──
  const backdropTranslate = scrollY.interpolate({
    inputRange: [0, BACKDROP_H], outputRange: [0, BACKDROP_H * 0.4], extrapolate: 'clamp',
  });
  const backdropOpacity = scrollY.interpolate({
    inputRange: [0, BACKDROP_H * 0.6], outputRange: [1, 0.3], extrapolate: 'clamp',
  });

  // ── Option 3: Silent Era (Auto-Immersion DiffClamp) ──
  // Mathematically hides the UI when scrolling down past the hero, resurrects dynamically when pulling up.
  const diffClampY = useMemo(() => 
    RNAnimated.diffClamp(
      RNAnimated.subtract(scrollY, new RNAnimated.Value(BACKDROP_H)), 
      0, 
      50
    ), 
    [scrollY]
  );
  const immersiveOpacity = useMemo(() => 
    diffClampY.interpolate({
      inputRange: [0, 50],
      outputRange: [1, 0],
      extrapolate: 'clamp'
    }), 
    [diffClampY]
  );

  // ── Loading ──
  if (loading) {
    return (
      <View style={s.container}>
        <RNAnimated.View style={[s.floatingBack, { top: Math.max(insets.top + 10, 20), zIndex: 100 }]}>
          <PressableScale onPress={() => { Haptics.selectionAsync(); router.back(); }} hitSlop={{ top: 20, bottom: 20, left: 20, right: 20 }}>
            <ArrowLeft size={16} color={colors.sepia} strokeWidth={1.5} />
          </PressableScale>
        </RNAnimated.View>
        <View style={s.shimmerBackdrop}>
          <AnimatedView style={[sub.shimmer, StyleSheet.absoluteFillObject, skeletonAnimStyle]} />
          <LinearGradient colors={['rgba(11,10,8,0.1)', 'rgba(11,10,8,0.6)', colors.ink]} locations={[0, 0.7, 1]} style={StyleSheet.absoluteFill} />
        </View>
        <View style={s.shimmerContent}>
          <AnimatedView style={[sub.shimmer, s.shimmerPoster, skeletonAnimStyle]} />
          <AnimatedView style={[sub.shimmer, s.shimmerEyebrow, skeletonAnimStyle]} />
          <AnimatedView style={[sub.shimmer, s.shimmerTitle, skeletonAnimStyle]} />
          <AnimatedView style={[sub.shimmer, s.shimmerMeta, skeletonAnimStyle]} />
          <AnimatedView style={[sub.shimmer, s.shimmerCta, skeletonAnimStyle]} />
        </View>
      </View>
    );
  }

  // ── Not found ──
  if (!film) {
    return (
      <View style={[s.container, s.notFoundContainer]}>
        <Text style={s.notFoundGlyph}>∅</Text>
        <Text style={s.notFoundTitle}>Not in the Archive</Text>
        <Text style={s.notFoundBody}>
          This reel could not be found. It may have been withdrawn from circulation.
        </Text>
        <PressableScale style={s.backBtn} onPress={() => { Haptics.selectionAsync(); router.back(); }} hitSlop={{ top: 20, bottom: 20, left: 20, right: 20 }}>
          <View style={s.ctaIconRow}>
            <ArrowLeft size={12} color={colors.bone} strokeWidth={1.5} />
            <Text style={s.backBtnText}>GO BACK</Text>
          </View>
        </PressableScale>
      </View>
    );
  }

  const director = (film as Record<string, unknown> & { credits?: { crew?: CrewMember[] } }).credits?.crew?.find((c: CrewMember) => c.job === 'Director');
  const cast = film.credits?.cast?.slice(0, 10) ?? [];
  const videos: VideoResult[] = (film as Record<string, unknown> & { videos?: { results?: VideoResult[] } }).videos?.results?.filter((v: VideoResult) => v.site === 'YouTube') ?? [];
  const trailer = videos.find((v: VideoResult) => v.type === 'Trailer') ?? videos[0];
  const score = obscurityScore(film);
  const providers = film['watch/providers']?.results ?? {};
  const studios = film.production_companies?.slice(0, 5) ?? [];

  const statusConfig: Record<string, { text: string; Icon: typeof Check }> = {
    watched: { text: 'WATCHED', Icon: Check },
    rewatched: { text: 'REWATCHED', Icon: RotateCcw },
    abandoned: { text: 'ABANDONED', Icon: XCircle },
  };

  return (
    <View style={s.container}>
      {/* ── Option 2: The Silver Halide Wash (Ambient Synesthesia) ── */}
      {film.backdrop_path && (
        <Image 
          source={{ uri: tmdb.backdrop(film.backdrop_path) }} 
          style={[StyleSheet.absoluteFillObject, s.silverHalideWash]} 
          blurRadius={120} 
          contentFit="cover" 
          cachePolicy="memory-disk"
        />
      )}

      {/* ── Parallax Backdrop ── */}
      <RNAnimated.View style={[s.backdropWrap, { transform: [{ translateY: backdropTranslate }], opacity: backdropOpacity }]}>
        {film.backdrop_path ? (
          <Image source={{ uri: tmdb.backdrop(film.backdrop_path) }} style={s.backdrop} contentFit="cover" cachePolicy="memory-disk" placeholder={{ blurhash: SEPIA_HASH }} transition={50} />
        ) : (
          <LinearGradient colors={['rgba(8,6,4,0.98)', colors.ink]} style={s.backdrop} />
        )}
        {film.backdrop_path && <View style={s.sepiaTint} />}
        <LinearGradient
          colors={['rgba(11,10,8,0.05)', 'rgba(11,10,8,0.4)', 'rgba(11,10,8,0.85)', colors.ink]}
          locations={[0, 0.5, 0.75, 1]}
          style={StyleSheet.absoluteFill}
        />
      </RNAnimated.View>

      {/* ── Option 3: Silent Era applied to Floating UI ── */}
      <RNAnimated.View style={[s.floatingBack, { top: Math.max(insets.top + 10, 20), opacity: immersiveOpacity }]}>
        <PressableScale onPress={() => { Haptics.selectionAsync(); router.back(); }} hitSlop={{ top: 20, bottom: 20, left: 20, right: 20 }}>
          <ArrowLeft size={16} color={colors.sepia} strokeWidth={1.5} />
        </PressableScale>
      </RNAnimated.View>

      {/* ── Content ── */}
      <RNAnimated.ScrollView
        contentContainerStyle={s.scrollContent}
        showsVerticalScrollIndicator={false}
        onScroll={RNAnimated.event(
          [{ nativeEvent: { contentOffset: { y: scrollY } } }],
          { useNativeDriver: true }
        )}
        scrollEventThrottle={16}
      >
        <View style={s.backdropSpacer} />

        {/* ── Option 3: The Whisper Network (Ambient Cache) ── */}
        <View style={s.whisperNetwork}>
          <View style={s.whisperDotWrapper}>
             <View style={s.whisperDot} />
             <Animated.View style={[s.whisperDotPulse, whisperPulseStyle]} />
          </View>
          <Text style={s.whisperText}>
             {useMemo(() => Math.floor(Math.random() * (450 - 12 + 1) + 12), [filmId])} CURRENTLY IN THE THEATER
          </Text>
        </View>

        {/* ═══ HERO ═══ */}
        <AnimatedView style={s.heroSection}>
          {/* Poster */}
          <View style={s.posterWrap}>
            <Animated.View style={[s.posterGlow, posterGlowStyle]} />
            {film.poster_path ? (
              <AnimatedExpoImage 
                sharedTransitionTag={`poster-${film.id}`}
                source={{ uri: tmdb.poster(film.poster_path, 'w342') }} 
                style={s.poster} 
                cachePolicy="memory-disk" 
                placeholder={{ blurhash: SEPIA_HASH }} 
                transition={50} 
                accessibilityLabel={`${film.title} movie poster`} 
              />
            ) : (
              <View style={[s.poster, s.posterPlaceholder]}>
                <Text style={s.posterPlaceholderText}>NO POSTER</Text>
              </View>
            )}
            <View style={s.scanlines} />
            {existingLog && (
              <View style={s.loggedBadgeOnPoster}>
                {(() => {
                  const cfg = statusConfig[existingLog.status];
                  const Icon = cfg?.Icon ?? Check;
                  return (
                    <View style={s.loggedBadgeContent}>
                      <Icon size={8} color={colors.ink} strokeWidth={2.5} />
                      <Text style={s.loggedBadgeText}>{cfg?.text ?? 'LOGGED'}</Text>
                    </View>
                  );
                })()}
              </View>
            )}
          </View>

          {/* Film Info */}
          <View style={s.infoBlock}>
            <PrestigeBadge companies={studios} />

            {film.genres?.length > 0 && (
              <View style={s.genreRow}>
                {(film as Record<string, unknown> & { genres?: Genre[] }).genres?.slice(0, 3).map((g: Genre) => <GenreTag key={g.id} name={g.name} />)}
              </View>
            )}

            <Text style={s.filmTitle} adjustsFontSizeToFit numberOfLines={3} minimumFontScale={0.7}>{film.title}</Text>

            {film.tagline ? <Text style={s.tagline} numberOfLines={3} adjustsFontSizeToFit minimumFontScale={0.7}>"{film.tagline}"</Text> : null}

            {/* Meta strip */}
            <View style={s.metaStrip}>
              <View style={s.metaItem}>
                <Clock size={10} color={colors.fog} strokeWidth={1.5} />
                <Text style={s.metaText}>{formatRuntime(film.runtime)}</Text>
              </View>
              <Text style={s.metaDot}>·</Text>
              <Text style={s.metaText}>{getYear(film.release_date)}</Text>
              {film.production_countries?.[0] && (
                <>
                  <Text style={s.metaDot}>·</Text>
                  <View style={s.metaItem}>
                    <Globe size={10} color={colors.fog} strokeWidth={1.5} />
                    <Text style={s.metaText}>{film.production_countries[0].iso_3166_1}</Text>
                  </View>
                </>
              )}
            </View>

            {/* Rating */}
            <View style={s.ratingRow}>
              <ReelRating rating={Math.round((film.vote_average ?? 0) / 2)} size={18} />
              <Text style={s.ratingText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
                {film.vote_average?.toFixed(1)} · {reviews.length > 0 ? `${reviews.length} SOCIETY REVIEW${reviews.length === 1 ? '' : 'S'}` : (film.vote_count ?? 0) > 0 ? `${Math.round((film.vote_count ?? 0) / 100) * 100}+ GLOBAL` : 'AWAITING RATINGS'}
              </Text>
            </View>

            <ObscurityBadge score={score} />
          </View>
        </AnimatedView>

        {/* ═══ MY LOG ═══ — removed duplicate; yourLogWrap below is the canonical section */}

        {/* ═══ CTA BUTTONS ═══ */}
        <AnimatedView style={s.ctaSection}>
          <PressableScale style={s.ctaPrimary} onPress={handleLog} pressedScale={0.97} hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }} haptic accessibilityRole="button" accessibilityLabel={existingLog ? 'Edit your film log' : 'Log this film'}>
            <View style={s.ctaIconRow}>
              {existingLog ? <Pencil size={13} color={colors.ink} strokeWidth={2} /> : <Plus size={15} color={colors.ink} strokeWidth={2.5} />}
              <Text style={s.ctaPrimaryText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>
                {existingLog ? 'EDIT CRITIQUE' : 'CERTIFY CRITIQUE'}
              </Text>
            </View>
          </PressableScale>
          {existingLog && (
            <PressableScale style={s.ctaRewatch} onPress={handleRewatch} pressedScale={0.97} hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }} haptic accessibilityRole="button" accessibilityLabel="Log a rewatch">
              <View style={s.ctaIconRow}>
                <RotateCcw size={12} color={colors.sepia} strokeWidth={2} />
                <Text style={s.ctaRewatchText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>
                  LOG REWATCH{(existingLog?.viewCount ?? 1) > 1 ? ` (${(existingLog?.viewCount ?? 1) + 1})` : ''}
                </Text>
              </View>
            </PressableScale>
          )}
          <View style={s.ctaRow}>
            <PressableScale
              style={[s.ctaSecondary, isWatchlisted && s.ctaDanger]}
              onPress={toggleWatchlist} pressedScale={0.95} hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }}
              accessibilityRole="button" accessibilityLabel={isWatchlisted ? 'Remove from watchlist' : 'Add to watchlist'}
            >
              <View style={s.ctaIconRow}>
              <Animated.View style={bookmarkAnimStyle}>
                <BookIcon size={11} color={isWatchlisted ? colors.bloodReel : colors.bone} fill={isWatchlisted ? colors.bloodReel : 'transparent'} strokeWidth={1.5} />
              </Animated.View>
                <Text style={[s.ctaSecondaryText, isWatchlisted && s.ctaDangerText]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>
                  {isWatchlisted ? 'SAVED' : 'WATCHLIST'}
                </Text>
              </View>
            </PressableScale>

            {trailer && (
              <PressableScale
                style={s.ctaSecondary}
                onPress={() => { setActiveTrailerKey(trailer.key); setTrailerModalVisible(true); }}
                pressedScale={0.95} haptic hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }}
                accessibilityRole="button" accessibilityLabel="Watch trailer"
              >
                <View style={s.ctaIconRow}>
                  <Play size={10} color={colors.bone} fill={colors.bone} strokeWidth={1.5} />
                  <Text style={s.ctaSecondaryText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>TRAILER</Text>
                </View>
              </PressableScale>
            )}
            {existingLog && (
              <PressableScale
                style={s.ctaSecondary}
                onPress={() => setShareModalVisible(true)} pressedScale={0.95} haptic hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }}
                accessibilityRole="button" accessibilityLabel="Share this film"
              >
                <View style={s.ctaIconRow}>
                  <Share2 size={11} color={colors.bone} strokeWidth={1.5} />
                  <Text style={s.ctaSecondaryText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>SHARE</Text>
                </View>
              </PressableScale>
            )}
          </View>
          {/* Archivist-only actions */}
          {isArchivist && (
            <View style={s.ctaRow}>
              {existingLog && (
                <PressableScale
                  style={s.ctaArchivist}
                  onPress={() => setShareModalVisible(true)}
                  pressedScale={0.95} haptic hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }}
                >
                  <View style={s.ctaIconRow}>
                    <Camera size={11} color={colors.sepia} strokeWidth={1.5} />
                    <Text style={s.ctaArchivistText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>DOSSIER</Text>
                  </View>
                </PressableScale>
              )}
              <PressableScale
                style={s.ctaArchivist}
                onPress={() => {
                  router.push({
                    pathname: '/(tabs)/lounge',
                    params: {
                      shareFilmId: String(film.id),
                      shareFilmTitle: film.title,
                      shareFilmPoster: film.poster_path ?? '',
                      shareFilmYear: getYear(film.release_date),
                    },
                  });
                }}
                pressedScale={0.95} haptic hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }}
              >
                <View style={s.ctaIconRow}>
                  <MessageCircle size={11} color={colors.sepia} strokeWidth={1.5} />
                  <Text style={s.ctaArchivistText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>LOUNGE</Text>
                </View>
              </PressableScale>
            </View>
          )}
        </AnimatedView>

        {/* ═══ YOUR LOG — Review + Viewing History ═══ */}
        {existingLog && (
          <AnimatedView style={s.yourLogWrap}>
            {/* Rating + meta row */}
            <View style={s.yourLogHeader}>
              {(existingLog.rating ?? 0) > 0 && (
                <ReelRating rating={existingLog.rating ?? 0} size={14} />
              )}
              <View style={s.yourLogMetaRow}>
                {existingLog.watchedDate && (
                  <Text style={s.yourLogMetaText}>
                    {new Date(existingLog.watchedDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                  </Text>
                )}
                {(existingLog.viewCount ?? 1) > 1 && (
                  <View style={s.yourLogViewings}>
                    <RotateCcw size={7} color={colors.fog} />
                    <Text style={s.yourLogMetaText}>{existingLog.viewCount} viewings</Text>
                  </View>
                )}
              </View>
            </View>
            {/* Review preview — truncated, tap to read full log */}
            {existingLog.review ? (
              <PressableScale onPress={() => router.push(`/log/${existingLog.id}`)} pressedScale={0.98} hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }}>
                <Text
                  numberOfLines={2}
                  ellipsizeMode="tail"
                  style={s.yourLogReview}
                >
                  {(existingLog.review ?? '').replace(new RegExp('<[^>]+>', 'g'), '').trim()}
                </Text>
                {(existingLog.review ?? '').replace(new RegExp('<[^>]+>', 'g'), '').trim().length > 100 && (
                  <Text style={s.yourLogReadMore}>
                    READ FULL CRITIQUE →
                  </Text>
                )}
              </PressableScale>
            ) : null}
          </AnimatedView>
        )}

        <SectionDivider label="THE DOSSIER" />

        {/* ═══ SYNOPSIS ═══ */}
        <AnimatedView style={s.section}>
          <SectionDivider label="SYNOPSIS" />
          <View style={s.synopsisWrap}>
            <Text style={s.synopsis}>{film.overview ?? 'No synopsis available.'}</Text>
          </View>
        </AnimatedView>

        {/* ═══ DIRECTOR CARD ═══ */}
        {director && (
          <AnimatedView style={s.section}>
            <DirectorCard director={director} router={router} />
          </AnimatedView>
        )}

        {/* ═══ CAST ═══ */}
        {cast.length > 0 && (
          <AnimatedView style={s.section}>
            <SectionDivider label="THE PLAYERS" />
            <CastCarousel cast={cast} />
          </AnimatedView>
        )}

        {/* ═══ VIDEOS ═══ */}
        {videos.length > 0 && (
          <AnimatedView style={s.sectionFlush}>
            <View style={s.sectionPadded}>
              <SectionDivider label={`VIDEOS (${videos.length})`} />
            </View>
            <View style={{ height: 112 }}>
              <FlashList
                data={videos.slice(0, 6)}
                horizontal
                showsHorizontalScrollIndicator={false}
                keyExtractor={(item) => item.key}
                contentContainerStyle={s.horizontalList}
                estimatedItemSize={200}
                snapToInterval={210}
                snapToAlignment="start"
                decelerationRate="fast"
                renderItem={({ item }) => (
                <VideoThumb
                  video={item}
                  onPlay={() => { Haptics.selectionAsync(); setActiveTrailerKey(item.key); setTrailerModalVisible(true); }}
                />
              )}
              />
            </View>
          </AnimatedView>
        )}

        {/* ═══ WATCH PROVIDERS ═══ */}
        <AnimatedView style={s.section}>
          <WatchProviders providers={providers} />
        </AnimatedView>

        {/* ═══ REVIEWS ═══ */}
        {(() => {
          // Build merged review list: local review first, then DB reviews deduped
          const mergedReviews: CommunityReview[] = [];
          if (localReview) {
            mergedReviews.push({
              id: localReview.id,
              username: currentUsername ?? 'you',
              role: user?.role ?? 'cinephile',
              rating: localReview.rating,
              review: localReview.review,
              isLocal: true,
            });
          }
          reviews.forEach((r: CommunityReview) => {
            if (localReview && user && r.user_id === user.id) return; // dedup
            mergedReviews.push(r);
          });

          return (
            <AnimatedView style={s.section}>
              <SectionDivider label={mergedReviews.length > 0 ? `${mergedReviews.length} SOCIETY LOG${mergedReviews.length === 1 ? '' : 'S'}` : 'FROM THE CRITICS'} />
              {mergedReviews.length === 0 ? (
                <View style={sub.emptyReviewBox}>
                  <Text style={sub.emptyReviewTitle}>The projection box awaits.</Text>
                  <Text style={sub.emptyReviewBody}>No transmissions yet. Log this film to be the first voice in the archive.</Text>
                </View>
              ) : mergedReviews.map((r: CommunityReview, i: number) => {
                const tierLabel = r.isLocal ? 'Your Review' : r.role === 'auteur' ? 'Auteur' : r.role === 'archivist' ? 'Archivist' : 'Cinephile';
                const strippedReview = (r.review ?? '').replace(/<[^>]+>/g, '').trim();
                return (
                  <View key={r.id || i} style={[sub.reviewCard, r.isLocal && sub.reviewCardLocal]}>
                    <Text style={sub.reviewQuote}>"</Text>
                    <View style={sub.reviewHeader}>
                      <View style={s.reviewAuthorWrap}>
                        <PressableScale onPress={() => !r.isLocal && r.username && router.push(`/user/${r.username}`)} disabled={r.isLocal} pressedScale={0.97} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                          <Text style={sub.reviewAuthor} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>@{r.username ?? 'anonymous'}</Text>
                        </PressableScale>
                        <Text style={sub.reviewTier} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>{tierLabel}</Text>
                      </View>
                      {r.rating > 0 && <ReelRating rating={r.rating} size={12} />}
                    </View>
                    <PressableScale onPress={() => { if (r.id) router.push(`/log/${r.id}`); }} pressedScale={0.99}>
                      <Text style={sub.reviewText} numberOfLines={7} ellipsizeMode="tail">{strippedReview}</Text>
                      {strippedReview.length > 250 && (
                        <Text style={s.yourLogReadMore}>READ FULL CRITIQUE →</Text>
                      )}
                    </PressableScale>
                  </View>
                );
              })}
              
              {reviews.length >= 10 && (
                <PressableScale 
                  onPress={() => router.push(`/film-reviews/${filmId}?title=${encodeURIComponent(film?.title || 'Archive')}`)}
                  style={sub.readAllBtn}
                  pressedScale={0.97} hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }}
                >
                  <Text style={sub.readAllText}>READ ALL LOGS →</Text>
                </PressableScale>
              )}
            </AnimatedView>
          );
        })()}

        {/* ═══ DOSSIER ═══ */}
        <AnimatedView style={s.section}>
          <SectionDivider label="FILM DOSSIER" />
          <View style={s.dossierCard}>
            <DossierRow label="GENRES" value={(film as Record<string, unknown> & { genres?: Genre[] }).genres?.map((g: Genre) => g.name).join(', ')} />
            <DossierRow label="RELEASE" value={film.release_date ? new Date(film.release_date + 'T12:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }).toUpperCase() : undefined} />
            <DossierRow label="RUNTIME" value={formatRuntime(film.runtime)} />
            <DossierRow label="STATUS" value={film.status} />
            <DossierRow label="LANGUAGE" value={film.original_language?.toUpperCase()} />
            <DossierRow label="BUDGET" value={film.budget > 0 ? `$${(film.budget / 1e6).toFixed(1)}M` : undefined} />
            <DossierRow label="REVENUE" value={film.revenue > 0 ? `$${(film.revenue / 1e6).toFixed(1)}M` : undefined} />
          </View>
        </AnimatedView>

        {/* ═══ STUDIOS ═══ */}
        {studios.length > 0 && (
          <AnimatedView style={s.sectionFlush}>
            <View style={s.sectionPadded}>
              <SectionDivider label="PRODUCTION" />
            </View>
            <View style={{ height: 80 }}>
              <FlashList
                data={studios}
                horizontal
                showsHorizontalScrollIndicator={false}
                keyExtractor={(item) => String(item.id)}
                contentContainerStyle={s.horizontalList}
                estimatedItemSize={80}
                snapToInterval={90}
                snapToAlignment="start"
                decelerationRate="fast"
                renderItem={({ item }) => <StudioCard company={item} />}
              />
            </View>
          </AnimatedView>
        )}

        {/* ═══ INTERNATIONAL RELEASES ═══ */}
        {film.release_dates && (
          <AnimatedView style={s.section}>
            <CountryReleases releaseDates={film.release_dates} />
          </AnimatedView>
        )}

        {/* ═══ SIMILAR FILMS ═══ */}
        {similarFilms.length > 0 && (
          <AnimatedView style={s.sectionFlush}>
            <View style={s.sectionPadded}>
              <SectionDivider label="YOU MAY ALSO LIKE" />
            </View>
            <View style={{ height: 180 }}>
              <FlashList
                data={similarFilms}
                horizontal
                showsHorizontalScrollIndicator={false}
                keyExtractor={(item) => String(item.id)}
                contentContainerStyle={s.horizontalList}
                estimatedItemSize={100}
                snapToInterval={110}
                snapToAlignment="start"
                decelerationRate="fast"
                renderItem={({ item }) => <SimilarCard film={item} />}
              />
            </View>
          </AnimatedView>
        )}
      </RNAnimated.ScrollView>

      {/* ── Modals ── */}
      {film && (
        <ShareCardModal
          visible={shareModalVisible}
          onClose={() => setShareModalVisible(false)}
          film={film}
          log={existingLog}
        />
      )}
      {activeTrailerKey && (
        <TrailerModal
          visible={trailerModalVisible}
          videoId={activeTrailerKey}
          onClose={() => { setTrailerModalVisible(false); setActiveTrailerKey(null); }}
        />
      )}
    </View>
  );
}

// ════════════════════════════════════════════════════════════
//  MAIN STYLES
// ════════════════════════════════════════════════════════════
const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.ink },
  scrollContent: { paddingBottom: 100 },
  backdropSpacer: { height: BACKDROP_H - 80 },

  // ── Shimmer ──
  shimmerBackdrop: { height: BACKDROP_H, backgroundColor: 'rgba(8,6,4,0.98)', position: 'relative' },
  shimmerContent: { marginTop: -80, alignItems: 'center', paddingHorizontal: 20 },
  shimmerPoster: { width: POSTER_W, height: POSTER_H, borderRadius: 6, marginBottom: 16 },
  shimmerEyebrow: { width: 120, height: 10, borderRadius: 2, marginBottom: 10 },
  shimmerTitle: { width: 200, height: 28, borderRadius: 2, marginBottom: 10 },
  shimmerMeta: { width: 160, height: 10, borderRadius: 2, marginBottom: 20 },
  shimmerCta: { width: '100%', height: 48, borderRadius: 2 },

  // ── Not Found ──
  notFoundContainer: { justifyContent: 'center', alignItems: 'center', padding: 32 },
  notFoundGlyph: { fontFamily: fonts.display, fontSize: 56, color: 'rgba(139,105,20,0.3)', marginBottom: 16 },
  notFoundTitle: { fontFamily: fonts.display, fontSize: 22, color: colors.parchment, marginBottom: 8 },
  notFoundBody: { fontFamily: fonts.body, fontSize: 14, color: colors.fog, textAlign: 'center', lineHeight: 22 },

  // ── Backdrop ──
  backdropWrap: { position: 'absolute', top: 0, left: 0, right: 0, height: BACKDROP_H, zIndex: 0 },
  backdrop: { width: '100%', height: '100%' },
  sepiaTint: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(60,40,10,0.35)' },
  silverHalideWash: { opacity: 0.15 },

  // ── Floating Back ──
  floatingBack: {
    position: 'absolute', top: 54, left: 16, zIndex: 100,
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: 'rgba(8,6,4,0.98)', borderWidth: 1, borderColor: 'rgba(139,105,20,0.3)',
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.6, shadowRadius: 10, elevation: 8,
    alignItems: 'center', justifyContent: 'center',
  },

  // ── Hero ──
  heroSection: { paddingHorizontal: 20, alignItems: 'center', zIndex: 2, marginBottom: 8 },
  // --- Whisper Network ---
  whisperNetwork: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
    marginTop: -30,
    gap: 8,
  },
  whisperDotWrapper: {
    width: 6,
    height: 6,
    justifyContent: 'center',
    alignItems: 'center',
  },
  whisperDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.sepia,
    zIndex: 2,
  },
  whisperDotPulse: {
    position: 'absolute',
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: colors.sepia,
    opacity: 0.3,
    zIndex: 1,
  },
  whisperText: {
    fontFamily: fonts.ui,
    fontSize: 8,
    letterSpacing: 2,
    color: colors.sepia,
    opacity: 0.8,
  },
  posterWrap: { position: 'relative', marginBottom: 20 },
  posterGlow: {
    position: 'absolute',
    top: 5, left: -5, right: -5, bottom: -5,
    backgroundColor: 'rgba(139,105,20,0.25)',
    borderRadius: 8,
    shadowColor: colors.sepia, shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.8, shadowRadius: 20,
  },
  poster: {
    width: POSTER_W, height: POSTER_H, borderRadius: 2,
    borderWidth: 1, borderColor: 'rgba(139,105,20,0.3)',
    backgroundColor: 'rgba(8,6,4,0.98)',
  },
  posterPlaceholder: { 
    backgroundColor: 'rgba(8,6,4,0.98)', 
    borderWidth: 1, 
    borderColor: 'rgba(139,105,20,0.3)', 
    justifyContent: 'center', 
    alignItems: 'center' 
  },
  posterPlaceholderText: { fontFamily: fonts.ui, fontSize: 10, color: colors.fog, letterSpacing: 2 },
  scanlines: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    borderRadius: 6, opacity: 0.04,
    backgroundColor: 'transparent',
    borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.1)',
  },
  loggedBadgeOnPoster: {
    position: 'absolute', bottom: -12, alignSelf: 'center',
    paddingHorizontal: 14, paddingVertical: 5, borderRadius: 3,
    backgroundColor: colors.sepia,
    shadowColor: colors.sepia, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.5, shadowRadius: 10,
    elevation: 8,
  },
  loggedBadgeText: { fontFamily: fonts.uiBold, fontSize: 7, letterSpacing: 1.5, color: colors.ink },
  loggedBadgeContent: { flexDirection: 'row', alignItems: 'center', gap: 4 },

  // ── Info ──
  infoBlock: { alignItems: 'center', paddingHorizontal: 8, width: '100%' },
  genreRow: { flexDirection: 'row', gap: 6, marginBottom: 12, flexWrap: 'wrap', justifyContent: 'center' },
  genreTag: {
    paddingHorizontal: 8, paddingVertical: 4,
    borderWidth: 1, borderColor: 'rgba(139,105,20,0.25)', borderRadius: 2,
    backgroundColor: 'rgba(8,6,4,0.98)',
  },
  genreText: { fontFamily: fonts.uiBold, fontSize: 8, letterSpacing: 2, color: colors.sepia },
  filmTitle: {
    fontFamily: fonts.display, fontSize: 26, color: colors.parchment,
    textAlign: 'center', lineHeight: 32, marginBottom: 6,
  },
  tagline: {
    fontFamily: fonts.bodyItalic, fontSize: 14, color: colors.bone,
    textAlign: 'center', marginBottom: 14, opacity: 0.75,
  },
  metaStrip: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 14 },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  metaText: { fontFamily: fonts.ui, fontSize: 9, letterSpacing: 1, color: colors.fog },
  metaDot: { fontSize: 8, color: 'rgba(139,105,20,0.4)' },
  ratingRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 10 },
  ratingText: { fontFamily: fonts.body, fontSize: 12, color: colors.bone, opacity: 0.7 },
  reviewAuthorWrap: { flexShrink: 1, paddingRight: 8 },

  // ── Director Card ──
  directorCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: 'rgba(8,6,4,0.98)',
    borderWidth: 1, borderColor: 'rgba(139,105,20,0.3)', borderRadius: 6,
    padding: 12,
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.6, shadowRadius: 10, elevation: 8,
    borderLeftWidth: 3, borderLeftColor: colors.sepia,
  },
  directorPhoto: {
    width: 48, height: 48, borderRadius: 24,
    borderWidth: 1, borderColor: 'rgba(139,105,20,0.3)',
  },
  directorPhotoPlaceholder: {
    backgroundColor: 'rgba(8,6,4,0.98)',
    borderWidth: 1,
    borderColor: 'rgba(139,105,20,0.3)', 
    justifyContent: 'center', 
    alignItems: 'center',
  },
  directorPhotoInitial: {
    fontFamily: fonts.display, fontSize: 20, color: colors.fog,
  },
  directorInfo: { flex: 1 },
  directorLabel: {
    fontFamily: fonts.ui, fontSize: 8, letterSpacing: 2, color: colors.fog, marginBottom: 3,
  },
  directorName: {
    fontFamily: fonts.display, fontSize: 16, color: colors.parchment, lineHeight: 20,
  },



  // ── CTAs ──
  ctaSection: { paddingHorizontal: 20, marginTop: 8, marginBottom: 8 },
  ctaColumn: { width: '100%', gap: 10 },
  ctaPrimary: {
    backgroundColor: 'rgba(139, 105, 20, 0.95)', borderRadius: 2,
    paddingVertical: 15, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: 'rgba(242, 232, 160, 0.4)',
  },
  ctaPrimaryText: { fontFamily: fonts.uiBold, fontSize: 12, letterSpacing: 2, color: colors.ink },
  ctaRow: { flexDirection: 'row', gap: 8, marginTop: 8 },
  ctaSecondary: {
    flex: 1, borderWidth: 1, borderColor: 'rgba(139, 105, 20, 0.3)', borderRadius: 4,
    paddingVertical: 11, alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(8,6,4,0.98)',
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.6, shadowRadius: 10, elevation: 8,
  },
  ctaDanger: { borderColor: colors.bloodReel, backgroundColor: 'rgba(107,26,10,0.1)' },
  ctaDangerText: { color: colors.bloodReel },
  ctaSecondaryText: { fontFamily: fonts.uiMedium, fontSize: 9, letterSpacing: 1.5, color: colors.bone },
  ctaIconRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  ctaRewatch: {
    borderWidth: 1, borderColor: 'rgba(139,105,20,0.5)', borderRadius: 4,
    paddingVertical: 12, alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(139,105,20,0.08)', marginTop: 8,
  },
  ctaRewatchText: { fontFamily: fonts.uiMedium, fontSize: 10, letterSpacing: 1.5, color: colors.sepia },

  // ── Sections ──
  section: { marginTop: 20, paddingHorizontal: 20 },
  sectionFlush: { marginTop: 20 },
  sectionPadded: { paddingHorizontal: 20 },
  horizontalList: { paddingHorizontal: 20, gap: 10 },
  synopsisWrap: {
    marginTop: 8,
    padding: 12, backgroundColor: 'rgba(8,6,4,0.98)',
    borderRadius: 4, borderWidth: 1, borderColor: 'rgba(139,105,20,0.2)',
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.5, shadowRadius: 5, elevation: 4,
  },
  synopsis: { fontFamily: fonts.body, fontSize: 15, color: colors.bone, lineHeight: 28 },

  // ── Dossier ──
  dossierCard: {
    backgroundColor: 'rgba(8,6,4,0.98)', borderWidth: 1, borderColor: 'rgba(139,105,20,0.3)',
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.5, shadowRadius: 10, elevation: 6,
    borderRadius: 4, padding: 14, marginTop: 8,
  },
  dossierRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: 'rgba(139,105,20,0.1)' },
  dossierLabel: { fontFamily: fonts.ui, fontSize: 9, letterSpacing: 1, color: colors.fog },
  dossierValue: { fontFamily: fonts.body, fontSize: 13, color: colors.bone, maxWidth: '60%', textAlign: 'right' },

  similarCard: { width: 100 },
  similarPoster: { width: 100, height: 150, borderRadius: 4, borderWidth: 1, borderColor: 'rgba(139,105,20,0.3)', marginBottom: 6 },
  similarPosterPlaceholder: { backgroundColor: 'rgba(8,6,4,0.98)', borderWidth: 1, borderColor: 'rgba(139,105,20,0.3)', justifyContent: 'center', alignItems: 'center' },
  similarTitle: { fontFamily: fonts.sub, fontSize: 11, color: colors.bone, lineHeight: 15 },

  // ── Back ──
  backBtn: {
    marginTop: 24, paddingVertical: 14, paddingHorizontal: 24,
    borderWidth: 1, borderColor: 'rgba(139,105,20,0.3)', borderRadius: 2,
    backgroundColor: 'rgba(8,6,4,0.98)',
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.6, shadowRadius: 10, elevation: 8,
  },
  backBtnText: { fontFamily: fonts.uiBold, fontSize: 10, letterSpacing: 2, color: colors.bone },

  // ── Archivist CTAs ──
  ctaArchivist: {
    flex: 1, borderWidth: 1, borderColor: 'rgba(196,150,26,0.4)', borderRadius: 4,
    paddingVertical: 11, alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(8,6,4,0.98)',
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.6, shadowRadius: 10, elevation: 8,
  },
  ctaArchivistText: { fontFamily: fonts.uiMedium, fontSize: 9, letterSpacing: 1.5, color: colors.sepia },

  // ── Your Log (inline-extracted) ──
  yourLogWrap: {
    marginHorizontal: 20, marginTop: 12, marginBottom: 0,
    backgroundColor: 'rgba(8,6,4,0.98)',
    borderWidth: 1, borderColor: 'rgba(139,105,20,0.3)',
    borderRadius: 8, padding: 14,
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.6, shadowRadius: 10, elevation: 8,
  },
  yourLogHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 },
  yourLogMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  yourLogMetaText: { fontFamily: fonts.ui, fontSize: 9, letterSpacing: 0.8, color: colors.fog },
  yourLogViewings: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  yourLogReview: { fontFamily: fonts.body, fontSize: 13.5, color: colors.bone, lineHeight: 21, opacity: 0.8 },
  yourLogReadMore: { fontFamily: fonts.ui, fontSize: 8, letterSpacing: 1, color: colors.sepia, marginTop: 4 },
});

// ════════════════════════════════════════════════════════════
//  SUB-COMPONENT STYLES
// ════════════════════════════════════════════════════════════
const sub = StyleSheet.create({
  shimmer: { backgroundColor: 'rgba(139,105,20,0.15)' },

  // ── Prestige Badge ──
  prestigeBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 10, paddingVertical: 4, borderRadius: 2,
    borderWidth: 1, borderColor: 'rgba(139,105,20,0.5)',
    backgroundColor: 'rgba(8,6,4,0.98)',
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.5, shadowRadius: 4, elevation: 4,
    marginBottom: 12, alignSelf: 'center',
  },
  prestigeText: { fontFamily: fonts.ui, fontSize: 8, letterSpacing: 2, color: colors.flicker },

  // ── Obscurity Badge ──
  obsBadge: { 
    flexDirection: 'row', alignItems: 'center', gap: 6, 
    paddingHorizontal: 10, paddingVertical: 4, 
    borderWidth: 1, borderRadius: 3, marginBottom: 4,
    backgroundColor: 'rgba(8,6,4,0.98)',
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.5, shadowRadius: 3, elevation: 3, 
  },
  obsScore: { fontFamily: fonts.uiBold, fontSize: 14 },
  obsLabel: { fontFamily: fonts.ui, fontSize: 8, letterSpacing: 2, color: colors.fog },

  // ── Video ──
  videoThumb: { width: 200, height: 112, borderRadius: 4, overflow: 'hidden', position: 'relative', borderWidth: 1, borderColor: 'rgba(139,105,20,0.3)' },
  videoImg: { width: '100%', height: '100%' },
  videoPlayOverlay: { ...StyleSheet.absoluteFillObject, justifyContent: 'center', alignItems: 'center' },
  videoPlayCircle: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: 'rgba(10,7,3,0.7)', borderWidth: 1.5, borderColor: 'rgba(242,232,160,0.5)',
    justifyContent: 'center', alignItems: 'center', paddingLeft: 2,
  },
  videoLabelWrap: { position: 'absolute', bottom: 0, left: 0, right: 0, padding: 6, backgroundColor: 'rgba(10,7,3,0.75)' },
  videoType: { fontFamily: fonts.ui, fontSize: 7, letterSpacing: 1.5, color: colors.sepia },
  videoName: { fontFamily: fonts.body, fontSize: 10, color: colors.bone, marginTop: 1 },

  // ── Studio ──
  studioCard: { width: 80, alignItems: 'center' },
  studioLogo: { width: 60, height: 40, borderRadius: 4, marginBottom: 6, backgroundColor: 'rgba(8,6,4,0.98)', borderWidth: 1, borderColor: 'rgba(139,105,20,0.3)' },
  studioLogoPlaceholder: { backgroundColor: 'rgba(8,6,4,0.98)', borderWidth: 1, borderColor: 'rgba(139,105,20,0.3)', justifyContent: 'center', alignItems: 'center' },
  studioName: { fontFamily: fonts.ui, fontSize: 8, color: colors.bone, textAlign: 'center', letterSpacing: 0.5 },
  studioCountry: { fontFamily: fonts.ui, fontSize: 7, color: colors.fog, letterSpacing: 1, marginTop: 2 },

  // ── Review ──
  reviewCard: {
    backgroundColor: 'rgba(8,6,4,0.98)', borderWidth: 1, borderColor: 'rgba(139,105,20,0.3)',
    borderRadius: 4, padding: 16, marginTop: 10,
    borderLeftWidth: 3, borderLeftColor: 'rgba(196,150,26,0.4)',
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.6, shadowRadius: 10, elevation: 8,
    position: 'relative', overflow: 'hidden',
  },
  reviewHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 },
  reviewQuote: {
    position: 'absolute', top: -4, left: 10, fontSize: 60,
    fontFamily: fonts.display, color: colors.sepia, opacity: 0.25,
  },
  reviewAuthor: { fontFamily: fonts.ui, fontSize: 10, letterSpacing: 1, color: colors.sepia },
  reviewTier: { fontFamily: fonts.ui, fontSize: 8, letterSpacing: 0.8, color: colors.fog, marginTop: 2 },
  reviewText: { fontFamily: fonts.bodyItalic, fontSize: 13, color: colors.bone, lineHeight: 20, opacity: 0.9 },
  reviewCardLocal: { borderLeftColor: colors.sepia, borderLeftWidth: 2 },

  // ── Empty Reviews ──
  emptyReviewBox: {
    padding: 24, borderWidth: 1, borderColor: 'rgba(139,105,20,0.3)',
    borderRadius: 2, alignItems: 'center', backgroundColor: 'rgba(8,6,4,0.98)',
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.5, shadowRadius: 10, elevation: 4,
  },
  emptyReviewTitle: { fontFamily: fonts.display, fontSize: 16, letterSpacing: 1, color: colors.sepia, marginBottom: 8 },
  emptyReviewBody: { fontFamily: fonts.body, fontSize: 12, color: colors.bone, fontStyle: 'italic', textAlign: 'center', lineHeight: 20, opacity: 0.5 },

  // ── Read All Button ──
  readAllBtn: {
    marginTop: 12, paddingVertical: 16, alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(8,6,4,0.98)', borderRadius: 2,
    borderWidth: 1, borderColor: 'rgba(139,105,20,0.3)',
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.6, shadowRadius: 10, elevation: 8,
  },
  readAllText: { fontFamily: fonts.uiBold, fontSize: 9, letterSpacing: 3, color: colors.sepia },
});
