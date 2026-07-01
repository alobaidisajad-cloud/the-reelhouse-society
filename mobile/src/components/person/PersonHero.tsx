/**
 * PersonHero — Cinematic backdrop, film-strip perforations, portrait dossier,
 * career stats strip, share-to-lounge CTA, and auteur hunt progress bar.
 */
import { memo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { colors, SEPIA_HASH } from '@/src/theme/theme';
import PressableScale from '@/src/components/PressableScale';
import {
  Film as FilmIcon, MessageCircle,
  MapPin, Calendar, Skull, Clock,
} from 'lucide-react-native';
import { s } from '@/app/person/_personStyles';
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
  totalFilms: number;
  careerSpan: number;
  definingFilm: PersonCredit | null;
  isArchivist: boolean;
  handleLoungeShare: () => void;
  directedFilms: PersonCredit[];
  seenCount: number;
  auteurPct: number;
  isAuteurMastery: boolean;
  auteurHuntDynStyle: { width: DimensionValue };
  formatDossierDate: (dateStr: string | null) => string;
}

// ── Utility — format dossier date ────────────────────────────
// Re-exported for use by callers that need it
export function formatDossierDate(dateStr: string | null): string {
  if (!dateStr) return '';
  if (dateStr.length === 4) return dateStr;
  try {
    const isoString = dateStr.length === 10 ? `${dateStr}T12:00:00Z` : dateStr;
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return dateStr;
    return d.toLocaleDateString('en-US', { timeZone: 'UTC', month: 'long', day: 'numeric', year: 'numeric' }).toUpperCase();
   
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
  totalFilms,
  careerSpan,
  definingFilm,
  isArchivist,
  handleLoungeShare,
  directedFilms,
  seenCount,
  auteurPct,
  isAuteurMastery,
  auteurHuntDynStyle,
  formatDossierDate: fmtDate,
}: PersonHeroProps) {
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
          PROFILE DOSSIER — overlaps hero
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

        {/* Society watermark */}
        <View>
          <Text style={s.societyMark}>THE REELHOUSE SOCIETY · EST. 1924</Text>
        </View>

        {/* Department badge */}
        {person.known_for_department && (
          <View style={s.deptBadge}>
            <FilmIcon size={8} color={colors.sepia} strokeWidth={1.5} />
            <Text style={s.deptLabel}>{person.known_for_department.toUpperCase()}</Text>
          </View>
        )}

        {/* Name */}
        <View>
          <Text style={s.personName} accessibilityRole="header" adjustsFontSizeToFit numberOfLines={2} minimumFontScale={0.6}>{person.name}</Text>
        </View>

        {/* Birth / Death / Place */}
        <View style={s.dateRow}>
          {person.birthday && (
            <View style={s.dateItem}>
              <Calendar size={9} color={colors.fog} strokeWidth={1.5} />
              <Text style={s.dateText}>
                {fmtDate(person.birthday)}
              </Text>
            </View>
          )}
          {person.deathday && (
            <View style={s.dateItem}>
              <Skull size={9} color="rgba(200,80,80,0.7)" strokeWidth={1.5} />
              <Text style={s.dateTextDeath}>
                {fmtDate(person.deathday)}
              </Text>
            </View>
          )}
          {person.place_of_birth && (
            <View style={s.dateItem}>
              <MapPin size={9} color={colors.fog} strokeWidth={1.5} />
              <Text style={s.dateTextFaded}>{person.place_of_birth.trim().toUpperCase()}</Text>
            </View>
          )}
        </View>

        {/* Career stats strip */}
        {totalFilms > 0 && (
          <View style={s.statsStrip}>
            <View style={s.statChip}>
              <FilmIcon size={11} color={colors.sepia} strokeWidth={1.5} />
              <Text style={s.statText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>{totalFilms} CREDITS</Text>
            </View>
            {careerSpan > 0 && (
              <View style={s.statChip}>
                <Clock size={10} color={colors.sepia} strokeWidth={1.5} />
                <Text style={s.statText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>{careerSpan} YEAR{careerSpan === 1 ? '' : 'S'} IN CINEMA</Text>
              </View>
            )}
            {definingFilm && (
              <Text style={s.knownForText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>
                KNOWN FOR: <Text style={s.knownForTitle}>{definingFilm.title || definingFilm.name}</Text>
              </Text>
            )}
          </View>
        )}

        {/* Share to Lounge — archivist+ only */}
        {isArchivist && (
          <View>
            <PressableScale
              style={s.loungeBtn}
              onPress={handleLoungeShare}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              haptic="light"
            >
              <MessageCircle size={11} color={colors.sepia} strokeWidth={1.5} />
              <Text style={s.loungeBtnText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>SHARE TO LOUNGE</Text>
            </PressableScale>
          </View>
        )}

        {/* Auteur Hunt */}
        {directedFilms.length > 0 && (
          <View style={s.auteurHuntWrap}>
            <View style={s.auteurHunt}>
              <View style={s.auteurHuntHeader}>
                <Text style={s.auteurHuntTitle} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>THE AUTEUR HUNT</Text>
                <Text style={s.auteurHuntCount} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>{seenCount} OF {directedFilms.length} SEEN</Text>
              </View>
              <View style={s.auteurHuntTrack}>
                <View style={[s.auteurHuntFill, auteurHuntDynStyle, isAuteurMastery && s.auteurHuntMastery]} />
              </View>
              {isAuteurMastery && (
                <Text style={s.auteurComplete} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>AUTEUR MASTERY — COMPLETE</Text>
              )}
            </View>
          </View>
        )}
      </View>
    </>
  );
});
