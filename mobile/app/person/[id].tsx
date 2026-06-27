/**
 * PersonDetailScreen — Actor / Director dossier page.
 *
 * THE MOST BEAUTIFUL DOSSIER PAGE IN THE WORLD.
 *
 * Criterion-grade native implementation:
 *  • Full-bleed hero backdrop from their defining film
 *  • Film-strip perforation bar — ReelHouse signature
 *  • Rectangular portrait with sepia glow aura
 *  • Est. 1924 society watermark
 *  • Career span calculation ("32 YEARS IN CINEMA")
 *  • Career stats strip (credits + known-for)
 *  • Share to Lounge CTA (archivist+ only)
 *  • Auteur Hunt progress bar (directors only)
 *  • Classified Dossier biography with fade mask
 *  • Defining Works — hero cards with gradient overlay
 *  • MarqueeLights between sections
 *  • Gold gradient separator
 *  • Complete Filmography — 3-col poster grid with titles
 *  • ObscurityBadge per film card
 *  • Shimmer loading with Reanimated pulse
 *  • Death-date in red, birth-place subtle
 *  • 100% StyleSheet — zero inline styles
 *  • Zero cheap emoji — all Lucide vector icons
 *  • Zero performance regression — all animations native thread
 */
import { useState, useMemo, useCallback } from 'react';
import {
  View, Text, StyleSheet,
  RefreshControl, useWindowDimensions,
} from 'react-native';
import { CinematicFlashList } from '@/src/components/layout/CinematicFlashList';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams } from 'expo-router';
import { nav } from '@/src/utils/typedRouter';
import { useQuery } from '@tanstack/react-query';
import { tmdb } from '@/src/lib/tmdb';
import { useArchiveStore } from '@/src/stores/films';
import { useAuthStore } from '@/src/stores/auth';
import { isArchivistPlusTier } from '@/src/utils/tier';
import { colors } from '@/src/theme/theme';
import { MarqueeLights } from '@/src/components/Decorative';
import PressableScale from '@/src/components/PressableScale';
import { ArrowLeft } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import NetInfo from '@react-native-community/netinfo';

import { s } from '@/app/person/personStyles';
import { ShimmerBlock } from '@/src/components/person/PersonOrnaments';
import { PersonHero, formatDossierDate, calcCareerSpan } from '@/src/components/person/PersonHero';
import { PersonBio } from '@/src/components/person/PersonBio';
import { PersonDefining } from '@/src/components/person/PersonDefining';
import { renderGridItem, FilmographyHeader } from '@/src/components/person/PersonFilmography';

// ── Strict Interfaces ────────────────────────────────────────
interface PersonDetail {
  name: string;
  profile_path: string | null;
  birthday: string | null;
  deathday: string | null;
  place_of_birth: string | null;
  known_for_department: string | null;
  biography: string | null;
}

interface PersonCredit {
  id: number;
  title?: string;
  name?: string;
  poster_path: string | null;
  backdrop_path?: string | null;
  release_date?: string;
  vote_average?: number;
  vote_count?: number;
  popularity?: number;
  character?: string;
  job?: string;
}

// ════════════════════════════════════════════════════════════
//  MAIN PERSON DETAIL SCREEN
// ════════════════════════════════════════════════════════════
export default function PersonDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [showFullBio, setShowFullBio] = useState(false);
  const [isManualRefresh, setIsManualRefresh] = useState(false);
  const _loggedIndex = useArchiveStore(s => s._loggedIndex);
  const user = useAuthStore(s => s.user);
  const insets = useSafeAreaInsets();
  const { width: windowWidth } = useWindowDimensions();

  const heroDynStyle = useMemo(() => ({ height: windowWidth * 0.6 }), [windowWidth]);
  const floatingBackDynStyle = useMemo(() => ({ top: Math.max(insets.top + 10, 20) }), [insets.top]);
  const scrollContentDynStyle = useMemo(() => ({ paddingBottom: 100 + insets.bottom }), [insets.bottom]);

  const personId = Number(id);
  const isArchivist = isArchivistPlusTier(user);

  const {
    data,
    isLoading: loading,
    error,
    refetch: handleRefresh,
  } = useQuery({
    queryKey: ['person', personId],
    queryFn: async () => {
      const netState = await NetInfo.fetch();
      if (netState.isConnected === false) {
        throw new Error('NETWORK_OFFLINE');
      }

      const [personData, creditData] = await Promise.all([
        tmdb.person(personId),
        tmdb.personCredits(personId),
      ]);

      let credits: PersonCredit[] = [];
      if (creditData) {
        const seen = new Map<number, PersonCredit>();
        for (const cRaw of [...(creditData.cast || []), ...(creditData.crew || [])]) {
          const c = cRaw as any;
          const existing = seen.get(c.id);
          if (!existing) {
            seen.set(c.id, { ...c } as any);
          } else {
            if (c.job === 'Director') existing.job = 'Director';
            if (c.character) existing.character = c.character;
            if ((c.popularity ?? 0) > (existing.popularity ?? 0)) {
              existing.popularity = c.popularity;
            }
          }
        }
        credits = Array.from(seen.values());
      }
      return {
        person: personData as unknown as PersonDetail,
        allCredits: credits,
      };
    },
    enabled: !!personId && !isNaN(personId),
    staleTime: 5 * 60 * 1000,
  });

  const person = data?.person || null;
  const allCredits = useMemo(() => data?.allCredits || [], [data?.allCredits]);
  const isLongBio = person?.biography ? (person.biography.length > 300 || (person.biography.match(/\n/g) || []).length > 3) : false;

  // ── Stable Handlers ──
  const handleBack = useCallback(() => {
    nav.back();
  }, []);

  const onPullToRefresh = useCallback(async () => {
    setIsManualRefresh(true);
    try {
      await handleRefresh();
    } finally {
      setIsManualRefresh(false);
    }
  }, [handleRefresh]);

  const handleToggleBio = useCallback(() => {
    setShowFullBio((prev) => !prev);
  }, []);

  const handleLoungeShare = useCallback(() => {
    if (!person) return;
    nav.push('/(modals)/social-modal', {
      mode: 'share-person',
      personId: String(id),
      personName: person.name,
    });
  }, [person, id]);

  // ── Derived data ──
  const { definingWorks, definingFilm } = useMemo(() => {
    const popularWithPosters: PersonCredit[] = [];
    let bestBackdropFilm: PersonCredit | null = null;
    let highestBackdropScore = -1;
    let bestOverallFilm: PersonCredit | null = null;
    let highestOverallScore = -1;

    for (const film of allCredits) {
      const legacyScore = (film.vote_count ?? 0) * 10 + (film.popularity ?? 0);
      const votes = film.vote_count ?? 0;
      
      if (film.poster_path && votes > 5) {
        popularWithPosters.push(film);
      }
      
      if (film.backdrop_path && legacyScore > highestBackdropScore) {
        highestBackdropScore = legacyScore;
        bestBackdropFilm = film;
      }

      if (legacyScore > highestOverallScore) {
        highestOverallScore = legacyScore;
        bestOverallFilm = film;
      }
    }
    
    popularWithPosters.sort((a, b) => {
      const scoreA = (a.vote_count ?? 0) * 10 + (a.popularity ?? 0);
      const scoreB = (b.vote_count ?? 0) * 10 + (b.popularity ?? 0);
      return scoreB - scoreA;
    });
    
    return {
      definingWorks: popularWithPosters.slice(0, 4),
      definingFilm: bestBackdropFilm || bestOverallFilm
    };
  }, [allCredits]);

  const heroBackdrop = definingFilm?.backdrop_path ? tmdb.backdrop(definingFilm.backdrop_path) : null;
  const filmography = useMemo(() => {
    return [...allCredits].sort((a, b) => {
      const dateA = a.release_date || '9999-99-99';
      const dateB = b.release_date || '9999-99-99';
      if (dateA > dateB) return -1;
      if (dateA < dateB) return 1;
      return (b.popularity || 0) - (a.popularity || 0);
    });
  }, [allCredits]);
  const remainingCredits = filmography; // Replaced truncated list with true historical archive
  const totalFilms = allCredits.length;
  const careerSpan = useMemo(() => calcCareerSpan(person, allCredits), [person, allCredits]);

  const directedFilms = useMemo(() => {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const localToday = `${y}-${m}-${day}`;

    return allCredits.filter((c) => {
      if (c.job !== 'Director') return false;
      const isLogged = _loggedIndex[c.id] !== undefined;
      const isReleased = !!(c.release_date && c.release_date <= localToday);
      const hasVotes = (c.vote_count ?? 0) > 0;
      return isReleased || isLogged || hasVotes;
    });
  }, [allCredits, _loggedIndex]);
  const seenCount = useMemo(() => {
    if (directedFilms.length === 0) return 0;
    return directedFilms.filter(f => {
      const log = _loggedIndex[f.id] as any;
      return log !== undefined && log.status !== 'abandoned';
    }).length;
  }, [_loggedIndex, directedFilms]);
  const auteurPct = directedFilms.length > 0 ? Math.round((seenCount / directedFilms.length) * 100) : 0;
  const isAuteurMastery = directedFilms.length > 0 && seenCount === directedFilms.length;
  const auteurHuntDynStyle = useMemo(() => ({ width: `${auteurPct}%` as import('react-native').DimensionValue }), [auteurPct]);

  // ── Error (Offline) ──
  if (error) return (
    <View style={[s.container, s.notFoundContainer]}>
      <View style={[s.floatingBack, floatingBackDynStyle]}>
        <PressableScale onPress={handleBack} hitSlop={{ top: 20, bottom: 20, left: 20, right: 20 }} haptic="light">
          <ArrowLeft size={16} color={colors.sepia} strokeWidth={1.5} />
        </PressableScale>
      </View>
      <Text style={s.notFoundLabel}>CONNECTION TIMED OUT</Text>
      <Text style={s.notFoundTitle}>Signal Disrupted</Text>
      <Text style={s.notFoundBody}>The telegraph to the TMDB archive failed. Please check your connection.</Text>
      <PressableScale style={s.backBtnBottom} onPress={() => handleRefresh()} hitSlop={{ top: 20, bottom: 20, left: 20, right: 20 }} haptic="selection">
        <View style={s.backBtnRow}>
          <Text style={s.backBtnBottomText}>RETRY TRANSMISSION</Text>
        </View>
      </PressableScale>
    </View>
  );

  // ── Loading ──
  if (loading) return (
    <View style={s.container}>
      <View style={[s.floatingBack, floatingBackDynStyle]}>
        <PressableScale onPress={handleBack} hitSlop={{ top: 20, bottom: 20, left: 20, right: 20 }} haptic="light">
          <ArrowLeft size={16} color={colors.sepia} strokeWidth={1.5} />
        </PressableScale>
      </View>
      <View style={[s.shimmerBackdrop, heroDynStyle]}>
        <ShimmerBlock style={StyleSheet.absoluteFillObject} />
        <LinearGradient colors={['rgba(11,10,8,0.1)', 'rgba(11,10,8,0.6)', colors.ink]} locations={[0, 0.7, 1]} style={StyleSheet.absoluteFill} />
      </View>
      <View style={s.shimmerContent}>
        <ShimmerBlock style={s.shimmerPortrait} />
        <ShimmerBlock style={s.shimmerSocietyMark} />
        <ShimmerBlock style={s.shimmerDeptBadge} />
        <ShimmerBlock style={s.shimmerName} />
        <ShimmerBlock style={s.shimmerDateRow} />
        <View style={s.shimmerStatsRow}>
          <ShimmerBlock style={s.shimmerStat} />
          <ShimmerBlock style={s.shimmerStat} />
        </View>
      </View>
    </View>
  );

  // ── Not found ──
  if (!person) return (
    <View style={[s.container, s.notFoundContainer]}>
      <Text style={s.notFoundLabel}>ARCHIVE DEPT — FILE NOT FOUND</Text>
      <Text style={s.notFoundTitle}>No Record On File</Text>
      <Text style={s.notFoundBody}>
        This person does not exist in the TMDB archive, or the reel was lost.
      </Text>
      <PressableScale style={s.backBtnBottom} onPress={handleBack} hitSlop={{ top: 20, bottom: 20, left: 20, right: 20 }} haptic="light">
        <View style={s.backBtnRow}>
          <ArrowLeft size={12} color={colors.bone} strokeWidth={1.5} />
          <Text style={s.backBtnBottomText}>GO BACK</Text>
        </View>
      </PressableScale>
    </View>
  );

  const photoUri = person.profile_path ? tmdb.profile(person.profile_path, 'h632') : null;

  return (
    <View style={s.container}>
      {/* ── Floating Back Button ── */}
      <PressableScale style={[s.floatingBack, floatingBackDynStyle]} onPress={handleBack} hitSlop={{ top: 20, bottom: 20, left: 20, right: 20 }} haptic="light">
        <ArrowLeft size={16} color={colors.sepia} strokeWidth={1.5} />
      </PressableScale>

      <CinematicFlashList
        bottomInset={insets.bottom}
        data={remainingCredits}
        numColumns={3}
        estimatedItemSize={200}
        contentContainerStyle={[s.scrollContent, scrollContentDynStyle]}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={isManualRefresh} onRefresh={onPullToRefresh} tintColor={colors.sepia} colors={[colors.sepia]} progressBackgroundColor={colors.ink} />}
        ListHeaderComponent={<View>
          <PersonHero
            person={person}
            heroBackdrop={heroBackdrop ?? null}
            photoUri={photoUri ?? null}
            heroDynStyle={heroDynStyle}
            totalFilms={totalFilms}
            careerSpan={careerSpan}
            definingFilm={definingFilm}
            isArchivist={!!isArchivist}
            handleLoungeShare={handleLoungeShare}
            directedFilms={directedFilms}
            seenCount={seenCount}
            auteurPct={auteurPct}
            isAuteurMastery={isAuteurMastery}
            auteurHuntDynStyle={auteurHuntDynStyle}
            formatDossierDate={formatDossierDate}
          />

          {/* ═══ CLASSIFIED DOSSIER — BIOGRAPHY ═══ */}
          {person.biography ? (
            <PersonBio
              biography={person.biography}
              isLongBio={isLongBio}
              showFullBio={showFullBio}
              handleToggleBio={handleToggleBio}
            />
          ) : null}

          {/* ═══ DEFINING WORKS ═══ */}
          {definingWorks.length > 0 && (
            <PersonDefining definingWorks={definingWorks} />
          )}

          {/* ── Marquee lights transition ── */}
          {definingWorks.length > 0 && remainingCredits.length > 0 && (
            <MarqueeLights count={16} />
          )}

          {/* ═══ COMPLETE FILMOGRAPHY ═══ */}
          {remainingCredits.length > 0 && (
            <FilmographyHeader />
          )}
        </View>}
        renderItem={renderGridItem}
        keyExtractor={(item) => String(item.id)}
        ListFooterComponent={<View>

        {/* ── Empty state ── */}
        {allCredits.length === 0 && !loading && (
          <View style={s.emptyState}>
            <Text style={s.emptyLabel}>THE VAULT IS SEALED</Text>
            <Text style={s.emptyTitle}>No Known Works Found</Text>
            <Text style={s.emptyBody}>The archive has no film records on file for this artist.</Text>
          </View>
        )}

        {/* ── Closing society bar ── */}
        <View style={s.closingBar}>
          <LinearGradient
            colors={['transparent', 'rgba(184,137,26,0.2)', 'transparent']}
            start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
            style={s.closingLine}
          />
          <Text style={s.closingText}>THE REELHOUSE SOCIETY</Text>
        </View>
        </View>}
      />
    </View>
  );
}
