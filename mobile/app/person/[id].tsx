/**
 * PersonDetailScreen — THE ARTIST'S FILE.
 * ─────────────────────────────────────────────────────────────
 * The Society's dossier on an actor or director, and the member's
 * own history with them.
 *
 *  · Hero backdrop from their defining film, perforation strip
 *  · The title block in four beats: identity → record → action → progress
 *  · The life line in archival type — the dagger wears crimson
 *  · THE CANON — only the work of their own craft (a director's file
 *    shows what they directed; documentaries where they appear as
 *    "Self" never masquerade as performances). Empty cuts fall back
 *    to the full record so the room is never blank.
 *  · SCREENED brass ticks on every logged poster — the Hunt made visible
 *  · THE AUTEUR HUNT — directing files only; its count IS the grid
 *  · Velvet-rope lounge: archivists share, cinephiles see the brass key
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
import PressableScale from '@/src/components/PressableScale';
import { ArrowLeft } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import NetInfo from '@react-native-community/netinfo';

import { s } from '@/src/components/person/personStyles';
import { ShimmerBlock } from '@/src/components/person/PersonOrnaments';
import { PersonHero, formatDossierDate, calcCareerSpan } from '@/src/components/person/PersonHero';
import { PersonBio } from '@/src/components/person/PersonBio';
import { PersonDefining } from '@/src/components/person/PersonDefining';
import { FilmPosterCard, FilmographyHeader, GridColumn } from '@/src/components/person/PersonFilmography';

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
  /** All crew jobs this person held on the film — the merge preserves every hat. */
  jobs?: string[];
  /** True when they appear on screen (cast credit). */
  acted?: boolean;
}

// ── The department map — each craft's jobs ───────────────────
const DEPT_JOBS: Record<string, string[]> = {
  Directing: ['Director'],
  Writing: ['Writer', 'Screenplay', 'Story', 'Novel', 'Author', 'Adaptation', 'Screenstory'],
  Production: ['Producer', 'Executive Producer', 'Co-Producer', 'Associate Producer'],
  Camera: ['Director of Photography', 'Cinematography', 'Camera Operator'],
  Editing: ['Editor', 'Film Editor'],
  Sound: ['Original Music Composer', 'Composer', 'Music', 'Sound Designer'],
};

// The stats speak the craft, not a mushy "credits" count.
const CRAFT_LABELS: Record<string, [string, string]> = {
  Directing: ['FILM DIRECTED', 'FILMS DIRECTED'],
  Acting: ['PERFORMANCE', 'PERFORMANCES'],
  Writing: ['FILM WRITTEN', 'FILMS WRITTEN'],
  Production: ['FILM PRODUCED', 'FILMS PRODUCED'],
  Camera: ['FILM SHOT', 'FILMS SHOT'],
  Editing: ['FILM CUT', 'FILMS CUT'],
  Sound: ['FILM SCORED', 'FILMS SCORED'],
};
const CREDIT_LABELS: [string, string] = ['CREDIT', 'CREDITS'];

// "Self" documentary appearances are part of the record, never performances.
const SELF_RE = /^self\b/i;

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
        // The merge preserves EVERY hat a person wore on a film: a credit
        // that arrives as Producer must not erase their Director job.
        const seen = new Map<number, PersonCredit & { _jobSet: Set<string> }>();
        for (const cRaw of [...(creditData.cast || []), ...(creditData.crew || [])]) {
          const c = cRaw as any;
          let entry = seen.get(c.id);
          if (!entry) {
            entry = { ...c, _jobSet: new Set<string>(), acted: false };
            seen.set(c.id, entry!);
          }
          const e = entry!;
          if (c.job) e._jobSet.add(c.job);
          if (c.job === 'Director') e.job = 'Director';
          if (c.character !== undefined) {
            e.character = c.character;
            e.acted = true;
          }
          if ((c.popularity ?? 0) > (e.popularity ?? 0)) {
            e.popularity = c.popularity;
          }
        }
        credits = Array.from(seen.values()).map(({ _jobSet, ...rest }) => ({
          ...rest,
          jobs: Array.from(_jobSet),
        }));
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

  // The velvet rope, not a dead end: archivists open the share sheet;
  // cinephiles are walked to the LoungeGate (✦ ASCEND THE RANKS).
  const handleLoungeShare = useCallback(() => {
    if (!user) {
      nav.push('/login');
      return;
    }
    if (!isArchivist) {
      nav.push('/lounge');
      return;
    }
    if (!person) return;
    nav.push('/(modals)/social-modal', {
      mode: 'share-person',
      personId: String(id),
      personName: person.name,
    });
  }, [user, isArchivist, person, id]);

  // ── THE CANON — the department cut ──
  const { canon, usedFallback } = useMemo(() => {
    const dept = person?.known_for_department ?? '';
    let cut: PersonCredit[] = [];
    if (dept === 'Acting') {
      cut = allCredits.filter((c) => c.acted && !SELF_RE.test(c.character ?? ''));
    } else {
      const jobs = DEPT_JOBS[dept];
      if (jobs) {
        cut = allCredits.filter((c) => c.jobs?.some((j) => jobs.includes(j)));
      }
    }
    // The safety net: bad archive data must never seal the room.
    if (cut.length === 0) return { canon: allCredits, usedFallback: true };
    return { canon: cut, usedFallback: false };
  }, [allCredits, person?.known_for_department]);

  // ── Derived data (all drawn from the canon) ──
  const { definingWorks, definingFilm } = useMemo(() => {
    const popularWithPosters: PersonCredit[] = [];
    let bestBackdropFilm: PersonCredit | null = null;
    let highestBackdropScore = -1;
    let bestOverallFilm: PersonCredit | null = null;
    let highestOverallScore = -1;

    for (const film of canon) {
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
  }, [canon]);

  const heroBackdrop = definingFilm?.backdrop_path ? tmdb.backdrop(definingFilm.backdrop_path) : null;

  const canonSorted = useMemo(() => {
    return [...canon].sort((a, b) => {
      const dateA = a.release_date || '9999-99-99';
      const dateB = b.release_date || '9999-99-99';
      if (dateA > dateB) return -1;
      if (dateA < dateB) return 1;
      return (b.popularity || 0) - (a.popularity || 0);
    });
  }, [canon]);

  const careerSpan = useMemo(() => calcCareerSpan(person, canon), [person, canon]);

  const craftLabel = useMemo(() => {
    const dept = person?.known_for_department ?? '';
    const labels = usedFallback ? CREDIT_LABELS : (CRAFT_LABELS[dept] ?? CREDIT_LABELS);
    return canon.length === 1 ? labels[0] : labels[1];
  }, [person?.known_for_department, usedFallback, canon.length]);

  // ── THE AUTEUR HUNT — directing files only; its count IS the grid ──
  const isDirectingFile = person?.known_for_department === 'Directing' && !usedFallback;

  const huntFilms = useMemo(() => {
    if (!isDirectingFile) return [];
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const localToday = `${y}-${m}-${day}`;

    return canon.filter((c) => {
      const isLogged = _loggedIndex[c.id] !== undefined;
      const isReleased = !!(c.release_date && c.release_date <= localToday);
      const hasVotes = (c.vote_count ?? 0) > 0;
      return isReleased || isLogged || hasVotes;
    });
  }, [isDirectingFile, canon, _loggedIndex]);

  const seenCount = useMemo(() => {
    if (huntFilms.length === 0) return 0;
    return huntFilms.filter(f => {
      const log = _loggedIndex[f.id] as any;
      return log !== undefined && log.status !== 'abandoned';
    }).length;
  }, [_loggedIndex, huntFilms]);

  const auteurPct = huntFilms.length > 0 ? Math.round((seenCount / huntFilms.length) * 100) : 0;
  const isAuteurMastery = huntFilms.length > 0 && seenCount === huntFilms.length;
  const auteurHuntDynStyle = useMemo(() => ({ width: `${auteurPct}%` as import('react-native').DimensionValue }), [auteurPct]);
  const showHunt = isDirectingFile && huntFilms.length > 0;

  // ── The grid — SCREENED ticks from the member's own log index ──
  const renderGridItem = useCallback(({ item, index }: { item: PersonCredit; index: number }) => {
    const log = _loggedIndex[item.id] as any;
    const screened = log !== undefined && log.status !== 'abandoned';
    return (
      <GridColumn index={index}>
        <FilmPosterCard film={item} screened={screened} />
      </GridColumn>
    );
  }, [_loggedIndex]);

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

  // ── Loading (mirrors the real anatomy exactly) ──
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
        <ShimmerBlock style={s.shimmerDeptBadge} />
        <ShimmerBlock style={s.shimmerName} />
        <ShimmerBlock style={s.shimmerDateRow} />
        <ShimmerBlock style={s.shimmerPlaceRow} />
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
      <Text style={s.notFoundLabel}>RECORDS DEPT — FILE NOT FOUND</Text>
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
        data={canonSorted}
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
            canonCount={canon.length}
            craftLabel={craftLabel}
            careerSpan={careerSpan}
            definingFilm={definingFilm}
            isArchivist={!!isArchivist}
            handleLoungeShare={handleLoungeShare}
            showHunt={showHunt}
            huntTotal={huntFilms.length}
            seenCount={seenCount}
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

          {/* ═══ THE CANON ═══ */}
          {canonSorted.length > 0 && (
            <FilmographyHeader count={canonSorted.length} />
          )}
        </View>}
        renderItem={renderGridItem}
        keyExtractor={(item) => String(item.id)}
        ListFooterComponent={<View>

        {/* ── Empty state ── */}
        {allCredits.length === 0 && !loading && (
          <View style={s.emptyState}>
            <Text style={s.emptyLabel}>THE RECORD IS BLANK</Text>
            <Text style={s.emptyTitle}>No Known Works Found</Text>
            <Text style={s.emptyBody}>The Society has no film records on file for this artist.</Text>
          </View>
        )}

        </View>}
      />
    </View>
  );
}
