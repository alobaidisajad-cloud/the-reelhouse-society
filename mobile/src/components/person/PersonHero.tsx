/**
 * PersonHero — the title block of the artist's file. Four beats:
 *   identity  (dept badge · name · the life line)
 *   record    (craft stats · known for →)
 *   action    (lounge — every rank sees the door; cinephiles get the key)
 *   progress  (THE AUTEUR HUNT — directing files only, frame-notched)
 *
 * The life line follows archival convention: dates first, ground second,
 * the dagger (†) in crimson for the departed. No skulls in this house.
 */
import { memo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { colors, SEPIA_HASH } from '@/src/theme/theme';
import PressableScale from '@/src/components/PressableScale';
import { Film as FilmIcon, MessageCircle, KeyRound } from 'lucide-react-native';
import { nav } from '@/src/utils/typedRouter';
import { s } from '@/src/components/person/personStyles';
import { FilmStripPerforations } from '@/src/components/person/PersonFilmography';

import type { DimensionValue } from 'react-native';

// ── Interfaces ──────────────────────────────────────────────
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

interface PersonHeroProps {
  person: PersonDetail;
  heroBackdrop: string | null;
  photoUri: string | null;
  heroDynStyle: { height: number };
  canonCount: number;
  craftLabel: string;
  careerSpan: number;
  definingFilm: PersonCredit | null;
  isArchivist: boolean;
  handleLoungeShare: () => void;
  showHunt: boolean;
  huntTotal: number;
  seenCount: number;
  isAuteurMastery: boolean;
  auteurHuntDynStyle: { width: DimensionValue };
  formatDossierDate: (dateStr: string | null) => string;
}

// Static frame notches — eleven ticks make twelve frames of film.
const HUNT_NOTCHES = Array.from({ length: 11 }, (_, i) => i);

// ── Utility — format dossier date ────────────────────────────
export function formatDossierDate(dateStr: string | null): string {
  if (!dateStr) return '';
  if (dateStr.length === 4) return dateStr;
  try {
    const isoString = dateStr.length === 10 ? `${dateStr}T12:00:00Z` : dateStr;
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return dateStr;
    return d.toLocaleDateString('en-US', { timeZone: 'UTC', month: 'short', day: 'numeric', year: 'numeric' }).toUpperCase();

  } catch (e) {
    return dateStr;
  }
}

// ── Utility — career span in years ──────────────────────────
export function calcCareerSpan(person: PersonDetail | null, credits: PersonCredit[]): number {
  if (credits.length === 0) return 0;
  const currentYear = new Date().getFullYear();
  const birthYear = person?.birthday ? parseInt(person.birthday.substring(0, 4), 10) : undefined;
  const deathYear = person?.deathday ? parseInt(person.deathday.substring(0, 4), 10) : undefined;

  const years = credits
    .map((c) => parseInt(c.release_date?.substring(0, 4) ?? '', 10))
    .filter((y) => {
      if (isNaN(y)) return false;
      if (y > currentYear) return false;
      if (birthYear !== undefined && !isNaN(birthYear) && y < birthYear) return false;
      if (deathYear !== undefined && !isNaN(deathYear) && y > deathYear + 5) return false;
      return true;
    });

  if (years.length === 0) return 0;
  return Math.max(...years) - Math.min(...years) + 1;
}

// ── Component ───────────────────────────────────────────────
export const PersonHero = memo(function PersonHero({
  person,
  heroBackdrop,
  photoUri,
  heroDynStyle,
  canonCount,
  craftLabel,
  careerSpan,
  definingFilm,
  isArchivist,
  handleLoungeShare,
  showHunt,
  huntTotal,
  seenCount,
  isAuteurMastery,
  auteurHuntDynStyle,
  formatDossierDate: fmtDate,
}: PersonHeroProps) {
  const handleKnownForPress = () => {
    if (definingFilm?.id) nav.push(`/film/${definingFilm.id}`);
  };

  return (
    <>
      {/* ═══════════════════════════════════════════════════════
          CINEMATIC HERO BACKDROP
      ═══════════════════════════════════════════════════════ */}
      <View style={[s.heroWrap, heroDynStyle]}>
        {heroBackdrop ? (
          <Image source={{ uri: heroBackdrop }} style={s.heroBg} contentFit="cover" cachePolicy="memory-disk" placeholder={{ blurhash: SEPIA_HASH }} transition={300} />
        ) : (
          <LinearGradient
            colors={['rgba(184,137,26,0.12)', 'rgba(10,7,3,0.95)']}
            style={s.heroBg}
          />
        )}
        {heroBackdrop && <View style={s.heroSepia} />}
        <LinearGradient
          colors={['rgba(10,7,3,0.05)', 'rgba(10,7,3,0.45)', colors.ink]}
          locations={[0, 0.55, 1]}
          style={StyleSheet.absoluteFillObject}
        />
        {/* Film-strip perforations — ReelHouse signature */}
        <View style={s.perfBar}>
          <FilmStripPerforations />
        </View>
      </View>

      {/* ═══════════════════════════════════════════════════════
          THE TITLE BLOCK — overlaps hero; four beats
      ═══════════════════════════════════════════════════════ */}
      <View style={s.dossierSection}>
        {/* Portrait with sepia glow */}
        <View style={s.portraitWrap}>
          <View style={s.portraitGlow} />
          <View style={s.portraitCard}>
            {photoUri ? (
              <Image source={{ uri: photoUri }} style={s.portrait} contentFit="cover" cachePolicy="memory-disk" placeholder={{ blurhash: SEPIA_HASH }} transition={300} accessibilityLabel={`${person.name} portrait photo`} />
            ) : (
              <View style={[s.portrait, s.portraitPlaceholder]}>
                <Text style={s.portraitInitial}>{person.name?.charAt(0) || '?'}</Text>
              </View>
            )}
          </View>
        </View>

        {/* Beat 1 — identity */}
        {person.known_for_department && (
          <View style={s.deptBadge}>
            <FilmIcon size={8} color={colors.sepia} strokeWidth={1.5} />
            <Text style={s.deptLabel}>{person.known_for_department.toUpperCase()}</Text>
          </View>
        )}

        <View>
          <Text style={s.personName} accessibilityRole="header" adjustsFontSizeToFit numberOfLines={2} minimumFontScale={0.6}>{person.name}</Text>
        </View>

        {/* The life line — dates, then ground */}
        {(person.birthday || person.deathday) && (
          <Text style={s.lifeLine} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
            {person.birthday ? `BORN ${fmtDate(person.birthday)}` : ''}
            {person.deathday ? (
              <Text style={s.lifeLineDeath}>{person.birthday ? '  —  ' : ''}† {fmtDate(person.deathday)}</Text>
            ) : null}
          </Text>
        )}
        {person.place_of_birth && (
          <Text style={s.lifeLinePlace} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
            {person.place_of_birth.trim().toUpperCase()}
          </Text>
        )}

        {/* Beat 2 — the record */}
        {canonCount > 0 && (
          <View style={s.recordGroup}>
            <Text style={s.statLine} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>
              {canonCount} {craftLabel}{careerSpan > 0 ? ` · ${careerSpan} YEAR${careerSpan === 1 ? '' : 'S'} IN CINEMA` : ''}
            </Text>
            {definingFilm && (
              <PressableScale onPress={handleKnownForPress} pressedScale={0.97} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} accessibilityLabel={`Known for ${definingFilm.title || definingFilm.name}, open film`}>
                <Text style={s.knownForLine} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>
                  KNOWN FOR: <Text style={s.knownForTitle}>{(definingFilm.title || definingFilm.name || '').toUpperCase()} →</Text>
                </Text>
              </PressableScale>
            )}
          </View>
        )}

        {/* Beat 3 — the action. Every rank sees the door; the key marks the rope. */}
        <View>
          <PressableScale
            style={s.loungeBtn}
            onPress={handleLoungeShare}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            haptic="light"
            accessibilityLabel={isArchivist ? 'Share to lounge' : 'Lounge — requires a higher rank'}
          >
            {isArchivist ? (
              <MessageCircle size={11} color={colors.sepia} strokeWidth={1.5} />
            ) : (
              <KeyRound size={11} color={colors.sepia} strokeWidth={1.5} />
            )}
            <Text style={s.loungeBtnText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>SHARE TO LOUNGE</Text>
          </PressableScale>
        </View>

        {/* Beat 4 — THE AUTEUR HUNT (directing files only) */}
        {showHunt && (
          <View style={s.auteurHunt}>
            <View style={s.auteurHuntHeader}>
              <Text style={s.auteurHuntTitle} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>✦ THE AUTEUR HUNT</Text>
              <Text style={s.auteurHuntCount} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>{seenCount} OF {huntTotal} SCREENED</Text>
            </View>
            <View style={s.auteurHuntTrack}>
              <View style={[s.auteurHuntFill, auteurHuntDynStyle, isAuteurMastery && s.auteurHuntMastery]} />
              <View style={s.auteurHuntNotches} pointerEvents="none">
                {HUNT_NOTCHES.map((i) => (
                  <View key={i} style={s.auteurHuntNotch} />
                ))}
              </View>
            </View>
            {isAuteurMastery && (
              <Text style={s.auteurComplete} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>AUTEUR MASTERY — COMPLETE</Text>
            )}
          </View>
        )}
      </View>
    </>
  );
});
