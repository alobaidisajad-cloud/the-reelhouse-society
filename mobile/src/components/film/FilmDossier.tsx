import React, { memo } from 'react';
import { View, StyleSheet } from 'react-native';
import { Text } from '@/src/components/text';
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
 * GENRES, RUNTIME and the year are in the meta line under the title, four
 * hundred points up, so they are not said twice. The particulars carry the
 * CERTIFICATE (with the country it belongs to), the full release date, the
 * language, the STUDIO and the money.
 *
 * Unboxed: a ledger is ruled, not framed.
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
  studios?: { name?: string }[];
  /** The age rating, and whose. */
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
        {/* GENRES, RUNTIME and the YEAR are in the hero, not here. */}
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
    fontFamily: fonts.sub, fontSize: 10, letterSpacing: 1.2, color: colors.fog,
  },
  value: {
    includeFontPadding: false,
    fontFamily: fonts.body, fontSize: 13, color: colors.bone,
    textAlign: 'right', flex: 1, marginLeft: 20,
  },
});
