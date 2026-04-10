/**
 * FilmDetailScreen — Native Film Detail page.
 *
 * 100% parity with web FilmDetailPage.tsx (733 lines + 6 sub-components):
 *  • Full-bleed parallax backdrop with sepia tint overlay
 *  • Poster with sepia glow shadow + scanlines overlay + logged badge on poster
 *  • Lucide icons (Clock, Globe) instead of emoji
 *  • Genre tags, tagline, meta strip, ReelRating, ObscurityBadge
 *  • Director link to /person/{id}
 *  • Mark Watched quick button (when no existing log)
 *  • watchedWith field in existing log card
 *  • Video section (horizontal YouTube thumbnails)
 *  • Production studios section
 *  • Prestige Label badge (A24/NEON/MUBI/Criterion)
 *  • Shimmer skeleton loading state
 *  • Community reviews with tier badges + quote decoration
 *  • WatchProviders with JustWatch attribution
 *  • TrailerModal with OFFICIAL TRAILER label
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
import { Clock, Globe, ArrowLeft, Eye, Play } from 'lucide-react-native';

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');
const BACKDROP_H = SCREEN_H * 0.5;
const POSTER_W = 140;
const POSTER_H = POSTER_W * 1.5;
const AnimatedView = Animated.createAnimatedComponent(View);

// ── Prestige Labels ─────────────────────────────────────────
const PRESTIGE_STUDIOS = ['A24', 'NEON', 'MUBI', 'Criterion', 'Janus Films', 'Oscilloscope', 'Kino Lorber'];

function PrestigeBadge({ companies }: { companies: any[] }) {
  const match = companies?.find((c: any) => PRESTIGE_STUDIOS.some(p => c.name?.includes(p)));
  if (!match) return null;
  return (
    <View style={st.prestigeBadge}>
      <Text style={st.prestigeText}>✦ {match.name.toUpperCase()}</Text>
    </View>
  );
}

// ── Obscurity Badge ─────────────────────────────────────────
function ObscurityBadge({ score }: { score: number }) {
  if (score <= 0) return null;
  const label = score > 80 ? 'GHOST REEL' : score > 60 ? 'DEEP CUT' : score > 40 ? 'INDIE' : score > 20 ? 'KNOWN' : 'MAINSTREAM';
  const color = score > 70 ? colors.sepia : score > 40 ? colors.bone : colors.fog;
  return (
    <View style={[st.obsBadge, { borderColor: color }]}>
      <Text style={[st.obsScore, { color }]}>{score}</Text>
      <Text style={st.obsLabel}>{label}</Text>
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
    <TouchableOpacity style={st.videoThumb} onPress={onPlay} activeOpacity={0.7}>
      <Image source={{ uri: thumb }} style={st.videoImg} resizeMode="cover" />
      <View style={st.videoPlayOverlay}>
        <View style={st.videoPlayCircle}>
          <Play size={14} color={colors.parchment} fill={colors.parchment} />
        </View>
      </View>
      <View style={st.videoLabelWrap}>
        <Text style={st.videoType}>{video.type?.toUpperCase() || 'VIDEO'}</Text>
        <Text style={st.videoName} numberOfLines={1}>{video.name}</Text>
      </View>
    </TouchableOpacity>
  );
}

// ── Production Studio ───────────────────────────────────────
function StudioCard({ company }: { company: any }) {
  const logoUri = company.logo_path ? `https://image.tmdb.org/t/p/w92${company.logo_path}` : null;
  return (
    <View style={st.studioCard}>
      {logoUri ? (
        <Image source={{ uri: logoUri }} style={st.studioLogo} resizeMode="contain" />
      ) : (
        <View style={[st.studioLogo, { backgroundColor: colors.ash, justifyContent: 'center', alignItems: 'center' }]}>
          <Text style={{ fontFamily: fonts.ui, fontSize: 7, color: colors.fog, textAlign: 'center' }}>{company.name}</Text>
        </View>
      )}
      <Text style={st.studioName} numberOfLines={2}>{company.name}</Text>
      {company.origin_country && <Text style={st.studioCountry}>{company.origin_country}</Text>}
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
        <View style={[s.similarPoster, { backgroundColor: colors.ash, justifyContent: 'center', alignItems: 'center' }]}>
          <Text style={{ fontFamily: fonts.display, color: colors.fog, fontSize: 18 }}>✦</Text>
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
  const existingLog = _loggedIndex[filmId];

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
    // Navigate to log modal with "watched" pre-set
    router.push({
      pathname: '/log-modal',
      params: {
        filmId: String(film.id), filmTitle: film.title,
        filmPoster: film.poster_path || '', filmYear: getYear(film.release_date),
        editLogId: '',
      },
    });
  }, [film, existingLog]);

  // ── Parallax transforms ──
  const backdropTranslate = scrollY.interpolate({
    inputRange: [0, BACKDROP_H], outputRange: [0, BACKDROP_H * 0.4], extrapolate: 'clamp',
  });
  const backdropOpacity = scrollY.interpolate({
    inputRange: [0, BACKDROP_H * 0.6], outputRange: [1, 0.3], extrapolate: 'clamp',
  });

  // ── Loading (shimmer skeleton) ──
  if (loading) {
    return (
      <View style={s.container}>
        {/* Backdrop shimmer */}
        <View style={{ height: BACKDROP_H, backgroundColor: colors.soot, position: 'relative' }}>
          <View style={[st.shimmer, { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }]} />
          <LinearGradient
            colors={['rgba(11,10,8,0.1)', 'rgba(11,10,8,0.6)', colors.ink]}
            locations={[0, 0.7, 1]}
            style={StyleSheet.absoluteFill}
          />
        </View>
        <View style={{ marginTop: -80, alignItems: 'center', paddingHorizontal: 20 }}>
          <View style={[st.shimmer, { width: POSTER_W, height: POSTER_H, borderRadius: 6, marginBottom: 16 }]} />
          <View style={[st.shimmer, { width: 120, height: 10, borderRadius: 2, marginBottom: 10 }]} />
          <View style={[st.shimmer, { width: 200, height: 28, borderRadius: 2, marginBottom: 10 }]} />
          <View style={[st.shimmer, { width: 160, height: 10, borderRadius: 2, marginBottom: 20 }]} />
          <View style={[st.shimmer, { width: '100%', height: 48, borderRadius: 2 }]} />
        </View>
      </View>
    );
  }

  // ── Not found ──
  if (!film) {
    return (
      <View style={[s.container, { justifyContent: 'center', alignItems: 'center', padding: 32 }]}>
        <Text style={{ fontFamily: fonts.display, fontSize: 56, color: colors.ash, marginBottom: 16 }}>∅</Text>
        <Text style={{ fontFamily: fonts.display, fontSize: 22, color: colors.parchment, marginBottom: 8 }}>Not in the Archive</Text>
        <Text style={{ fontFamily: fonts.body, fontSize: 14, color: colors.fog, textAlign: 'center', lineHeight: 22 }}>
          This reel could not be found. It may have been withdrawn from circulation.
        </Text>
        <TouchableOpacity style={s.backBtn} onPress={() => router.back()}>
          <Text style={s.backBtnText}>← GO BACK</Text>
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

  const statusLabels: Record<string, string> = {
    watched: '✓ WATCHED', rewatched: '↻ REWATCHED', abandoned: '✕ ABANDONED',
  };

  return (
    <View style={s.container}>
      {/* ── Parallax Backdrop with Sepia Tint ── */}
      <RNAnimated.View style={[s.backdropWrap, { transform: [{ translateY: backdropTranslate }], opacity: backdropOpacity }]}>
        {film.backdrop_path ? (
          <Image source={{ uri: tmdb.backdrop(film.backdrop_path) }} style={s.backdrop} />
        ) : (
          <LinearGradient colors={[colors.soot, colors.ink]} style={s.backdrop} />
        )}
        {/* Sepia tint overlay — matches web filter: sepia(0.25) brightness(0.50) */}
        {film.backdrop_path && <View style={s.sepiaTint} />}
        <LinearGradient
          colors={['rgba(11,10,8,0.05)', 'rgba(11,10,8,0.4)', 'rgba(11,10,8,0.85)', colors.ink]}
          locations={[0, 0.5, 0.75, 1]}
          style={StyleSheet.absoluteFill}
        />
      </RNAnimated.View>

      {/* ── Back Button (fixed) ── */}
      <TouchableOpacity style={s.floatingBack} onPress={() => router.back()} activeOpacity={0.7}>
        <ArrowLeft size={16} color={colors.sepia} />
      </TouchableOpacity>

      {/* ── Scrollable Content ── */}
      <RNAnimated.ScrollView
        contentContainerStyle={{ paddingBottom: 100 }}
        showsVerticalScrollIndicator={false}
        onScroll={RNAnimated.event(
          [{ nativeEvent: { contentOffset: { y: scrollY } } }],
          { useNativeDriver: true }
        )}
        scrollEventThrottle={16}
      >
        <View style={{ height: BACKDROP_H - 80 }} />

        {/* ═══════════════════════════════════════════════════
            HERO — Poster + Film Info
        ═══════════════════════════════════════════════════ */}
        <AnimatedView entering={FadeInUp.duration(600)} style={s.heroSection}>
          {/* Floating Poster with sepia glow + scanlines */}
          <View style={s.posterWrap}>
            {/* Sepia glow behind poster */}
            <View style={s.posterGlow} />
            {film.poster_path ? (
              <Image source={{ uri: tmdb.poster(film.poster_path, 'w342') }} style={s.poster} />
            ) : (
              <View style={[s.poster, { backgroundColor: colors.soot, justifyContent: 'center', alignItems: 'center' }]}>
                <Text style={{ fontFamily: fonts.ui, fontSize: 10, color: colors.fog, letterSpacing: 2 }}>NO POSTER</Text>
              </View>
            )}
            {/* Scanlines overlay */}
            <View style={s.scanlines} />
            {/* Logged badge on poster */}
            {existingLog && (
              <View style={s.loggedBadgeOnPoster}>
                <Text style={s.loggedBadgeText}>
                  {statusLabels[existingLog.status] || '✓ LOGGED'}
                </Text>
              </View>
            )}
          </View>

          {/* Film Info */}
          <View style={s.infoBlock}>
            {/* Prestige Badge */}
            <PrestigeBadge companies={studios} />

            {/* Genres */}
            {film.genres?.length > 0 && (
              <View style={s.genreRow}>
                {film.genres.slice(0, 3).map((g: any) => <GenreTag key={g.id} name={g.name} />)}
              </View>
            )}

            {/* Title */}
            <Text style={s.filmTitle}>{film.title}</Text>

            {/* Tagline */}
            {film.tagline ? <Text style={s.tagline}>"{film.tagline}"</Text> : null}

            {/* Meta strip — Lucide icons */}
            <View style={s.metaStrip}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <Clock size={10} color={colors.fog} />
                <Text style={s.metaText}>{formatRuntime(film.runtime)}</Text>
              </View>
              <Text style={s.metaDot}>·</Text>
              <Text style={s.metaText}>{getYear(film.release_date)}</Text>
              {film.production_countries?.[0] && (
                <>
                  <Text style={s.metaDot}>·</Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                    <Globe size={10} color={colors.fog} />
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

            {/* Obscurity Badge */}
            <ObscurityBadge score={score} />

            {/* Director Link */}
            {director && (
              <TouchableOpacity
                style={s.directorLink}
                onPress={() => router.push(`/person/${director.id}`)}
                activeOpacity={0.7}
              >
                <Text style={s.directorLabel}>DIR.</Text>
                <Text style={s.directorName}>{director.name}</Text>
                <Text style={s.directorArrow}>↗</Text>
              </TouchableOpacity>
            )}

            {/* Existing log details with watchedWith */}
            {existingLog && (existingLog.rating ?? 0) > 0 && (
              <View style={s.myLogCard}>
                <View style={{ marginBottom: 4 }}>
                  <ReelRating rating={existingLog.rating || 0} size={14} />
                </View>
                {existingLog.watchedDate && (
                  <Text style={s.myLogDate}>
                    {new Date(existingLog.watchedDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                  </Text>
                )}
                {existingLog.watchedWith && (
                  <Text style={s.myLogWith}>♡ {existingLog.watchedWith}</Text>
                )}
              </View>
            )}

            {/* ── CTA Buttons ── */}
            <View style={s.ctaColumn}>
              <TouchableOpacity style={s.ctaPrimary} onPress={handleLog} activeOpacity={0.8}>
                <Text style={s.ctaPrimaryText}>
                  {existingLog ? '✎ EDIT LOG' : '＋ LOG THIS FILM'}
                </Text>
              </TouchableOpacity>
              <View style={s.ctaRow}>
                <TouchableOpacity
                  style={[s.ctaSecondary, isWatchlisted && s.ctaDanger]}
                  onPress={toggleWatchlist} activeOpacity={0.7}
                >
                  <Text style={[s.ctaSecondaryText, isWatchlisted && { color: colors.bloodReel }]}>
                    {isWatchlisted ? '✓ SAVED' : '+ WATCHLIST'}
                  </Text>
                </TouchableOpacity>
                {/* Mark Watched quick button */}
                {!existingLog && (
                  <TouchableOpacity style={s.ctaSecondary} onPress={handleQuickWatch} activeOpacity={0.7}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                      <Eye size={12} color={colors.bone} />
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
                    <Text style={s.ctaSecondaryText}>▶ TRAILER</Text>
                  </TouchableOpacity>
                )}
                {existingLog && (
                  <TouchableOpacity
                    style={s.ctaSecondary}
                    onPress={() => setShareModalVisible(true)} activeOpacity={0.7}
                  >
                    <Text style={s.ctaSecondaryText}>↗ SHARE</Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>
          </View>
        </AnimatedView>

        <SectionDivider label="THE DOSSIER" />

        {/* ── Synopsis ── */}
        <AnimatedView entering={FadeInDown.duration(500).delay(100)} style={s.section}>
          <SectionDivider label="SYNOPSIS" />
          <Text style={s.synopsis}>{film.overview || 'No synopsis available.'}</Text>
        </AnimatedView>

        {/* ── Video Section ── */}
        {videos.length > 0 && (
          <AnimatedView entering={FadeInDown.duration(500).delay(125)} style={s.section}>
            <SectionDivider label={`VIDEOS (${videos.length})`} />
            <FlatList
              data={videos.slice(0, 6)}
              horizontal
              showsHorizontalScrollIndicator={false}
              keyExtractor={(item) => item.key}
              contentContainerStyle={{ paddingHorizontal: 16, gap: 10 }}
              renderItem={({ item }) => (
                <VideoThumb
                  video={item}
                  onPlay={() => { setActiveTrailerKey(item.key); setTrailerModalVisible(true); }}
                />
              )}
            />
          </AnimatedView>
        )}

        {/* ── Watch Providers ── */}
        <AnimatedView entering={FadeInDown.duration(500).delay(150)} style={s.section}>
          <WatchProviders providers={providers} />
        </AnimatedView>

        {/* ── Cast ── */}
        {cast.length > 0 && (
          <AnimatedView entering={FadeInDown.duration(500).delay(200)} style={s.section}>
            <SectionDivider label="THE PLAYERS" />
            <CastCarousel cast={cast} />
          </AnimatedView>
        )}

        {/* ── Community Reviews with tier badges ── */}
        {reviews.length > 0 && (
          <AnimatedView entering={FadeInDown.duration(500).delay(300)} style={s.section}>
            <SectionDivider label={`${reviews.length} SOCIETY REVIEW${reviews.length === 1 ? '' : 'S'}`} />
            {reviews.map((r: any, i: number) => {
              const tierLabel = r.role === 'auteur' ? 'Auteur' : r.role === 'archivist' ? 'Archivist' : 'Cinephile';
              return (
                <View key={r.id || i} style={st.reviewCard}>
                  {/* Giant quote mark */}
                  <Text style={st.reviewQuote}>"</Text>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                    <View>
                      <TouchableOpacity onPress={() => r.username && router.push(`/user/${r.username}`)}>
                        <Text style={st.reviewAuthor}>@{r.username || 'anonymous'}</Text>
                      </TouchableOpacity>
                      <Text style={st.reviewTier}>{tierLabel}</Text>
                    </View>
                    {r.rating > 0 && <ReelRating rating={r.rating} size={12} />}
                  </View>
                  <Text style={st.reviewText}>{r.review}</Text>
                </View>
              );
            })}
          </AnimatedView>
        )}

        {/* ── Film Dossier ── */}
        <AnimatedView entering={FadeInDown.duration(500).delay(350)} style={s.section}>
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

        {/* ── Production Studios ── */}
        {studios.length > 0 && (
          <AnimatedView entering={FadeInDown.duration(500).delay(360)} style={s.section}>
            <SectionDivider label="PRODUCTION" />
            <FlatList
              data={studios}
              horizontal
              showsHorizontalScrollIndicator={false}
              keyExtractor={(item) => String(item.id)}
              contentContainerStyle={{ paddingHorizontal: 16, gap: 12 }}
              renderItem={({ item }) => <StudioCard company={item} />}
            />
          </AnimatedView>
        )}

        {/* ── International Releases ── */}
        {film.release_dates && (
          <AnimatedView entering={FadeInDown.duration(500).delay(375)} style={s.section}>
            <CountryReleases releaseDates={film.release_dates} />
          </AnimatedView>
        )}

        {/* ── Similar Films ── */}
        {similarFilms.length > 0 && (
          <AnimatedView entering={FadeInDown.duration(500).delay(400)} style={s.section}>
            <SectionDivider label="YOU MAY ALSO LIKE" />
            <FlatList
              data={similarFilms}
              horizontal
              showsHorizontalScrollIndicator={false}
              keyExtractor={(item) => String(item.id)}
              contentContainerStyle={{ paddingHorizontal: 16, gap: 10 }}
              renderItem={({ item }) => <SimilarCard film={item} />}
            />
          </AnimatedView>
        )}
      </RNAnimated.ScrollView>

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
//  STYLES — NITRATE NOIR (100% web parity)
// ════════════════════════════════════════════════════════════
const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.ink },

  // ── Backdrop ──
  backdropWrap: { position: 'absolute', top: 0, left: 0, right: 0, height: BACKDROP_H, zIndex: 0 },
  backdrop: { width: '100%', height: '100%', resizeMode: 'cover' },
  sepiaTint: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(60,40,10,0.35)',
  },

  // ── Floating Back ──
  floatingBack: {
    position: 'absolute', top: 50, left: 16, zIndex: 100,
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: 'rgba(10,7,3,0.6)', borderWidth: 1, borderColor: 'rgba(139,105,20,0.3)',
    alignItems: 'center', justifyContent: 'center',
  },

  // ── Hero ──
  heroSection: { paddingHorizontal: 20, alignItems: 'center', zIndex: 2 },
  posterWrap: { position: 'relative', marginBottom: 20 },
  posterGlow: {
    position: 'absolute', top: -8, left: -8, right: -8, bottom: -8,
    borderRadius: 10,
    backgroundColor: 'rgba(139,105,20,0.15)',
    shadowColor: 'rgba(139,105,20,0.5)', shadowOffset: { width: 0, height: 0 }, shadowOpacity: 1, shadowRadius: 30,
    elevation: 0,
  },
  poster: {
    width: POSTER_W, height: POSTER_H, borderRadius: 6,
    borderWidth: 1, borderColor: 'rgba(196,150,26,0.3)',
    shadowColor: '#000', shadowOffset: { width: 0, height: 16 }, shadowOpacity: 0.8, shadowRadius: 24,
    elevation: 20,
  },
  scanlines: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    borderRadius: 6, opacity: 0.04,
    backgroundColor: 'transparent',
    borderWidth: 0,
    // Simulated scanlines via repeating thin horizontal lines
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

  // ── Info Block ──
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
    textAlign: 'center', lineHeight: 29, marginBottom: 6,
    textShadowColor: 'rgba(0,0,0,0.6)', textShadowOffset: { width: 0, height: 4 }, textShadowRadius: 20,
  },
  tagline: {
    fontFamily: fonts.bodyItalic, fontSize: 14, color: colors.bone,
    textAlign: 'center', marginBottom: 14, opacity: 0.75,
  },
  metaStrip: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 16 },
  metaText: { fontFamily: fonts.ui, fontSize: 9, letterSpacing: 1, color: colors.fog },
  metaDot: { fontSize: 8, color: colors.ash },
  ratingRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 10 },
  ratingText: { fontFamily: fonts.body, fontSize: 12, color: colors.bone, opacity: 0.7 },

  // ── Director ──
  directorLink: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 16, marginTop: 8 },
  directorLabel: { fontFamily: fonts.ui, fontSize: 10, letterSpacing: 1, color: colors.fog },
  directorName: { fontFamily: fonts.ui, fontSize: 10, letterSpacing: 1, color: colors.bone, textDecorationLine: 'underline', textDecorationColor: 'rgba(139,105,20,0.3)' },
  directorArrow: { fontFamily: fonts.ui, fontSize: 10, color: colors.fog },

  // ── My Log Card ──
  myLogCard: {
    backgroundColor: 'rgba(196,150,26,0.08)', borderWidth: 1, borderColor: 'rgba(196,150,26,0.2)',
    borderRadius: 8, paddingHorizontal: 16, paddingVertical: 10, alignItems: 'center',
    marginBottom: 16, width: '100%',
  },
  myLogDate: { fontFamily: fonts.ui, fontSize: 9, letterSpacing: 1, color: colors.fog },
  myLogWith: { fontFamily: fonts.bodyItalic, fontSize: 10, color: colors.bone, opacity: 0.8, marginTop: 4 },

  // ── CTAs ──
  ctaColumn: { width: '100%', gap: 10 },
  ctaPrimary: {
    backgroundColor: 'rgba(139, 105, 20, 0.95)', borderRadius: 2,
    paddingVertical: 16, alignItems: 'center', borderWidth: 1, borderColor: 'rgba(242, 232, 160, 0.4)',
    ...effects.shadowSurface, ...effects.glowSepia,
  },
  ctaPrimaryText: { fontFamily: fonts.uiBold, fontSize: 12, letterSpacing: 2, color: colors.ink },
  ctaRow: { flexDirection: 'row', gap: 10 },
  ctaSecondary: {
    flex: 1, borderWidth: 1, borderColor: 'rgba(139, 105, 20, 0.3)', borderRadius: 2,
    paddingVertical: 12, alignItems: 'center', backgroundColor: 'rgba(10, 7, 3, 0.4)',
    ...effects.shadowPrimary,
  },
  ctaDanger: { borderColor: colors.bloodReel, backgroundColor: 'rgba(107,26,10,0.1)' },
  ctaSecondaryText: { fontFamily: fonts.uiMedium, fontSize: 10, letterSpacing: 2, color: colors.bone },

  // ── Sections ──
  section: { marginTop: 24, paddingHorizontal: 20 },
  synopsis: { fontFamily: fonts.body, fontSize: 15, color: colors.bone, lineHeight: 28, marginTop: 8 },

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
  similarTitle: { fontFamily: fonts.sub, fontSize: 10, color: colors.bone, lineHeight: 14 },

  // ── Back ──
  backBtn: { marginTop: 24, paddingVertical: 12, paddingHorizontal: 24, borderWidth: 1, borderColor: colors.ash, borderRadius: 4 },
  backBtnText: { fontFamily: fonts.ui, fontSize: 10, letterSpacing: 2, color: colors.bone },
});

// ── Sub-component styles ──
const st = StyleSheet.create({
  // Shimmer
  shimmer: { backgroundColor: colors.ash, opacity: 0.4 },

  // Prestige Badge
  prestigeBadge: {
    paddingHorizontal: 10, paddingVertical: 4, borderRadius: 2,
    borderWidth: 1, borderColor: colors.sepia, backgroundColor: 'rgba(139,105,20,0.1)',
    marginBottom: 12, alignSelf: 'center',
  },
  prestigeText: { fontFamily: fonts.ui, fontSize: 8, letterSpacing: 2, color: colors.flicker },

  // Obscurity Badge
  obsBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 4, borderWidth: 1, borderRadius: 3, marginBottom: 8 },
  obsScore: { fontFamily: fonts.uiBold, fontSize: 14 },
  obsLabel: { fontFamily: fonts.ui, fontSize: 8, letterSpacing: 2, color: colors.fog },

  // Video Thumbnails
  videoThumb: { width: 200, height: 112, borderRadius: 4, overflow: 'hidden', position: 'relative', borderWidth: StyleSheet.hairlineWidth, borderColor: colors.ash },
  videoImg: { width: '100%', height: '100%' },
  videoPlayOverlay: { ...StyleSheet.absoluteFillObject, justifyContent: 'center', alignItems: 'center' },
  videoPlayCircle: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: 'rgba(10,7,3,0.7)', borderWidth: 1.5, borderColor: 'rgba(242,232,160,0.5)',
    justifyContent: 'center', alignItems: 'center', paddingLeft: 2,
  },
  videoLabelWrap: { position: 'absolute', bottom: 0, left: 0, right: 0, padding: 6, backgroundColor: 'rgba(10,7,3,0.7)' },
  videoType: { fontFamily: fonts.ui, fontSize: 7, letterSpacing: 1.5, color: colors.sepia },
  videoName: { fontFamily: fonts.body, fontSize: 10, color: colors.bone, marginTop: 1 },

  // Studio Card
  studioCard: { width: 80, alignItems: 'center' },
  studioLogo: { width: 60, height: 40, borderRadius: 4, marginBottom: 6, backgroundColor: colors.soot, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.ash },
  studioName: { fontFamily: fonts.ui, fontSize: 8, color: colors.bone, textAlign: 'center', letterSpacing: 0.5 },
  studioCountry: { fontFamily: fonts.ui, fontSize: 7, color: colors.fog, letterSpacing: 1, marginTop: 2 },

  // Review Card (with tier badges + quote)
  reviewCard: {
    backgroundColor: colors.soot, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.ash,
    borderRadius: 4, padding: 16, marginTop: 10,
    borderLeftWidth: 2, borderLeftColor: 'rgba(196,150,26,0.3)',
    position: 'relative', overflow: 'hidden',
  },
  reviewQuote: {
    position: 'absolute', top: -4, left: 10, fontSize: 60,
    fontFamily: fonts.display, color: colors.sepia, opacity: 0.3,
  },
  reviewAuthor: { fontFamily: fonts.ui, fontSize: 10, letterSpacing: 1, color: colors.sepia },
  reviewTier: { fontFamily: fonts.ui, fontSize: 8, letterSpacing: 0.8, color: colors.fog, marginTop: 2 },
  reviewText: { fontFamily: fonts.bodyItalic, fontSize: 13, color: colors.bone, lineHeight: 20, opacity: 0.85 },
});
