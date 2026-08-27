import React, { memo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Animated from 'react-native-reanimated';
import { colors, fonts } from '@/src/theme/theme';
import { scaledTextProps } from '@/src/constants/textScaling';
import { FilmSectionHeader } from '@/src/components/film/FilmSectionHeader';
import { SectionErrorBoundary } from '@/src/components/SectionErrorBoundary';
import { formatTMDBDate } from '@/src/utils/timeAgo';
import type { PickedCertificate } from './pickCertificate';

/**
 * THE PARTICULARS — what the hero does not already say.
 *
 * ── WHAT CHANGED, AND WHY ───────────────────────────────────────────────────
 * This was FILM DOSSIER, and over half of it repeated the hero four hundred
 * points further up: GENRES, RUNTIME and the year of RELEASE are all in the
 * meta line under the title. A member does not need to be told a film is two
 * hours fifty-three twice on one page.
 *
 * What it gains instead is the two facts the page used to spend whole sections
 * on — the CERTIFICATE, which lived in a rail of international release dates,
 * and the STUDIO, which was a sideways scroller for two logos.
 *
 * And it is UNBOXED. A bordered, shadowed card was the only framed block on an
 * otherwise open page; it looked imported from another app. A ledger is ruled,
 * not framed.
 */

const Row = memo(function Row({ label, value }: { label: string; value?: string | null }) {
  if (!value || value === '—' || value === 'Unknown') return null;
  return (
    <View style={s.row}>
      <Text {...scaledTextProps} style={s.label} numberOfLines={1}>{label}</Text>
      <Text {...scaledTextProps} style={s.value}>{value}</Text>
    </View>
  );
});

/** A billion is not `$1446.2M`. Nobody writes it that way and nobody reads it. */
export function formatMoney(n: number | null | undefined): string | undefined {
  if (!n || n <= 0) return undefined;
  return n >= 1e9 ? `$${(n / 1e9).toFixed(2)}B` : `$${(n / 1e6).toFixed(1)}M`;
}

/**
 * A code where a word belongs. `LANGUAGE: EN` is the database talking; the
 * fallback keeps the code rather than inventing a name we do not have.
 */
const LANGUAGES: Record<string, string> = {
  en: 'English', fr: 'French', ja: 'Japanese', it: 'Italian', de: 'German',
  es: 'Spanish', ko: 'Korean', zh: 'Chinese', ru: 'Russian', pt: 'Portuguese',
  sv: 'Swedish', da: 'Danish', fa: 'Persian', hi: 'Hindi', ar: 'Arabic',
  pl: 'Polish', nl: 'Dutch', tr: 'Turkish', th: 'Thai', he: 'Hebrew',
};

export function languageName(code?: string | null): string | undefined {
  if (!code) return undefined;
  return LANGUAGES[code.toLowerCase()] ?? code.toUpperCase();
}

interface FilmDossierProps {
  film: {
    genres?: { id: number; name: string }[];
    release_date?: string;
    runtime?: number;
    status?: string;
    original_language?: string;
    budget?: number;
    revenue?: number;
  } | null;
  // `formatRuntime` is gone with the RUNTIME row it fed — the hero says it,
  // four hundred points up, and saying it twice was half the point of this
  // section's revision.
  /** Absorbed from the retired FilmStudios rail. */
  studios?: { name?: string }[];
  /** Absorbed from the retired CountryReleases section, region and all. */
  certificate?: PickedCertificate | null;
}

export const FilmDossier = memo(function FilmDossier({ film, studios, certificate }: FilmDossierProps) {
  if (!film) return null;

  const studioNames = (studios ?? [])
    .map((c) => c?.name)
    .filter((n): n is string => !!n)
    .slice(0, 2)
    .join(', ');

  return (
    <SectionErrorBoundary fallbackMessage="Dossier data unavailable.">
      <Animated.View style={s.section}>
        <FilmSectionHeader label="THE PARTICULARS" />
        {/* GENRES, RUNTIME and the release YEAR are deliberately absent — all
            three are in the hero. See the note at the top of this file. */}
        <Row label="CERTIFICATE" value={certificate ? `${certificate.value}  ·  ${certificate.region}` : undefined} />
        <Row label="RELEASE" value={formatTMDBDate(film.release_date, 'long')} />
        <Row label="LANGUAGE" value={languageName(film.original_language)} />
        <Row label="STUDIO" value={studioNames || undefined} />
        <Row label="BUDGET" value={formatMoney(film.budget)} />
        <Row label="TAKINGS" value={formatMoney(film.revenue)} />
      </Animated.View>
    </SectionErrorBoundary>
  );
});

const s = StyleSheet.create({
  section: { paddingHorizontal: 24, marginBottom: 30, zIndex: 2 },
  row: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline',
    paddingVertical: 10,
    borderBottomWidth: 1, borderBottomColor: 'rgba(184,137,26,0.12)',
  },
  label: {
    includeFontPadding: false,
    fontFamily: fonts.sub, fontSize: 9, letterSpacing: 1.5, color: colors.fog,
  },
  value: {
    includeFontPadding: false,
    fontFamily: fonts.body, fontSize: 13, color: colors.bone,
    textAlign: 'right', flex: 1, marginLeft: 20,
  },
});
