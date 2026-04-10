/**
 * PersonDetailScreen — Actor / Director dossier page.
 *
 * 100 % parity with web PersonPage.tsx:
 *  • Full-bleed hero backdrop from their defining film
 *  • Rectangular portrait (card-film treatment, NOT circular)
 *  • Career stats strip (credits count + known-for title)
 *  • Classified Dossier biography with fade mask
 *  • Defining Works — large hero cards
 *  • Complete Filmography — 3-col poster grid (NOT horizontal scroll)
 *  • ObscurityBadge per film card
 *  • Death-date in red
 */
import { useEffect, useState, useMemo } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Image,
  Dimensions, RefreshControl,
} from 'react-native';
import Animated, { FadeInDown, FadeIn } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { tmdb, getYear, obscurityScore } from '@/src/lib/tmdb';
import { useFilmStore } from '@/src/stores/films';
import { colors, fonts } from '@/src/theme/theme';
import { Film, ArrowLeft } from 'lucide-react-native';

const { width: SCREEN_W } = Dimensions.get('window');
const PORTRAIT_W = 130;
const POSTER_GRID_GAP = 10;
const POSTER_COL = 3;
const POSTER_W = (SCREEN_W - 40 - POSTER_GRID_GAP * (POSTER_COL - 1)) / POSTER_COL;
const AnimatedView = Animated.createAnimatedComponent(View);

// ── Obscurity Badge ──────────────────────────────────────────
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

// ── Film Poster Card (grid item) ─────────────────────────────
function FilmPosterCard({ film, width }: { film: any; width: number }) {
  const router = useRouter();
  const posterUri = film.poster_path ? tmdb.poster(film.poster_path, 'w185') : null;
  const score = obscurityScore(film);
  return (
    <TouchableOpacity
      style={{ width }}
      onPress={() => router.push(`/film/${film.id}`)}
      activeOpacity={0.7}
    >
      {posterUri ? (
        <Image
          source={{ uri: posterUri }}
          style={[st.gridPoster, { width, height: width * 1.5 }]}
        />
      ) : (
        <View style={[st.gridPoster, { width, height: width * 1.5, backgroundColor: colors.soot, justifyContent: 'center', alignItems: 'center' }]}>
          <Text style={{ fontFamily: fonts.display, color: colors.fog, fontSize: 18 }}>✦</Text>
        </View>
      )}
      <View style={st.gridMeta}>
        <Text style={st.gridYear}>{getYear(film.release_date) || 'TBA'}</Text>
        <ObscurityBadge score={score} />
      </View>
    </TouchableOpacity>
  );
}

// ════════════════════════════════════════════════════════════
//  MAIN PERSON DETAIL SCREEN
// ════════════════════════════════════════════════════════════
export default function PersonDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [person, setPerson] = useState<any>(null);
  const [allCredits, setAllCredits] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showFullBio, setShowFullBio] = useState(false);
  const { logs } = useFilmStore();

  const personId = Number(id);

  const fetchData = async () => {
    if (!personId || isNaN(personId)) return;
    try {
      const [personData, creditData] = await Promise.all([
        tmdb.person(personId),
        tmdb.personCredits(personId),
      ]);
      setPerson(personData);

      if (creditData) {
        const seen = new Set<number>();
        const merged: any[] = [];
        for (const c of [...(creditData.cast || []), ...(creditData.crew || [])]) {
          if (!seen.has(c.id)) { seen.add(c.id); merged.push(c); }
        }
        setAllCredits(merged.filter((f: any) => f.poster_path && f.vote_count > 5).sort((a: any, b: any) => b.popularity - a.popularity));
      }
    } catch { }
    finally { setLoading(false); setRefreshing(false); }
  };

  useEffect(() => { setLoading(true); fetchData(); }, [personId]);

  // ── Derived data ──
  const definingFilm = useMemo(() => allCredits.find((f: any) => f.backdrop_path) || null, [allCredits]);
  const heroBackdrop = definingFilm?.backdrop_path ? tmdb.backdrop(definingFilm.backdrop_path) : null;
  const definingWorks = allCredits.slice(0, 4);
  const remainingCredits = allCredits.slice(4);
  const totalFilms = allCredits.length;

  const isDirector = person?.known_for_department === 'Directing';
  const directedFilms = useMemo(() => allCredits.filter((c: any) => c.job === 'Director' || (isDirector && c.character)), [allCredits, isDirector]);
  const seenCount = useMemo(() => {
    if (!isDirector || directedFilms.length === 0) return 0;
    return logs.filter((l: any) => directedFilms.some((f: any) => f.id === l.filmId)).length;
  }, [logs, directedFilms, isDirector]);
  const auteurPct = directedFilms.length > 0 ? Math.round((seenCount / directedFilms.length) * 100) : 0;

  // ── Loading ──
  if (loading) return (
    <View style={[s.container, { justifyContent: 'center', alignItems: 'center' }]}>
      {/* Shimmer skeleton */}
      <View style={{ height: 200, width: '100%', backgroundColor: colors.soot, opacity: 0.4 }} />
      <View style={{ alignItems: 'center', marginTop: -60 }}>
        <View style={{ width: 130, height: 195, backgroundColor: colors.ash, borderRadius: 4, marginBottom: 16 }} />
        <View style={{ width: 180, height: 20, backgroundColor: colors.ash, borderRadius: 2, marginBottom: 8 }} />
        <View style={{ width: 100, height: 12, backgroundColor: colors.ash, borderRadius: 2 }} />
      </View>
    </View>
  );

  // ── Not found ──
  if (!person) return (
    <View style={[s.container, { justifyContent: 'center', alignItems: 'center', padding: 32 }]}>
      <Text style={{ fontFamily: fonts.ui, fontSize: 10, letterSpacing: 4, color: colors.sepia, marginBottom: 8 }}>ARCHIVE DEPT — FILE NOT FOUND</Text>
      <Text style={{ fontFamily: fonts.display, fontSize: 22, color: colors.parchment, marginBottom: 8 }}>No Record On File</Text>
      <Text style={{ fontFamily: fonts.body, fontSize: 14, color: colors.fog, textAlign: 'center', lineHeight: 22 }}>
        This person does not exist in the TMDB archive, or the reel was lost.
      </Text>
      <TouchableOpacity style={s.backBtnBottom} onPress={() => router.back()}>
        <Text style={s.backBtnBottomText}>← GO BACK</Text>
      </TouchableOpacity>
    </View>
  );

  const photoUri = person.profile_path ? tmdb.profile(person.profile_path, 'h632') : null;

  return (
    <View style={s.container}>
      {/* ── Floating Back Button ── */}
      <TouchableOpacity style={s.floatingBack} onPress={() => router.back()} activeOpacity={0.7}>
        <ArrowLeft size={16} color={colors.sepia} />
      </TouchableOpacity>

      <ScrollView
        contentContainerStyle={{ paddingBottom: 80 }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchData(); }} tintColor={colors.sepia} />}
      >
        {/* ═══════════════════════════════════════════════════════
            THE CINEMATIC HERO — Full-bleed backdrop from defining film
        ═══════════════════════════════════════════════════════ */}
        <View style={s.heroWrap}>
          {heroBackdrop ? (
            <Image
              source={{ uri: heroBackdrop }}
              style={s.heroBg}
              resizeMode="cover"
            />
          ) : (
            <LinearGradient
              colors={['rgba(139,105,20,0.12)', 'rgba(10,7,3,0.95)']}
              style={s.heroBg}
            />
          )}
          {/* Dark sepia wash */}
          {heroBackdrop && <View style={s.heroSepia} />}
          {/* Bottom gradient fade to ink */}
          <LinearGradient
            colors={['rgba(10,7,3,0.1)', 'rgba(10,7,3,0.5)', colors.ink]}
            locations={[0, 0.6, 1]}
            style={StyleSheet.absoluteFillObject}
          />
        </View>

        {/* ═══════════════════════════════════════════════════════
            THE PROFILE DOSSIER — Overlaps hero
        ═══════════════════════════════════════════════════════ */}
        <View style={s.dossierSection}>
          {/* ── THE PORTRAIT — Rectangular, card-film style ── */}
          <AnimatedView entering={FadeIn.duration(600)} style={s.portraitWrap}>
            <View style={s.portraitCard}>
              {photoUri ? (
                <Image source={{ uri: photoUri }} style={s.portrait} resizeMode="cover" />
              ) : (
                <View style={[s.portrait, { backgroundColor: colors.soot, justifyContent: 'center', alignItems: 'center' }]}>
                  <Text style={{ fontFamily: fonts.display, fontSize: 40, color: colors.fog }}>{person.name?.charAt(0) || '?'}</Text>
                </View>
              )}
            </View>
          </AnimatedView>

          {/* ── Department badge ── */}
          {person.known_for_department && (
            <Text style={s.deptLabel}>{person.known_for_department.toUpperCase()}</Text>
          )}

          {/* ── THE NAME ── */}
          <Text style={s.personName}>{person.name}</Text>

          {/* ── Birth / Death dates ── */}
          <View style={s.dateRow}>
            {person.birthday && (
              <Text style={s.dateText}>
                BORN: {new Date(person.birthday + 'T12:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }).toUpperCase()}
              </Text>
            )}
            {person.deathday && (
              <Text style={[s.dateText, { color: 'rgba(200,80,80,0.7)' }]}>
                DIED: {new Date(person.deathday + 'T12:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }).toUpperCase()}
              </Text>
            )}
            {person.place_of_birth && (
              <Text style={[s.dateText, { opacity: 0.7 }]}>{person.place_of_birth.toUpperCase()}</Text>
            )}
          </View>

          {/* ── Career stats strip ── */}
          {totalFilms > 0 && (
            <View style={s.statsStrip}>
              <View style={s.statChip}>
                <Film size={11} color={colors.sepia} />
                <Text style={s.statText}>{totalFilms} CREDITS</Text>
              </View>
              {definingFilm && (
                <Text style={s.knownForText}>
                  KNOWN FOR: <Text style={s.knownForTitle}>{definingFilm.title}</Text>
                </Text>
              )}
            </View>
          )}

          {/* ── The Auteur Hunt (directors only) ── */}
          {isDirector && directedFilms.length > 0 && (
            <View style={s.auteurHunt}>
              <View style={s.auteurHuntHeader}>
                <Text style={s.auteurHuntTitle}>THE AUTEUR HUNT</Text>
                <Text style={s.auteurHuntCount}>{seenCount} OF {directedFilms.length} SEEN</Text>
              </View>
              <View style={s.auteurHuntTrack}>
                <View style={[s.auteurHuntFill, { width: `${auteurPct}%` }]} />
              </View>
            </View>
          )}
        </View>

        {/* ═══════════════════════════════════════════════════════
            CLASSIFIED DOSSIER — Biography
        ═══════════════════════════════════════════════════════ */}
        {person.biography ? (
          <AnimatedView entering={FadeInDown.delay(100).duration(500)} style={s.bioSection}>
            {/* Top accent line */}
            <LinearGradient
              colors={['rgba(139,105,20,0.4)', 'transparent']}
              start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
              style={s.bioTopLine}
            />
            <Text style={s.bioLabel}>CLASSIFIED DOSSIER — BIOGRAPHY</Text>
            <TouchableOpacity onPress={() => setShowFullBio(!showFullBio)} activeOpacity={0.8}>
              <Text style={s.bioText} numberOfLines={showFullBio ? undefined : 8}>
                {person.biography}
              </Text>
              {!showFullBio && person.biography.length > 300 && (
                <LinearGradient
                  colors={['transparent', 'rgba(10,7,3,0.9)']}
                  style={s.bioFadeMask}
                />
              )}
            </TouchableOpacity>
            {person.biography.length > 300 && (
              <TouchableOpacity onPress={() => setShowFullBio(!showFullBio)}>
                <Text style={s.bioToggle}>{showFullBio ? '▲ LESS' : '▼ READ MORE'}</Text>
              </TouchableOpacity>
            )}
          </AnimatedView>
        ) : null}

        {/* ═══════════════════════════════════════════════════════
            DEFINING WORKS — The Legacy
        ═══════════════════════════════════════════════════════ */}
        {definingWorks.length > 0 && (
          <AnimatedView entering={FadeInDown.delay(200).duration(500)} style={s.section}>
            <View style={s.sectionHeader}>
              <Text style={s.sectionLabel}>DEFINING WORKS</Text>
              <Text style={s.sectionTitle}>The Legacy</Text>
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 20, gap: 12 }}>
              {definingWorks.map((film: any) => {
                const posterUri = film.poster_path ? tmdb.poster(film.poster_path, 'w342') : null;
                const score = obscurityScore(film);
                return (
                  <TouchableOpacity
                    key={film.id}
                    style={s.definingCard}
                    onPress={() => router.push(`/film/${film.id}`)}
                    activeOpacity={0.7}
                  >
                    <View style={s.definingPosterWrap}>
                      {posterUri ? (
                        <Image source={{ uri: posterUri }} style={s.definingPoster} resizeMode="cover" />
                      ) : (
                        <View style={[s.definingPoster, { backgroundColor: colors.soot, justifyContent: 'center', alignItems: 'center' }]}>
                          <Text style={{ fontFamily: fonts.display, fontSize: 20, color: colors.fog }}>✦</Text>
                        </View>
                      )}
                      {/* Title overlay at bottom */}
                      <LinearGradient
                        colors={['transparent', 'rgba(10,7,3,0.5)', 'rgba(10,7,3,0.9)']}
                        locations={[0, 0.5, 1]}
                        style={s.definingOverlay}
                      >
                        <Text style={s.definingTitle} numberOfLines={2}>{film.title}</Text>
                        <Text style={s.definingYear}>
                          {getYear(film.release_date) || 'TBA'}
                          {film.vote_average > 0 && <Text> · ★ {film.vote_average.toFixed(1)}</Text>}
                        </Text>
                      </LinearGradient>
                    </View>
                    <View style={{ marginTop: 6 }}>
                      <ObscurityBadge score={score} />
                    </View>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </AnimatedView>
        )}

        {/* ═══════════════════════════════════════════════════════
            COMPLETE FILMOGRAPHY — 3-col poster grid
        ═══════════════════════════════════════════════════════ */}
        {remainingCredits.length > 0 && (
          <AnimatedView entering={FadeInDown.delay(300).duration(500)} style={s.section}>
            {/* Gold separator */}
            <View style={s.goldSeparator} />

            <View style={s.sectionHeader}>
              <Text style={s.sectionLabel}>COMPLETE FILMOGRAPHY</Text>
              <Text style={s.sectionTitle}>The Full Archive</Text>
            </View>

            <View style={s.filmGrid}>
              {remainingCredits.map((film: any) => (
                <FilmPosterCard key={film.id} film={film} width={POSTER_W} />
              ))}
            </View>
          </AnimatedView>
        )}

        {/* ── Empty state ── */}
        {allCredits.length === 0 && !loading && (
          <View style={s.emptyState}>
            <Text style={s.emptyLabel}>THE VAULT IS SEALED</Text>
            <Text style={s.emptyTitle}>No Known Works Found</Text>
            <Text style={s.emptyBody}>The archive has no film records on file for this artist.</Text>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

// ════════════════════════════════════════════════════════════
//  STYLES — NITRATE NOIR (100 % web parity)
// ════════════════════════════════════════════════════════════
const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.ink },

  // ── Floating Back ──
  floatingBack: {
    position: 'absolute', top: 50, left: 16, zIndex: 100,
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: 'rgba(10,7,3,0.6)', borderWidth: 1, borderColor: 'rgba(139,105,20,0.3)',
    alignItems: 'center', justifyContent: 'center',
  },

  // ── Hero Backdrop ──
  heroWrap: { height: SCREEN_W * 0.55, minHeight: 220, maxHeight: 280, position: 'relative', overflow: 'hidden' },
  heroBg: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, width: '100%', height: '100%' },
  heroSepia: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(10,7,3,0.55)' },

  // ── Dossier Section (overlaps hero) ──
  dossierSection: { alignItems: 'center', marginTop: -70, paddingHorizontal: 20, zIndex: 2 },

  // ── Portrait (rectangular, card-film style) ──
  portraitWrap: { marginBottom: 16 },
  portraitCard: {
    width: PORTRAIT_W, height: PORTRAIT_W * 1.5, borderRadius: 4, overflow: 'hidden',
    borderWidth: 1, borderColor: 'rgba(139,105,20,0.2)',
    shadowColor: '#000', shadowOffset: { width: 0, height: 20 }, shadowOpacity: 0.8, shadowRadius: 30,
    elevation: 20,
  },
  portrait: { width: '100%', height: '100%' },

  // ── Department & Name ──
  deptLabel: {
    fontFamily: fonts.ui, fontSize: 9, letterSpacing: 3.5, color: colors.sepia,
    marginBottom: 8, opacity: 0.85,
  },
  personName: {
    fontFamily: fonts.display, fontSize: 28, color: colors.parchment,
    textAlign: 'center', lineHeight: 32, marginBottom: 8,
    textShadowColor: 'rgba(139,105,20,0.2)', textShadowOffset: { width: 3, height: 3 }, textShadowRadius: 4,
  },

  // ── Dates ──
  dateRow: { alignItems: 'center', gap: 4, marginBottom: 16 },
  dateText: { fontFamily: fonts.ui, fontSize: 9, letterSpacing: 1, color: colors.fog },

  // ── Stats Strip ──
  statsStrip: { flexDirection: 'row', gap: 16, flexWrap: 'wrap', justifyContent: 'center', alignItems: 'center', marginBottom: 16 },
  statChip: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  statText: { fontFamily: fonts.ui, fontSize: 9, letterSpacing: 1.2, color: colors.bone },
  knownForText: { fontFamily: fonts.ui, fontSize: 9, letterSpacing: 1.2, color: colors.fog },
  knownForTitle: { color: colors.bone, textDecorationLine: 'underline', textDecorationColor: 'rgba(139,105,20,0.3)' },

  // ── Auteur Hunt ──
  auteurHunt: {
    width: '100%', maxWidth: 300, marginBottom: 16,
    paddingHorizontal: 16, paddingVertical: 12,
    backgroundColor: 'rgba(196,150,26,0.06)', borderRadius: 2,
    borderWidth: 1, borderColor: 'rgba(196,150,26,0.2)',
  },
  auteurHuntHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  auteurHuntTitle: { fontFamily: fonts.ui, fontSize: 8, letterSpacing: 1.5, color: colors.sepia },
  auteurHuntCount: { fontFamily: fonts.uiMedium, fontSize: 8, letterSpacing: 1, color: colors.parchment },
  auteurHuntTrack: { height: 2, backgroundColor: colors.ash, borderRadius: 2, overflow: 'hidden' },
  auteurHuntFill: { height: '100%', backgroundColor: colors.sepia },

  // ── Biography ──
  bioSection: {
    marginHorizontal: 20, marginBottom: 24, marginTop: 8,
    padding: 20,
    backgroundColor: 'rgba(25,20,15,0.6)',
    borderWidth: 1, borderColor: 'rgba(139,105,20,0.15)',
    borderLeftWidth: 2, borderLeftColor: 'rgba(139,105,20,0.4)',
    borderRadius: 4, borderTopLeftRadius: 0,
    position: 'relative', overflow: 'hidden',
  },
  bioTopLine: { position: 'absolute', top: 0, left: 0, right: 0, height: 1 },
  bioLabel: { fontFamily: fonts.ui, fontSize: 8, letterSpacing: 3, color: colors.sepia, marginBottom: 12, opacity: 0.8 },
  bioText: { fontFamily: fonts.body, fontSize: 14, color: colors.bone, lineHeight: 24 },
  bioFadeMask: { position: 'absolute', bottom: 0, left: 0, right: 0, height: 50 },
  bioToggle: { fontFamily: fonts.ui, fontSize: 9, letterSpacing: 2, color: colors.sepia, marginTop: 8 },

  // ── Section Headers ──
  section: { marginTop: 8, marginBottom: 16 },
  sectionHeader: {
    paddingHorizontal: 20, marginBottom: 16,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.ash,
    paddingBottom: 12,
  },
  sectionLabel: { fontFamily: fonts.ui, fontSize: 9, letterSpacing: 2, color: colors.sepia, marginBottom: 4 },
  sectionTitle: { fontFamily: fonts.display, fontSize: 22, color: colors.parchment },

  // ── Defining Works ──
  definingCard: { width: 130 },
  definingPosterWrap: {
    width: 130, height: 195, borderRadius: 4, overflow: 'hidden',
    borderWidth: 1, borderColor: 'rgba(139,105,20,0.2)',
    shadowColor: '#000', shadowOffset: { width: 0, height: 12 }, shadowOpacity: 0.7, shadowRadius: 15,
    elevation: 12, position: 'relative',
  },
  definingPoster: { width: '100%', height: '100%' },
  definingOverlay: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    paddingHorizontal: 8, paddingBottom: 8, paddingTop: 40,
  },
  definingTitle: { fontFamily: fonts.sub, fontSize: 12, color: colors.parchment, lineHeight: 15 },
  definingYear: { fontFamily: fonts.ui, fontSize: 8, letterSpacing: 1, color: colors.fog, marginTop: 3 },

  // ── Gold Separator ──
  goldSeparator: { height: 1, marginHorizontal: 20, marginBottom: 20, backgroundColor: 'rgba(139,105,20,0.3)' },

  // ── Filmography Grid ──
  filmGrid: {
    flexDirection: 'row', flexWrap: 'wrap',
    paddingHorizontal: 20, gap: POSTER_GRID_GAP,
  },

  // ── Empty State ──
  emptyState: {
    padding: 32, marginHorizontal: 20, alignItems: 'center',
    borderWidth: 1, borderStyle: 'dashed', borderColor: 'rgba(139,105,20,0.2)',
    borderRadius: 4, backgroundColor: 'rgba(18,14,9,0.4)',
  },
  emptyLabel: { fontFamily: fonts.ui, fontSize: 8, letterSpacing: 3, color: colors.sepia, marginBottom: 8 },
  emptyTitle: { fontFamily: fonts.display, fontSize: 20, color: colors.parchment, opacity: 0.6, marginBottom: 4 },
  emptyBody: { fontFamily: fonts.body, fontSize: 14, color: colors.fog, fontStyle: 'italic', textAlign: 'center' },

  // ── Bottom Back ──
  backBtnBottom: { marginTop: 24, paddingVertical: 12, paddingHorizontal: 24, borderWidth: 1, borderColor: colors.ash, borderRadius: 2 },
  backBtnBottomText: { fontFamily: fonts.ui, fontSize: 10, letterSpacing: 2, color: colors.bone },
});

// ── Small shared styles ──
const st = StyleSheet.create({
  obsBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 6, paddingVertical: 2, borderWidth: 1, borderRadius: 2 },
  obsScore: { fontFamily: fonts.uiBold, fontSize: 10 },
  obsLabel: { fontFamily: fonts.ui, fontSize: 7, letterSpacing: 1.5, color: colors.fog },
  gridPoster: {
    borderRadius: 4, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.ash,
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.5, shadowRadius: 8,
    elevation: 6,
  },
  gridMeta: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 6 },
  gridYear: { fontFamily: fonts.ui, fontSize: 9, color: colors.fog, letterSpacing: 1 },
});
