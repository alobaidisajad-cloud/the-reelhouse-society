import React, { memo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Animated from 'react-native-reanimated';
import { colors, fonts } from '@/src/theme/theme';
import { SectionErrorBoundary } from '@/src/components/SectionErrorBoundary';

import { formatTMDBDate } from '@/src/utils/timeAgo';

// ── Dossier Row ─────────────────────────────────────────────
const DossierRow = memo(function DossierRow({ label, value }: { label: string; value: string | undefined }) {
  if (!value || value === '—' || value === 'Unknown') return null;
  return (
    <View style={s.dossierRow}>
      <Text style={s.dossierLabel}>{label}</Text>
      <Text style={s.dossierValue}>{value}</Text>
    </View>
  );
});

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
  formatRuntime: (runtime: number | null | undefined) => string;
}

export const FilmDossier = memo(function FilmDossier({ film, formatRuntime }: FilmDossierProps) {
  if (!film) return null;
  return (
    <SectionErrorBoundary fallbackMessage="Dossier data unavailable.">
      <Animated.View style={s.section}>
        <View style={s.sectionHeader}>
          <Text style={s.sectionTitle}>FILM DOSSIER</Text>
          <View style={s.sectionLine} />
        </View>
        <View style={s.dossierCard}>
          <DossierRow label="GENRES" value={film.genres?.map((g: { id: number; name: string }) => g.name).join(', ')} />
          <DossierRow label="RELEASE" value={formatTMDBDate(film.release_date, 'long')} />
          <DossierRow label="RUNTIME" value={formatRuntime(film.runtime)} />
          <DossierRow label="STATUS" value={film.status} />
          <DossierRow label="LANGUAGE" value={film.original_language?.toUpperCase()} />
          <DossierRow label="BUDGET" value={(film.budget ?? 0) > 0 ? `$${((film.budget ?? 0) / 1e6).toFixed(1)}M` : undefined} />
          <DossierRow label="REVENUE" value={(film.revenue ?? 0) > 0 ? `$${((film.revenue ?? 0) / 1e6).toFixed(1)}M` : undefined} />
        </View>
      </Animated.View>
    </SectionErrorBoundary>
  );
});

const s = StyleSheet.create({
  section: { paddingHorizontal: 20, marginBottom: 24, zIndex: 2 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 14, gap: 12 },
  sectionTitle: { fontFamily: fonts.uiBold, fontSize: 10, letterSpacing: 3, color: colors.sepia },
  sectionLine: { flex: 1, height: 1, backgroundColor: 'rgba(139,105,20,0.3)' },

  dossierCard: {
    backgroundColor: 'rgba(8,6,4,0.98)', borderWidth: 1, borderColor: 'rgba(139,105,20,0.3)',
    borderRadius: 4, padding: 16,
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.6, shadowRadius: 10, elevation: 8,
  },
  dossierRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: 'rgba(139,105,20,0.1)' },
  dossierLabel: { fontFamily: fonts.ui, fontSize: 10, letterSpacing: 1.5, color: colors.fog },
  dossierValue: { fontFamily: fonts.body, fontSize: 13, color: colors.bone, textAlign: 'right', flex: 1, marginLeft: 20 },
});
