/**
 * DarkroomFilterPanel — the settings: genre, decade, a year range, language, the order and the
 * least rating, each a row of stamped labels applied as tapped. Presentational: the state is the
 * header's.
 */
import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Text, TextInput } from '@/src/components/text';
import { PresenceView } from '@/src/components/motion/Presence';

import { colors, fonts } from '@/src/theme/theme';
import { scaledTextProps } from '@/src/constants/textScaling';
import { GENRES, DECADES, LANGUAGES, SORT_OPTIONS, MIN_RATINGS, YEAR_MIN, YEAR_MAX } from './constants';
import PressableScale from '@/src/components/PressableScale';
import { useDiscoverStore } from '@/src/stores/discover';
import { YEAR_DIGITS } from '@/src/constants/inputLimits';
import { ROOM } from './sheet';

type Filters = ReturnType<typeof useDiscoverStore.getState>['filters'];

/** A stamped label: chosen, it is inked in brass. 40 tall; its halo meets its neighbours' halfway. */
export const Chip = React.memo(function Chip({ active, onPress, children }: { active: boolean; onPress: () => void; children: string }) {
  return (
    <PressableScale onPress={onPress} haptic="light" hitSlop={CHIP_REACH}
      accessibilityRole="button" accessibilityState={{ selected: active }}
      style={[s.chip, active && s.chipOn]}>
      <Text style={[s.chipWord, active && s.chipWordOn]} {...scaledTextProps}>{children.toUpperCase()}</Text>
    </PressableScale>
  );
});

/**
 * Half the gap to the next row, and to the chip beside: 40 + 4 + 4 is the 48 a finger needs, and a
 * chip is never so narrow that its halo reaches less across.
 */
const CHIP = { height: 40, rowGap: 8, columnGap: 6, least: 48 - 6 } as const;
const CHIP_REACH = { top: CHIP.rowGap / 2, bottom: CHIP.rowGap / 2, left: CHIP.columnGap / 2, right: CHIP.columnGap / 2 };

/** A setting's name, and its hairline to the panel's edge. */
function Heading({ children, first }: { children: string; first?: boolean }) {
  return (
    <View style={[s.heading, !first && s.headingAfter]}>
      <Text style={s.headingWord} {...scaledTextProps} accessibilityRole="header">{children}</Text>
      <View style={s.rule} />
    </View>
  );
}

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
  /**
   * A typed year, as the filter holds it: two digits are 19xx or 20xx, the year is
   * held to the catalogue's range, and a year past the other end moves both to it.
   * An emptied field lets go of its end.
   */
  const commitYear = (end: 'from' | 'to') => {
    const raw = parseInt(end === 'from' ? localYearFrom : localYearTo, 10);
    let year: number | null = null;
    if (!isNaN(raw)) {
      year = raw < 100 ? raw + (raw < 30 ? 2000 : 1900) : raw;
      year = Math.max(YEAR_MIN, Math.min(YEAR_MAX, year));
    }
    const other = end === 'from' ? filters.yearTo : filters.yearFrom;
    if (year && other && (end === 'from' ? year > other : year < other)) {
      updateFilter({ yearFrom: year, yearTo: year, decade: null });
      setLocalYearFrom(String(year));
      setLocalYearTo(String(year));
      return;
    }
    if (year !== (end === 'from' ? filters.yearFrom : filters.yearTo)) {
      updateFilter(end === 'from' ? { yearFrom: year, decade: null } : { yearTo: year, decade: null });
    }
    (end === 'from' ? setLocalYearFrom : setLocalYearTo)(year ? String(year) : '');
  };
  return (
    <PresenceView name="darkroom.filters" style={s.panel}
      enter={{ kind: 'FadeInDown', duration: 300 }} exit={{ kind: 'SlideOutDown', duration: 200 }}>
      <Heading first>GENRE</Heading>
      <View style={s.chips}>
        {GENRES.map((g) => (
          <Chip key={g.id} active={filters.genreId === g.id} onPress={() => updateFilter({ genreId: filters.genreId === g.id ? null : g.id })}>
            {g.name}
          </Chip>
        ))}
      </View>

      <Heading>DECADE</Heading>
      <View style={s.chips}>
        {DECADES.map((d) => (
          <Chip key={d.label} active={filters.decade?.label === d.label} onPress={() => updateFilter({ decade: filters.decade?.label === d.label ? null : d, yearFrom: null, yearTo: null })}>
            {d.label}
          </Chip>
        ))}
      </View>

      <Heading>CUSTOM YEAR RANGE</Heading>
      <View style={s.years}>
        <Text style={s.yearWord} {...scaledTextProps}>FROM</Text>
        {/* onEndEditing, not onSubmitEditing: the iPhone's number pad has no return key,
            so a year typed there was never applied. Editing ends on a tap away too. */}
        <TextInput
          style={s.year}
          {...scaledTextProps}
          selectionColor={colors.selection}
          keyboardType="number-pad"
          keyboardAppearance="dark"
          maxLength={YEAR_DIGITS}
          value={localYearFrom}
          onChangeText={setLocalYearFrom}
          onEndEditing={() => commitYear('from')}
          returnKeyType="done"
          accessibilityLabel="From the year"
        />
        <Text style={s.yearWord} {...scaledTextProps}>TO</Text>
        <TextInput
          style={s.year}
          {...scaledTextProps}
          selectionColor={colors.selection}
          keyboardType="number-pad"
          keyboardAppearance="dark"
          maxLength={YEAR_DIGITS}
          value={localYearTo}
          onChangeText={setLocalYearTo}
          onEndEditing={() => commitYear('to')}
          returnKeyType="done"
          accessibilityLabel="To the year"
        />
      </View>

      <Heading>LANGUAGE</Heading>
      <View style={s.chips}>
        {LANGUAGES.map((l) => (
          <Chip key={l.iso} active={filters.language === l.iso} onPress={() => updateFilter({ language: filters.language === l.iso ? null : l.iso })}>
            {l.name}
          </Chip>
        ))}
      </View>

      <Heading>SORT BY</Heading>
      <View style={s.chips}>
        {SORT_OPTIONS.map((o) => (
          <Chip key={o.value} active={filters.sortBy === o.value} onPress={() => updateFilter({ sortBy: o.value })}>
            {o.label}
          </Chip>
        ))}
      </View>

      <Heading>MIN RATING</Heading>
      <View style={s.chips}>
        {MIN_RATINGS.map((r) => (
          <Chip key={r} active={filters.minRating === r} onPress={() => updateFilter({ minRating: filters.minRating === r ? 0 : r })}>
            {r === 0 ? 'Any' : `${r}+`}
          </Chip>
        ))}
      </View>
    </PresenceView>
  );
});

DarkroomFilterPanel.displayName = 'DarkroomFilterPanel';

const s = StyleSheet.create({
  panel: { marginTop: 8, backgroundColor: colors.soot, borderRadius: ROOM.radius, paddingTop: 14, paddingHorizontal: 14, paddingBottom: 16 },
  heading: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  headingAfter: { marginTop: 14 },
  headingWord: { flexShrink: 1, fontFamily: fonts.sub, fontSize: 10, letterSpacing: 3, color: colors.bone, includeFontPadding: false },
  rule: { flex: 1, height: StyleSheet.hairlineWidth * 2, backgroundColor: 'rgba(232,223,208,0.08)' },
  // The halos of the outer chips inside the group's own box (a box cuts what reaches past it); the
  // margins give the room back, so the chips stand where they are drawn.
  chips: {
    flexDirection: 'row', flexWrap: 'wrap', rowGap: CHIP.rowGap, columnGap: CHIP.columnGap,
    paddingVertical: CHIP_REACH.top, paddingHorizontal: CHIP_REACH.left,
    marginTop: 8 - CHIP_REACH.top, marginBottom: -CHIP_REACH.bottom, marginHorizontal: -CHIP_REACH.left,
  },
  chip: {
    minHeight: CHIP.height, minWidth: CHIP.least, paddingHorizontal: 12, justifyContent: 'center', alignItems: 'center',
    borderWidth: 1, borderColor: 'rgba(232,223,208,0.16)', borderRadius: 3,
  },
  chipOn: { backgroundColor: colors.sepia, borderColor: colors.sepia },
  chipWord: { fontFamily: fonts.sub, fontSize: 11, letterSpacing: 1.4, color: colors.parchment, includeFontPadding: false },
  chipWordOn: { color: colors.ink },
  years: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 10, marginTop: 8 },
  yearWord: { fontFamily: fonts.sub, fontSize: 10, letterSpacing: 2, color: colors.fog, includeFontPadding: false },
  year: {
    minHeight: 48, width: 96, borderRadius: 3, backgroundColor: colors.well,
    borderWidth: 1, borderColor: 'rgba(184,137,26,0.75)', paddingHorizontal: 12, paddingVertical: 0,
    fontFamily: fonts.body, fontSize: 14, color: colors.parchment,
  },
});
