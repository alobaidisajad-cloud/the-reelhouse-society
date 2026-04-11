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
import { useEffect, useState, useRef, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Image,
  Dimensions, Animated as RNAnimated, Linking, FlatList,
} from 'react-native';
import Animated, { FadeInDown, FadeInUp, FadeIn } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { tmdb, formatRuntime, getYear, obscurityScore } from '@/src/lib/tmdb';
import { useFilmStore } from '@/src/stores/films';
import { useAuthStore } from '@/src/stores/auth';
import { supabase } from '@/src/lib/supabase';
import { colors, fonts, typography, spacing, effects } from '@/src/theme/theme';
import { ReelRating, SectionDivider } from '@/src/components/Decorative';
import { WatchProviders } from '@/src/components/film/WatchProviders';
import { ShareCardModal } from '@/src/components/film/ShareCardModal';
import { CastCarousel } from '@/src/components/film/CastCarousel';
import { TrailerModal } from '@/src/components/film/TrailerModal';
import CountryReleases from '@/src/components/film/CountryReleases';
import {
  Clock, Globe, ArrowLeft, Eye, Play, Pencil, Plus,
  Bookmark as BookIcon, Share2, RotateCcw, XCircle, Check,
  ArrowUpRight, Film as FilmIcon, Camera, MessageCircle, History,
} from 'lucide-react-native';

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');
const BACKDROP_H = SCREEN_H * 0.48;
const POSTER_W = 140;
const POSTER_H = POSTER_W * 1.5;
const AnimatedView = Animated.createAnimatedComponent(View);

// ── Prestige Labels ─────────────────────────────────────────
const PRESTIGE_STUDIOS = ['A24', 'NEON', 'MUBI', 'Criterion', 'Janus Films', 'Oscilloscope', 'Kino Lorber'];

function PrestigeBadge({ companies }: { companies: any[] }) {
  const match = companies?.find((c: any) => PRESTIGE_STUDIOS.some(p => c.name?.includes(p)));
  if (!match) return null;
  return (
    <View style={sub.prestigeBadge}>
      <FilmIcon size={8} color={colors.flicker} strokeWidth={1.5} />
      <Text style={sub.prestigeText}>{match.name.toUpperCase()}</Text>
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
      <Text style={[sub.obsScore, { color }]}>{score}</Text>
      <Text style={sub.obsLabel}>{label}</Text>
    </View>
  );
}

// ── Genre Tag ───────────────────────────────────────────────
function GenreTag({ name }: { name: string }) {
  return (
    <View style={s.genreTag}>
      <Text style={s.genreText}>{name.toUpperCase()}</Text>
    </View>
  );
}

// ── Video Thumbnail ─────────────────────────────────────────
function VideoThumb({ video, onPlay }: { video: any; onPlay: () => void }) {
  const thumb = `https://img.youtube.com/vi/${video.key}/mqdefault.jpg`;
  return (
    <TouchableOpacity style={sub.videoThumb} onPress={onPlay} activeOpacity={0.7}>
      <Image source={{ uri: thumb }} style={sub.videoImg} resizeMode="cover" />
      <View style={sub.videoPlayOverlay}>
        <View style={sub.videoPlayCircle}>
          <Play size={14} color={colors.parchment} fill={colors.parchment} />
        </View>
      </View>
      <View style={sub.videoLabelWrap}>
        <Text style={sub.videoType}>{video.type?.toUpperCase() || 'VIDEO'}</Text>
        <Text style={sub.videoName} numberOfLines={1}>{video.name}</Text>
      </View>
    </TouchableOpacity>
  );
}

// ── Production Studio ───────────────────────────────────────
function StudioCard({ company }: { company: any }) {
  const logoUri = company.logo_path ? `https://image.tmdb.org/t/p/w92${company.logo_path}` : null;
  return (
    <View style={sub.studioCard}>
      {logoUri ? (
        <Image source={{ uri: logoUri }} style={sub.studioLogo} resizeMode="contain" />
      ) : (
        <View style={[sub.studioLogo, sub.studioLogoPlaceholder]}>
          <FilmIcon size={10} color={colors.fog} strokeWidth={1} />
        </View>
      )}
      <Text style={sub.studioName} numberOfLines={2}>{company.name}</Text>
      {company.origin_country && <Text style={sub.studioCountry}>{company.origin_country}</Text>}
    </View>
  );
}

// ── Similar Film Card ───────────────────────────────────────
function SimilarCard({ film }: { film: any }) {
  const router = useRouter();
  const posterUri = film.poster_path ? tmdb.poster(film.poster_path) : null;
  return (
    <TouchableOpacity style={s.similarCard} onPress={() => router.push(`/film/${film.id}`)} activeOpacity={0.7}>
      {posterUri ? (
        <Image source={{ uri: posterUri }} style={s.similarPoster} />
      ) : (
        <View style={[s.similarPoster, s.similarPosterPlaceholder]}>
          <FilmIcon size={16} color={colors.fog} strokeWidth={1} />
        </View>
      )}
      <Text style={s.similarTitle} numberOfLines={2}>{film.title || film.name}</Text>
    </TouchableOpacity>
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
function DirectorCard({ director, router }: { director: any; router: any }) {
  const photoUri = director.profile_path
    ? `https://image.tmdb.org/t/p/w185${director.profile_path}`
    : null;

  return (
    <TouchableOpacity
      style={s.directorCard}
      onPress={() => router.push(`/person/${director.id}`)}
      activeOpacity={0.7}
    >
      {photoUri ? (
        <Image source={{ uri: photoUri }} style={s.directorPhoto} />
      ) : (
        <View style={[s.directorPhoto, s.directorPhotoPlaceholder]}>
          <Text style={s.directorPhotoInitial}>
            {director.name?.charAt(0)?.toUpperCase() || '?'}
          </Text>
        </View>
      )}
      <View style={s.directorInfo}>
        <Text style={s.directorLabel}>DIRECTED BY</Text>
        <Text style={s.directorName}>{director.name}</Text>
      </View>
      <ArrowUpRight size={14} color={colors.fog} strokeWidth={1.5} />
    </TouchableOpacity>
  );
}

// ════════════════════════════════════════════════════════════
//  MAIN FILM DETAIL SCREEN
// ════════════════════════════════════════════════════════════
export default function FilmDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const scrollY = useRef(new RNAnimated.Value(0)).current;

  const [film, setFilm] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [reviews, setReviews] = useState<any[]>([]);
  const [similarFilms, setSimilarFilms] = useState<any[]>([]);
  const [shareModalVisible, setShareModalVisible] = useState(false);
  const [trailerModalVisible, setTrailerModalVisible] = useState(false);
  const [activeTrailerKey, setActiveTrailerKey] = useState<string | null>(null);

  const { isAuthenticated, user } = useAuthStore();
  const { _watchlistIndex, _loggedIndex, addToWatchlist, removeFromWatchlist, logs } = useFilmStore();

  const filmId = Number(id);
  const isWatchlisted = !!_watchlistIndex[filmId];
  const existingLog = _loggedIndex[filmId] || null;
  const isArchivist = user && ['archivist', 'auteur'].includes(user.role);
  const localReview = logs.find((l: any) => (l.filmId === filmId || String(l.filmId) === String(filmId)) && l.review);
  const currentUsername = user?.username || null;

  // ── Fetch Film ──
  useEffect(() => {
    if (!filmId || isNaN(filmId)) return;
    setLoading(true);

    (async () => {
      try {
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

        setFilm(detail);

        if (communityReviews.data) {
          setReviews(communityReviews.data.map((r: any) => ({
            ...r,
            username: Array.isArray(r.profiles) ? r.profiles[0]?.username : r.profiles?.username,
            role: Array.isArray(r.profiles) ? r.profiles[0]?.role : r.profiles?.role,
          })));
        }

        if (detail?.id) {
          const sim = await tmdb.similar(detail.id);
          setSimilarFilms((sim as any[]).filter((f: any) => f.poster_path).slice(0, 12));
        }
      } catch { }
      finally { setLoading(false); }
    })();
  }, [filmId]);

  // ── Actions ──
  const toggleWatchlist = useCallback(async () => {
    if (!film) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
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
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    router.push({
      pathname: '/log-modal',
      params: {
        filmId: String(film.id), filmTitle: film.title,
        filmPoster: film.poster_path || '', filmYear: getYear(film.release_date),
        editLogId: existingLog?.id || '',
      },
    });
  }, [film, existingLog]);

  const handleQuickWatch = useCallback(async () => {
    if (!film || existingLog) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    router.push({
      pathname: '/log-modal',
      params: {
        filmId: String(film.id), filmTitle: film.title,
        filmPoster: film.poster_path || '', filmYear: getYear(film.release_date),
        editLogId: '',
      },
    });
  }, [film, existingLog]);

  const handleRewatch = useCallback(() => {
    if (!film) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    router.push({
      pathname: '/log-modal',
      params: {
        filmId: String(film.id), filmTitle: film.title,
        filmPoster: film.poster_path || '', filmYear: getYear(film.release_date),
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

  // ── Loading ──
  if (loading) {
    return (
      <View style={s.container}>
        <View style={s.shimmerBackdrop}>
          <View style={[sub.shimmer, StyleSheet.absoluteFillObject]} />
          <LinearGradient colors={['rgba(11,10,8,0.1)', 'rgba(11,10,8,0.6)', colors.ink]} locations={[0, 0.7, 1]} style={StyleSheet.absoluteFill} />
        </View>
        <View style={s.shimmerContent}>
          <View style={[sub.shimmer, s.shimmerPoster]} />
          <View style={[sub.shimmer, s.shimmerEyebrow]} />
          <View style={[sub.shimmer, s.shimmerTitle]} />
          <View style={[sub.shimmer, s.shimmerMeta]} />
          <View style={[sub.shimmer, s.shimmerCta]} />
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
        <TouchableOpacity style={s.backBtn} onPress={() => router.back()}>
          <View style={s.ctaIconRow}>
            <ArrowLeft size={12} color={colors.bone} strokeWidth={1.5} />
            <Text style={s.backBtnText}>GO BACK</Text>
          </View>
        </TouchableOpacity>
      </View>
    );
  }

  const director = film.credits?.crew?.find((c: any) => c.job === 'Director');
  const cast = film.credits?.cast?.slice(0, 10) || [];
  const videos = film.videos?.results?.filter((v: any) => v.site === 'YouTube') || [];
  const trailer = videos.find((v: any) => v.type === 'Trailer') || videos[0];
  const score = obscurityScore(film);
  const providers = film['watch/providers']?.results || {};
  const studios = film.production_companies?.slice(0, 5) || [];

  const statusConfig: Record<string, { text: string; Icon: any }> = {
    watched: { text: 'WATCHED', Icon: Check },
    rewatched: { text: 'REWATCHED', Icon: RotateCcw },
    abandoned: { text: 'ABANDONED', Icon: XCircle },
  };

  return (
    <View style={s.container}>
      {/* ── Parallax Backdrop ── */}
      <RNAnimated.View style={[s.backdropWrap, { transform: [{ translateY: backdropTranslate }], opacity: backdropOpacity }]}>
        {film.backdrop_path ? (
          <Image source={{ uri: tmdb.backdrop(film.backdrop_path) }} style={s.backdrop} />
        ) : (
          <LinearGradient colors={[colors.soot, colors.ink]} style={s.backdrop} />
        )}
        {film.backdrop_path && <View style={s.sepiaTint} />}
        <LinearGradient
          colors={['rgba(11,10,8,0.05)', 'rgba(11,10,8,0.4)', 'rgba(11,10,8,0.85)', colors.ink]}
          locations={[0, 0.5, 0.75, 1]}
          style={StyleSheet.absoluteFill}
        />
      </RNAnimated.View>

      {/* ── Back Button ── */}
      <TouchableOpacity style={s.floatingBack} onPress={() => router.back()} activeOpacity={0.7}>
        <ArrowLeft size={16} color={colors.sepia} strokeWidth={1.5} />
      </TouchableOpacity>

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

        {/* ═══ HERO ═══ */}
        <AnimatedView entering={FadeInUp.duration(600)} style={s.heroSection}>
          {/* Poster */}
          <View style={s.posterWrap}>
            <View style={s.posterGlow} />
            {film.poster_path ? (
              <Image source={{ uri: tmdb.poster(film.poster_path, 'w342') }} style={s.poster} />
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
                  const Icon = cfg?.Icon || Check;
                  return (
                    <View style={s.loggedBadgeContent}>
                      <Icon size={8} color={colors.ink} strokeWidth={2.5} />
                      <Text style={s.loggedBadgeText}>{cfg?.text || 'LOGGED'}</Text>
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
                {film.genres.slice(0, 3).map((g: any) => <GenreTag key={g.id} name={g.name} />)}
              </View>
            )}

            <Text style={s.filmTitle}>{film.title}</Text>

            {film.tagline ? <Text style={s.tagline}>"{film.tagline}"</Text> : null}

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
              <ReelRating rating={Math.round((film.vote_average || 0) / 2)} size={18} />
              <Text style={s.ratingText}>
                {film.vote_average?.toFixed(1)} · {reviews.length > 0 ? `${reviews.length} SOCIETY REVIEW${reviews.length === 1 ? '' : 'S'}` : `${Math.round((film.vote_count || 0) / 100) * 100}+ GLOBAL`}
              </Text>
            </View>

            <ObscurityBadge score={score} />
          </View>
        </AnimatedView>

        {/* ═══ MY LOG ═══ */}
        {existingLog && (existingLog.rating ?? 0) > 0 && (
          <AnimatedView entering={FadeInDown.duration(400).delay(50)} style={s.section}>
            <View style={s.myLogCard}>
              <View style={s.myLogRatingWrap}>
                <ReelRating rating={existingLog.rating || 0} size={14} />
              </View>
              {existingLog.watchedDate && (
                <Text style={s.myLogDate}>
                  {new Date(existingLog.watchedDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                </Text>
              )}
              {existingLog.watchedWith && (
                <Text style={s.myLogWith}>with {existingLog.watchedWith}</Text>
              )}
            </View>
          </AnimatedView>
        )}

        {/* ═══ CTA BUTTONS ═══ */}
        <AnimatedView entering={FadeInDown.duration(400).delay(75)} style={s.ctaSection}>
          <TouchableOpacity style={s.ctaPrimary} onPress={handleLog} activeOpacity={0.8}>
            <View style={s.ctaIconRow}>
              {existingLog ? <Pencil size={13} color={colors.ink} strokeWidth={2} /> : <Plus size={15} color={colors.ink} strokeWidth={2.5} />}
              <Text style={s.ctaPrimaryText}>
                {existingLog ? 'EDIT LOG' : 'LOG THIS FILM'}
              </Text>
            </View>
          </TouchableOpacity>
          {existingLog && (
            <TouchableOpacity style={s.ctaRewatch} onPress={handleRewatch} activeOpacity={0.8}>
              <View style={s.ctaIconRow}>
                <RotateCcw size={12} color={colors.sepia} strokeWidth={2} />
                <Text style={s.ctaRewatchText}>
                  LOG REWATCH{(existingLog?.viewCount || 1) > 1 ? ` (${(existingLog?.viewCount || 1) + 1})` : ''}
                </Text>
              </View>
            </TouchableOpacity>
          )}
          <View style={s.ctaRow}>
            <TouchableOpacity
              style={[s.ctaSecondary, isWatchlisted && s.ctaDanger]}
              onPress={toggleWatchlist} activeOpacity={0.7}
            >
              <View style={s.ctaIconRow}>
                <BookIcon size={11} color={isWatchlisted ? colors.bloodReel : colors.bone} fill={isWatchlisted ? colors.bloodReel : 'transparent'} strokeWidth={1.5} />
                <Text style={[s.ctaSecondaryText, isWatchlisted && s.ctaDangerText]}>
                  {isWatchlisted ? 'SAVED' : 'WATCHLIST'}
                </Text>
              </View>
            </TouchableOpacity>
            {!existingLog && (
              <TouchableOpacity style={s.ctaSecondary} onPress={handleQuickWatch} activeOpacity={0.7}>
                <View style={s.ctaIconRow}>
                  <Eye size={12} color={colors.bone} strokeWidth={1.5} />
                  <Text style={s.ctaSecondaryText}>WATCHED</Text>
                </View>
              </TouchableOpacity>
            )}
            {trailer && (
              <TouchableOpacity
                style={s.ctaSecondary}
                onPress={() => { setActiveTrailerKey(trailer.key); setTrailerModalVisible(true); }}
                activeOpacity={0.7}
              >
                <View style={s.ctaIconRow}>
                  <Play size={10} color={colors.bone} fill={colors.bone} strokeWidth={1.5} />
                  <Text style={s.ctaSecondaryText}>TRAILER</Text>
                </View>
              </TouchableOpacity>
            )}
            {existingLog && (
              <TouchableOpacity
                style={s.ctaSecondary}
                onPress={() => setShareModalVisible(true)} activeOpacity={0.7}
              >
                <View style={s.ctaIconRow}>
                  <Share2 size={11} color={colors.bone} strokeWidth={1.5} />
                  <Text style={s.ctaSecondaryText}>SHARE</Text>
                </View>
              </TouchableOpacity>
            )}
          </View>
          {/* Archivist-only actions */}
          {isArchivist && (
            <View style={s.ctaRow}>
              {existingLog && (
                <TouchableOpacity
                  style={s.ctaArchivisit}
                  onPress={() => setShareModalVisible(true)}
                  activeOpacity={0.7}
                >
                  <View style={s.ctaIconRow}>
                    <Camera size={11} color={colors.sepia} strokeWidth={1.5} />
                    <Text style={s.ctaArchivistText}>DOSSIER</Text>
                  </View>
                </TouchableOpacity>
              )}
              <TouchableOpacity
                style={s.ctaArchivisit}
                onPress={() => {
                  router.push({
                    pathname: '/(tabs)/lounge',
                    params: {
                      shareFilmId: String(film.id),
                      shareFilmTitle: film.title,
                      shareFilmPoster: film.poster_path || '',
                      shareFilmYear: getYear(film.release_date),
                    },
                  });
                }}
                activeOpacity={0.7}
              >
                <View style={s.ctaIconRow}>
                  <MessageCircle size={11} color={colors.sepia} strokeWidth={1.5} />
                  <Text style={s.ctaArchivistText}>LOUNGE</Text>
                </View>
              </TouchableOpacity>
            </View>
          )}
        </AnimatedView>

        {/* ═══ YOUR LOG — Review + Viewing History ═══ */}
        {existingLog && (
          <AnimatedView entering={FadeInDown.duration(400).delay(80)} style={{
            marginHorizontal: 20, marginTop: 12, marginBottom: -4,
            backgroundColor: 'rgba(139,105,20,0.06)',
            borderWidth: 1, borderColor: 'rgba(139,105,20,0.2)',
            borderRadius: 8, padding: 14,
          }}>
            {/* Rating + meta row */}
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
              {(existingLog.rating ?? 0) > 0 && (
                <Text style={{ fontFamily: fonts.sub || fonts.body, fontSize: 16, color: colors.flicker }}>
                  {'★'.repeat(Math.floor(existingLog.rating ?? 0))}{(existingLog.rating ?? 0) % 1 >= 0.5 ? '½' : ''}{'☆'.repeat(5 - Math.ceil(existingLog.rating ?? 0))}
                </Text>
              )}
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                {existingLog.watchedDate && (
                  <Text style={{ fontFamily: fonts.ui, fontSize: 8, letterSpacing: 0.8, color: colors.fog }}>
                    {new Date(existingLog.watchedDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                  </Text>
                )}
                {(existingLog.viewCount || 1) > 1 && (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
                    <RotateCcw size={7} color={colors.fog} />
                    <Text style={{ fontFamily: fonts.ui, fontSize: 8, letterSpacing: 0.8, color: colors.fog }}>{existingLog.viewCount} viewings</Text>
                  </View>
                )}
              </View>
            </View>
            {/* Review text */}
            {existingLog.review ? (
              <Text style={{
                fontFamily: fonts.body, fontSize: 13.5, color: colors.bone,
                lineHeight: 21, opacity: 0.9,
              }}>
                {(existingLog.review || '').replace(/<[^>]+>/g, '').trim()}
              </Text>
            ) : null}
            {/* Viewing History — past reviews */}
            {(() => {
              const history = Array.isArray(existingLog.viewingHistory)
                ? existingLog.viewingHistory
                : (typeof existingLog.viewingHistory === 'string'
                  ? (() => { try { return JSON.parse(existingLog.viewingHistory); } catch { return []; } })()
                  : []);
              if (!history.length) return null;
              return (
              <View style={{ marginTop: 10, borderTopWidth: 1, borderTopColor: 'rgba(139,105,20,0.15)', paddingTop: 10 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 8 }}>
                  <History size={10} color={colors.sepia} />
                  <Text style={{ fontFamily: fonts.ui, fontSize: 9, letterSpacing: 1.5, color: colors.sepia }}>
                    VIEWING CHRONICLE — {history.length + 1} viewings
                  </Text>
                </View>
                {history.map((entry: any, idx: number) => (
                  <View key={idx} style={{
                    paddingLeft: 12, borderLeftWidth: 2, borderLeftColor: 'rgba(139,105,20,0.2)',
                    marginBottom: idx < (existingLog.viewingHistory?.length || 0) - 1 ? 10 : 0,
                  }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                      <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: colors.soot, borderWidth: 1.5, borderColor: 'rgba(139,105,20,0.4)', position: 'absolute', left: -17, top: 2 }} />
                      <Text style={{ fontFamily: fonts.ui, fontSize: 8, letterSpacing: 0.8, color: colors.fog }}>
                        {entry.date ? new Date(entry.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : ''}
                      </Text>
                      {entry.rating > 0 && (
                        <Text style={{ fontFamily: fonts.sub || fonts.body, fontSize: 12, color: colors.bone }}>
                          {'★'.repeat(Math.floor(entry.rating))}{entry.rating % 1 >= 0.5 ? '½' : ''}{'☆'.repeat(5 - Math.ceil(entry.rating))}
                        </Text>
                      )}
                    </View>
                    {entry.review ? (
                      <Text style={{ fontFamily: fonts.body, fontSize: 12.5, color: colors.bone, lineHeight: 19, opacity: 0.7, fontStyle: 'italic' }}>
                        "{entry.review.replace(/<[^>]+>/g, '').trim()}"
                      </Text>
                    ) : null}
                  </View>
                ))}
              </View>
              );
            })()}
          </AnimatedView>
        )}

        <SectionDivider label="THE DOSSIER" />

        {/* ═══ SYNOPSIS (scrollable for long texts) ═══ */}
        <AnimatedView entering={FadeInDown.duration(500).delay(100)} style={s.section}>
          <SectionDivider label="SYNOPSIS" />
          <ScrollView style={s.synopsisScroll} nestedScrollEnabled showsVerticalScrollIndicator>
            <Text style={s.synopsis}>{film.overview || 'No synopsis available.'}</Text>
          </ScrollView>
        </AnimatedView>

        {/* ═══ DIRECTOR CARD ═══ */}
        {director && (
          <AnimatedView entering={FadeInDown.duration(400).delay(125)} style={s.section}>
            <DirectorCard director={director} router={router} />
          </AnimatedView>
        )}

        {/* ═══ CAST ═══ */}
        {cast.length > 0 && (
          <AnimatedView entering={FadeInDown.duration(500).delay(150)} style={s.section}>
            <SectionDivider label="THE PLAYERS" />
            <CastCarousel cast={cast} />
          </AnimatedView>
        )}

        {/* ═══ VIDEOS ═══ */}
        {videos.length > 0 && (
          <AnimatedView entering={FadeInDown.duration(500).delay(175)} style={s.sectionFlush}>
            <View style={s.sectionPadded}>
              <SectionDivider label={`VIDEOS (${videos.length})`} />
            </View>
            <FlatList
              data={videos.slice(0, 6)}
              horizontal
              showsHorizontalScrollIndicator={false}
              keyExtractor={(item) => item.key}
              contentContainerStyle={s.horizontalList}
              renderItem={({ item }) => (
                <VideoThumb
                  video={item}
                  onPlay={() => { setActiveTrailerKey(item.key); setTrailerModalVisible(true); }}
                />
              )}
            />
          </AnimatedView>
        )}

        {/* ═══ WATCH PROVIDERS ═══ */}
        <AnimatedView entering={FadeInDown.duration(500).delay(200)} style={s.section}>
          <WatchProviders providers={providers} />
        </AnimatedView>

        {/* ═══ REVIEWS ═══ */}
        {(() => {
          // Build merged review list: local review first, then DB reviews deduped
          const mergedReviews: any[] = [];
          if (localReview) {
            mergedReviews.push({
              id: 'local',
              username: currentUsername || 'you',
              role: user?.role || 'cinephile',
              rating: localReview.rating,
              review: localReview.review,
              isLocal: true,
            });
          }
          reviews.forEach((r: any) => {
            if (localReview && currentUsername && r.username === currentUsername) return; // dedup
            mergedReviews.push(r);
          });

          return (
            <AnimatedView entering={FadeInDown.duration(500).delay(250)} style={s.section}>
              <SectionDivider label={mergedReviews.length > 0 ? `${mergedReviews.length} SOCIETY REVIEW${mergedReviews.length === 1 ? '' : 'S'}` : 'FROM THE CRITICS'} />
              {mergedReviews.length === 0 ? (
                <View style={sub.emptyReviewBox}>
                  <Text style={sub.emptyReviewTitle}>The projection box awaits.</Text>
                  <Text style={sub.emptyReviewBody}>No transmissions yet. Log this film to be the first voice in the archive.</Text>
                </View>
              ) : mergedReviews.map((r: any, i: number) => {
                const tierLabel = r.isLocal ? 'Your Review' : r.role === 'auteur' ? 'Auteur' : r.role === 'archivist' ? 'Archivist' : 'Cinephile';
                return (
                  <View key={r.id || i} style={[sub.reviewCard, r.isLocal && sub.reviewCardLocal]}>
                    <Text style={sub.reviewQuote}>"</Text>
                    <View style={sub.reviewHeader}>
                      <View>
                        <TouchableOpacity onPress={() => !r.isLocal && r.username && router.push(`/user/${r.username}`)} disabled={r.isLocal}>
                          <Text style={sub.reviewAuthor}>@{r.username || 'anonymous'}</Text>
                        </TouchableOpacity>
                        <Text style={sub.reviewTier}>{tierLabel}</Text>
                      </View>
                      {r.rating > 0 && <ReelRating rating={r.rating} size={12} />}
                    </View>
                    <Text style={sub.reviewText}>{r.review}</Text>
                  </View>
                );
              })}
            </AnimatedView>
          );
        })()}

        {/* ═══ DOSSIER ═══ */}
        <AnimatedView entering={FadeInDown.duration(500).delay(275)} style={s.section}>
          <SectionDivider label="FILM DOSSIER" />
          <View style={s.dossierCard}>
            <DossierRow label="GENRES" value={film.genres?.map((g: any) => g.name).join(', ')} />
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
          <AnimatedView entering={FadeInDown.duration(500).delay(300)} style={s.sectionFlush}>
            <View style={s.sectionPadded}>
              <SectionDivider label="PRODUCTION" />
            </View>
            <FlatList
              data={studios}
              horizontal
              showsHorizontalScrollIndicator={false}
              keyExtractor={(item) => String(item.id)}
              contentContainerStyle={s.horizontalList}
              renderItem={({ item }) => <StudioCard company={item} />}
            />
          </AnimatedView>
        )}

        {/* ═══ INTERNATIONAL RELEASES ═══ */}
        {film.release_dates && (
          <AnimatedView entering={FadeInDown.duration(500).delay(325)} style={s.section}>
            <CountryReleases releaseDates={film.release_dates} />
          </AnimatedView>
        )}

        {/* ═══ SIMILAR FILMS ═══ */}
        {similarFilms.length > 0 && (
          <AnimatedView entering={FadeInDown.duration(500).delay(350)} style={s.sectionFlush}>
            <View style={s.sectionPadded}>
              <SectionDivider label="YOU MAY ALSO LIKE" />
            </View>
            <FlatList
              data={similarFilms}
              horizontal
              showsHorizontalScrollIndicator={false}
              keyExtractor={(item) => String(item.id)}
              contentContainerStyle={s.horizontalList}
              renderItem={({ item }) => <SimilarCard film={item} />}
            />
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
  shimmerBackdrop: { height: BACKDROP_H, backgroundColor: colors.soot, position: 'relative' },
  shimmerContent: { marginTop: -80, alignItems: 'center', paddingHorizontal: 20 },
  shimmerPoster: { width: POSTER_W, height: POSTER_H, borderRadius: 6, marginBottom: 16 },
  shimmerEyebrow: { width: 120, height: 10, borderRadius: 2, marginBottom: 10 },
  shimmerTitle: { width: 200, height: 28, borderRadius: 2, marginBottom: 10 },
  shimmerMeta: { width: 160, height: 10, borderRadius: 2, marginBottom: 20 },
  shimmerCta: { width: '100%', height: 48, borderRadius: 2 },

  // ── Not Found ──
  notFoundContainer: { justifyContent: 'center', alignItems: 'center', padding: 32 },
  notFoundGlyph: { fontFamily: fonts.display, fontSize: 56, color: colors.ash, marginBottom: 16 },
  notFoundTitle: { fontFamily: fonts.display, fontSize: 22, color: colors.parchment, marginBottom: 8 },
  notFoundBody: { fontFamily: fonts.body, fontSize: 14, color: colors.fog, textAlign: 'center', lineHeight: 22 },

  // ── Backdrop ──
  backdropWrap: { position: 'absolute', top: 0, left: 0, right: 0, height: BACKDROP_H, zIndex: 0 },
  backdrop: { width: '100%', height: '100%', resizeMode: 'cover' } as any,
  sepiaTint: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(60,40,10,0.35)' },

  // ── Floating Back ──
  floatingBack: {
    position: 'absolute', top: 54, left: 16, zIndex: 100,
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: 'rgba(10,7,3,0.65)', borderWidth: 1, borderColor: 'rgba(139,105,20,0.3)',
    alignItems: 'center', justifyContent: 'center',
  },

  // ── Hero ──
  heroSection: { paddingHorizontal: 20, alignItems: 'center', zIndex: 2, marginBottom: 8 },
  posterWrap: { position: 'relative', marginBottom: 20 },
  posterGlow: {
    position: 'absolute', top: -8, left: -8, right: -8, bottom: -8,
    borderRadius: 10,
    backgroundColor: 'rgba(139,105,20,0.12)',
    shadowColor: 'rgba(139,105,20,0.5)', shadowOffset: { width: 0, height: 0 }, shadowOpacity: 1, shadowRadius: 30,
    elevation: 0,
  },
  poster: {
    width: POSTER_W, height: POSTER_H, borderRadius: 6,
    borderWidth: 1, borderColor: 'rgba(196,150,26,0.3)',
    shadowColor: '#000', shadowOffset: { width: 0, height: 16 }, shadowOpacity: 0.8, shadowRadius: 24,
    elevation: 20,
  },
  posterPlaceholder: { backgroundColor: colors.soot, justifyContent: 'center', alignItems: 'center' },
  posterPlaceholderText: { fontFamily: fonts.ui, fontSize: 10, color: colors.fog, letterSpacing: 2 },
  scanlines: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    borderRadius: 6, opacity: 0.04,
    backgroundColor: 'transparent',
    borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.1)',
  },
  loggedBadgeOnPoster: {
    position: 'absolute', bottom: -12, alignSelf: 'center',
    paddingHorizontal: 14, paddingVertical: 5, borderRadius: 20,
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
    paddingHorizontal: 8, paddingVertical: 3,
    borderWidth: 1, borderColor: 'rgba(196,150,26,0.25)', borderRadius: 2,
    backgroundColor: 'rgba(196,150,26,0.06)',
  },
  genreText: { fontFamily: fonts.ui, fontSize: 8, letterSpacing: 2, color: colors.sepia },
  filmTitle: {
    fontFamily: fonts.display, fontSize: 26, color: colors.parchment,
    textAlign: 'center', lineHeight: 30, marginBottom: 6,
    textShadowColor: 'rgba(0,0,0,0.6)', textShadowOffset: { width: 0, height: 4 }, textShadowRadius: 20,
  },
  tagline: {
    fontFamily: fonts.bodyItalic, fontSize: 14, color: colors.bone,
    textAlign: 'center', marginBottom: 14, opacity: 0.75,
  },
  metaStrip: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 14 },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  metaText: { fontFamily: fonts.ui, fontSize: 9, letterSpacing: 1, color: colors.fog },
  metaDot: { fontSize: 8, color: colors.ash },
  ratingRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 10 },
  ratingText: { fontFamily: fonts.body, fontSize: 12, color: colors.bone, opacity: 0.7 },

  // ── Director Card ──
  directorCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: colors.soot,
    borderWidth: 1, borderColor: 'rgba(139,105,20,0.2)', borderRadius: 6,
    padding: 12,
    borderLeftWidth: 3, borderLeftColor: colors.sepia,
  },
  directorPhoto: {
    width: 48, height: 48, borderRadius: 24,
    borderWidth: 1, borderColor: 'rgba(139,105,20,0.3)',
  },
  directorPhotoPlaceholder: {
    backgroundColor: colors.ash, justifyContent: 'center', alignItems: 'center',
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

  // ── My Log Card ──
  myLogCard: {
    backgroundColor: 'rgba(196,150,26,0.08)', borderWidth: 1, borderColor: 'rgba(196,150,26,0.2)',
    borderRadius: 8, paddingHorizontal: 16, paddingVertical: 12, alignItems: 'center',
  },
  myLogRatingWrap: { marginBottom: 4 },
  myLogDate: { fontFamily: fonts.ui, fontSize: 9, letterSpacing: 1, color: colors.fog },
  myLogWith: { fontFamily: fonts.bodyItalic, fontSize: 11, color: colors.bone, opacity: 0.8, marginTop: 4 },

  // ── CTAs ──
  ctaSection: { paddingHorizontal: 20, marginTop: 8, marginBottom: 8 },
  ctaColumn: { width: '100%', gap: 10 },
  ctaPrimary: {
    backgroundColor: 'rgba(139, 105, 20, 0.95)', borderRadius: 4,
    paddingVertical: 15, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: 'rgba(242, 232, 160, 0.4)',
    ...effects.glowSepia,
  },
  ctaPrimaryText: { fontFamily: fonts.uiBold, fontSize: 12, letterSpacing: 2, color: colors.ink },
  ctaRow: { flexDirection: 'row', gap: 8, marginTop: 8 },
  ctaSecondary: {
    flex: 1, borderWidth: 1, borderColor: 'rgba(139, 105, 20, 0.3)', borderRadius: 4,
    paddingVertical: 11, alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(10, 7, 3, 0.4)',
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
  synopsisScroll: {
    maxHeight: 200, marginTop: 8,
    borderWidth: StyleSheet.hairlineWidth, borderColor: colors.ash,
    borderRadius: 4, padding: 12, backgroundColor: 'rgba(14,13,10,0.6)',
  },
  synopsis: { fontFamily: fonts.body, fontSize: 15, color: colors.bone, lineHeight: 28 },

  // ── Dossier ──
  dossierCard: {
    backgroundColor: colors.soot, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.ash,
    borderRadius: 4, padding: 14, marginTop: 8,
  },
  dossierRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.ash },
  dossierLabel: { fontFamily: fonts.ui, fontSize: 9, letterSpacing: 1, color: colors.fog },
  dossierValue: { fontFamily: fonts.body, fontSize: 13, color: colors.bone, maxWidth: '60%', textAlign: 'right' },

  // ── Similar ──
  similarCard: { width: 100 },
  similarPoster: { width: 100, height: 150, borderRadius: 4, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.ash, marginBottom: 6 },
  similarPosterPlaceholder: { backgroundColor: colors.ash, justifyContent: 'center', alignItems: 'center' },
  similarTitle: { fontFamily: fonts.sub, fontSize: 10, color: colors.bone, lineHeight: 14 },

  // ── Back ──
  backBtn: { marginTop: 24, paddingVertical: 12, paddingHorizontal: 24, borderWidth: 1, borderColor: colors.ash, borderRadius: 4 },
  backBtnText: { fontFamily: fonts.ui, fontSize: 10, letterSpacing: 2, color: colors.bone },

  // ── Archivist CTAs ──
  ctaArchivisit: {
    flex: 1, borderWidth: 1, borderColor: 'rgba(196,150,26,0.4)', borderRadius: 4,
    paddingVertical: 11, alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(139,105,20,0.06)',
  },
  ctaArchivistText: { fontFamily: fonts.uiMedium, fontSize: 9, letterSpacing: 1.5, color: colors.sepia },
});

// ════════════════════════════════════════════════════════════
//  SUB-COMPONENT STYLES
// ════════════════════════════════════════════════════════════
const sub = StyleSheet.create({
  shimmer: { backgroundColor: colors.ash, opacity: 0.4 },

  // ── Prestige Badge ──
  prestigeBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 10, paddingVertical: 4, borderRadius: 2,
    borderWidth: 1, borderColor: colors.sepia, backgroundColor: 'rgba(139,105,20,0.1)',
    marginBottom: 12, alignSelf: 'center',
  },
  prestigeText: { fontFamily: fonts.ui, fontSize: 8, letterSpacing: 2, color: colors.flicker },

  // ── Obscurity Badge ──
  obsBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 4, borderWidth: 1, borderRadius: 3, marginBottom: 4 },
  obsScore: { fontFamily: fonts.uiBold, fontSize: 14 },
  obsLabel: { fontFamily: fonts.ui, fontSize: 8, letterSpacing: 2, color: colors.fog },

  // ── Video ──
  videoThumb: { width: 200, height: 112, borderRadius: 4, overflow: 'hidden', position: 'relative', borderWidth: StyleSheet.hairlineWidth, borderColor: colors.ash },
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
  studioLogo: { width: 60, height: 40, borderRadius: 4, marginBottom: 6, backgroundColor: colors.soot, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.ash },
  studioLogoPlaceholder: { backgroundColor: colors.ash, justifyContent: 'center', alignItems: 'center' },
  studioName: { fontFamily: fonts.ui, fontSize: 8, color: colors.bone, textAlign: 'center', letterSpacing: 0.5 },
  studioCountry: { fontFamily: fonts.ui, fontSize: 7, color: colors.fog, letterSpacing: 1, marginTop: 2 },

  // ── Review ──
  reviewCard: {
    backgroundColor: colors.soot, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.ash,
    borderRadius: 4, padding: 16, marginTop: 10,
    borderLeftWidth: 2, borderLeftColor: 'rgba(196,150,26,0.3)',
    position: 'relative', overflow: 'hidden',
  },
  reviewHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 },
  reviewQuote: {
    position: 'absolute', top: -4, left: 10, fontSize: 60,
    fontFamily: fonts.display, color: colors.sepia, opacity: 0.25,
  },
  reviewAuthor: { fontFamily: fonts.ui, fontSize: 10, letterSpacing: 1, color: colors.sepia },
  reviewTier: { fontFamily: fonts.ui, fontSize: 8, letterSpacing: 0.8, color: colors.fog, marginTop: 2 },
  reviewText: { fontFamily: fonts.bodyItalic, fontSize: 13, color: colors.bone, lineHeight: 20, opacity: 0.85 },
  reviewCardLocal: { borderLeftColor: colors.sepia, borderLeftWidth: 2 },

  // ── Empty Reviews ──
  emptyReviewBox: {
    padding: 24, borderWidth: 1, borderStyle: 'dashed', borderColor: 'rgba(139,105,20,0.2)',
    borderRadius: 4, alignItems: 'center',
  },
  emptyReviewTitle: { fontFamily: fonts.display, fontSize: 16, color: colors.sepia, marginBottom: 8 },
  emptyReviewBody: { fontFamily: fonts.body, fontSize: 12, color: colors.fog, fontStyle: 'italic', textAlign: 'center', lineHeight: 20 },
});
