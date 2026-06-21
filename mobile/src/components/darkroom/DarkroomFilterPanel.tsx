/**
 * Extracted filter panel from DarkroomHeader for readability.
 * 
 * This component is purely presentational — all state management remains
 * in DarkroomHeader.tsx. Zero visual change.
 */
import React from 'react';
import { View, Text, TextInput, StyleSheet } from 'react-native';
import Animated, { FadeInDown, SlideOutDown } from 'react-native-reanimated';
import { X } from 'lucide-react-native';

import { colors, fonts, spacing } from '@/src/theme/theme';
import { GENRES, DECADES, LANGUAGES, SORT_OPTIONS, MIN_RATINGS, YEAR_MIN, YEAR_MAX } from './constants';
import { Chip } from './DarkroomHeader';
import PressableScale from '@/src/components/PressableScale';
import { useDiscoverStore } from '@/src/stores/discover';

type Filters = ReturnType<typeof useDiscoverStore.getState>['filters'];

interface DarkroomFilterPanelProps {
  filters: Filters;
  updateFilter: (partial: Partial<Filters>) => void;
  localYearFrom: string;
  setLocalYearFrom: (v: string) => void;
  localYearTo: string;
  setLocalYearTo: (v: string) => void;
}

export const DarkroomFilterPanel = React.memo(function DarkroomFilterPanel({
  filters, updateFilter,
  localYearFrom, setLocalYearFrom, localYearTo, setLocalYearTo,
}: DarkroomFilterPanelProps) {
  return (
    <Animated.View entering={FadeInDown.duration(300)} exiting={SlideOutDown.duration(200)} style={s.filterPanel}>
      <Text style={s.filterSectionTitle}>GENRE</Text>
      <View style={s.chipRow}>
        {GENRES.map(g => (
          <Chip key={g.id} active={filters.genreId === g.id} onPress={() => updateFilter({ genreId: filters.genreId === g.id ? null : g.id })}>
            {g.name}
          </Chip>
        ))}
      </View>

      <Text style={[s.filterSectionTitle, s.filterSectionTitleSpaced]}>DECADE</Text>
      <View style={s.chipRow}>
        {DECADES.map(d => (
          <Chip key={d.label} active={filters.decade?.label === d.label} onPress={() => updateFilter({ decade: filters.decade?.label === d.label ? null : d, yearFrom: null, yearTo: null })}>
            {d.label}
          </Chip>
        ))}
      </View>

      <Text style={[s.filterSectionTitle, s.filterSectionTitleSpaced]}>CUSTOM YEAR RANGE</Text>
      <View style={s.yearRangeRow}>
        <TextInput
          style={s.yearInput}
          placeholder="FROM"
          placeholderTextColor={colors.fog}
          keyboardType="number-pad"
          keyboardAppearance="dark"
          maxLength={4}
          value={localYearFrom}
          onChangeText={setLocalYearFrom}
          onSubmitEditing={() => {
            const raw = parseInt(localYearFrom, 10);
            let clamped: number | null = null;
            if (!isNaN(raw)) {
              clamped = raw < 100 ? raw + (raw < 30 ? 2000 : 1900) : raw;
              clamped = Math.max(YEAR_MIN, Math.min(YEAR_MAX, clamped));
            }
            if (clamped && filters.yearTo && clamped > filters.yearTo) {
              updateFilter({ yearFrom: clamped, yearTo: clamped, decade: null });
              setLocalYearFrom(String(clamped));
              setLocalYearTo(String(clamped));
            } else {
              if (clamped !== filters.yearFrom) {
                updateFilter({ yearFrom: clamped, decade: null });
              }
              setLocalYearFrom(clamped ? String(clamped) : '');
            }
          }}
          returnKeyType="done"
        />
        <Text style={s.yearRangeDash}>—</Text>
        <TextInput
          style={s.yearInput}
          placeholder="TO"
          placeholderTextColor={colors.fog}
          keyboardType="number-pad"
          keyboardAppearance="dark"
          maxLength={4}
          value={localYearTo}
          onChangeText={setLocalYearTo}
          onSubmitEditing={() => {
            const raw = parseInt(localYearTo, 10);
            let clamped: number | null = null;
            if (!isNaN(raw)) {
              clamped = raw < 100 ? raw + (raw < 30 ? 2000 : 1900) : raw;
              clamped = Math.max(YEAR_MIN, Math.min(YEAR_MAX, clamped));
            }
            if (clamped && filters.yearFrom && clamped < filters.yearFrom) {
              updateFilter({ yearTo: clamped, yearFrom: clamped, decade: null });
              setLocalYearFrom(String(clamped));
              setLocalYearTo(String(clamped));
            } else {
              if (clamped !== filters.yearTo) {
                updateFilter({ yearTo: clamped, decade: null });
              }
              setLocalYearTo(clamped ? String(clamped) : '');
            }
          }}
          returnKeyType="done"
        />
        {(filters.yearFrom || filters.yearTo) && (
          <PressableScale 
            onPress={() => updateFilter({ yearFrom: null, yearTo: null })} 
            style={s.yearClearBtn}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            haptic="light"
            accessibilityLabel="Clear year filter"
          >
            <X size={12} color={colors.fog} />
          </PressableScale>
        )}
      </View>

      <Text style={[s.filterSectionTitle, s.filterSectionTitleSpaced]}>LANGUAGE</Text>
      <View style={s.chipRow}>
        {LANGUAGES.map(l => (
          <Chip key={l.iso} active={filters.language === l.iso} onPress={() => updateFilter({ language: filters.language === l.iso ? null : l.iso })}>
            {l.name}
          </Chip>
        ))}
      </View>

      <Text style={[s.filterSectionTitle, s.filterSectionTitleSpaced]}>SORT BY</Text>
      <View style={s.chipRow}>
        {SORT_OPTIONS.map(o => (
          <Chip key={o.value} active={filters.sortBy === o.value} onPress={() => updateFilter({ sortBy: o.value })}>
            {o.label}
          </Chip>
        ))}
      </View>

      <Text style={[s.filterSectionTitle, s.filterSectionTitleSpaced]}>MIN RATING{filters.minRating > 0 ? `: ${filters.minRating}+` : ''}</Text>
      <View style={s.chipRow}>
        {MIN_RATINGS.map(r => (
          <Chip key={r} active={filters.minRating === r} onPress={() => updateFilter({ minRating: filters.minRating === r ? 0 : r })}>
            {r === 0 ? 'Any' : `${r}+`}
          </Chip>
        ))}
      </View>
    </Animated.View>
  );
});

DarkroomFilterPanel.displayName = 'DarkroomFilterPanel';

// ── Styles (copied pixel-perfect from DarkroomHeader) ──
const s = StyleSheet.create({
  filterPanel: {
    backgroundColor: 'rgba(8,6,4,0.98)',
    borderWidth: 1,
    borderColor: 'rgba(139,105,20,0.35)',
    padding: spacing.md,
    borderRadius: 8,
    marginBottom: spacing.lg,
  },
  filterSectionTitle: {
    fontFamily: fonts.ui,
    fontSize: 9,
    letterSpacing: 2,
    color: colors.sepia,
    marginBottom: spacing.sm,
  },
  filterSectionTitleSpaced: {
    marginTop: spacing.md,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  yearRangeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  yearInput: {
    flex: 1,
    backgroundColor: 'rgba(14,11,8,0.95)',
    borderWidth: 1,
    borderColor: 'rgba(139,105,20,0.15)',
    borderRadius: 4,
    paddingVertical: 10,
    paddingHorizontal: 14,
    color: colors.parchment,
    fontFamily: fonts.ui,
    fontSize: 13,
    letterSpacing: 2,
    textAlign: 'center',
  },
  yearRangeDash: {
    fontFamily: fonts.display,
    fontSize: 16,
    color: colors.fog,
    opacity: 0.4,
  },
  yearClearBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(139,105,20,0.1)',
    justifyContent: 'center',
    alignItems: 'center',
  },
});
