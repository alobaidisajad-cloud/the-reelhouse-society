/**
 * SeriesPicker — rejoin a series you have begun, or begin one.
 *
 * ── A SERIES IS NOT A TABLE ─────────────────────────────────────────────────
 * It is three columns on the filing itself — `series_id`, `series_title`,
 * `part_number` — and the database already holds them together:
 *
 *   CONSTRAINT series_whole CHECK (series_id IS NULL
 *     OR (series_title IS NOT NULL AND part_number IS NOT NULL
 *         AND kind = 'dossier'))
 *
 * So a half-set series cannot be written, and one cannot be set on anything but
 * a dossier. The failure mode is a refused write rather than a corrupt row, and
 * there is nothing to migrate.
 *
 * ── THE PART NUMBER IS SHOWN, NOT ASSUMED ───────────────────────────────────
 * `dispatch_posts_series` is an INDEX on (series_id, part_number), not a unique
 * constraint — so two parts CAN carry the same number. It would not be refused;
 * it would read "II, II" on the series page. The next number is filled in and
 * left editable, because a member filing Part III after writing Part IV is the
 * one who knows the order.
 *
 * ── WHAT IT LISTS ───────────────────────────────────────────────────────────
 * The member's OWN dossiers, grouped by series. Not a search: a series belongs
 * to whoever is writing it, and offering to join somebody else's would be
 * offering to put words in their sequence.
 */
import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, TextInput, ScrollView, StyleSheet } from 'react-native';
import * as Crypto from 'expo-crypto';

import { supabase } from '@/src/lib/supabase';
import { useAuthStore } from '@/src/stores/auth';
import PressableScale from '@/src/components/PressableScale';
import { colors, fonts } from '@/src/theme/theme';
import { decorativeTextProps, scaledTextProps, displayTextProps } from '@/src/constants/textScaling';
import { MAX_LENGTHS } from '@/src/utils/sanitizeInput';

export interface SeriesChoice { id: string; title: string; part: number }

interface Begun { id: string; title: string; parts: number[] }

/** Roman numerals, which is how the reader prints a part. Bounded by the cap. */
const ROMAN: [number, string][] = [
  [50, 'L'], [40, 'XL'], [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I'],
];
export function roman(n: number): string {
  if (!Number.isFinite(n) || n < 1) return '';
  let left = Math.floor(n);
  let out = '';
  for (const [v, s] of ROMAN) while (left >= v) { out += s; left -= v; }
  return out;
}

/**
 * The series a member has already begun, from their own filings.
 *
 * Pure, so the grouping is testable without a network: the query returns rows,
 * this decides what a series IS.
 */
export function groupSeries(
  rows: { series_id: string | null; series_title: string | null; part_number: number | null }[],
): Begun[] {
  const byId = new Map<string, Begun>();
  for (const r of rows) {
    // `series_whole` guarantees these arrive together, but a row read before
    // that constraint existed — or a null slipping through a future path —
    // must not produce a series with no name to show.
    if (!r.series_id || !r.series_title) continue;
    const found = byId.get(r.series_id) ?? { id: r.series_id, title: r.series_title, parts: [] };
    if (typeof r.part_number === 'number') found.parts.push(r.part_number);
    byId.set(r.series_id, found);
  }
  return [...byId.values()].map((s) => ({ ...s, parts: [...s.parts].sort((a, b) => a - b) }));
}

/** The next part in a series: one past its highest, never below one. */
export function nextPart(parts: number[]): number {
  return parts.length === 0 ? 1 : Math.max(...parts) + 1;
}

const Row = memo(function Row({ s, chosen, onPick }: {
  s: Begun; chosen: boolean; onPick: () => void;
}) {
  const next = nextPart(s.parts);
  const filed = s.parts.length === 0
    ? 'NONE FILED'
    : `${s.parts.length} FILED · ${s.parts.map(roman).join(', ')}`;
  return (
    <PressableScale
      style={x.row} onPress={onPick} haptic="selection"
      accessibilityRole="button"
      accessibilityState={{ selected: chosen }}
      accessibilityLabel={`${s.title}. ${s.parts.length} filed. This would be part ${next}.`}
    >
      <Text style={[x.tick, !chosen && x.tickOff]} {...decorativeTextProps}>✦</Text>
      <View style={x.rowText}>
        <Text style={[x.rowTitle, chosen && x.rowTitleOn]} numberOfLines={1} {...displayTextProps}>
          {s.title}
        </Text>
        <Text style={x.rowSub} numberOfLines={1} {...scaledTextProps}>{filed}</Text>
      </View>
      <Text style={x.next} numberOfLines={1} {...scaledTextProps}>{`NEXT: ${roman(next)}`}</Text>
    </PressableScale>
  );
});

/**
 * The next free part of a series, asked FRESH.
 *
 * `nextPart` is computed when a member picks the series, not when they file. A
 * draft restored two days later still holds the number it was offered then — so
 * if they filed Part II from somewhere else in the meantime, that draft files a
 * SECOND Part II, and the series page prints II, II, III in Roman numerals off
 * the field.
 *
 * A stored part number is a fact about the past. This asks the present.
 *
 * Returns null when it cannot tell — no member, no series, or the read failed —
 * and the caller keeps what it had, because a number that might be stale is
 * better than no number under a line that says which part this is.
 */
export async function freshPartFor(
  userId: string | null | undefined, seriesId: string | null | undefined,
): Promise<number | null> {
  if (!userId || !seriesId) return null;
  try {
    const { data, error } = await supabase
      .from('dispatch_posts')
      .select('series_id, series_title, part_number')
      .eq('user_id', userId)
      .eq('kind', 'dossier')
      .eq('series_id', seriesId);
    if (error || !data) return null;
    const found = groupSeries(data as never).find((s) => s.id === seriesId);
    // No rows means the series exists only in this draft — a sequence the member
    // began and has not filed the first part of. That is Part I.
    return found ? nextPart(found.parts) : 1;
  } catch {
    return null;
  }
}

export function SeriesPicker({ visible, chosen, onClose, onSet, onClear, bottomInset }: {
  visible: boolean;
  chosen: SeriesChoice | null;
  onClose: () => void;
  onSet: (choice: SeriesChoice) => void;
  onClear: () => void;
  bottomInset: number;
}) {
  const userId = useAuthStore((s) => s.user?.id);
  const [begun, setBegun] = useState<Begun[]>([]);
  const [pick, setPick] = useState<SeriesChoice | null>(chosen);
  const [naming, setNaming] = useState(false);
  const [newTitle, setNewTitle] = useState('');

  useEffect(() => { if (visible) setPick(chosen); }, [visible, chosen]);

  useEffect(() => {
    if (!visible || !userId) return;
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from('dispatch_posts')
        .select('series_id, series_title, part_number')
        .eq('user_id', userId)
        .eq('kind', 'dossier')
        .not('series_id', 'is', null);
      // A series list that fails to load leaves BEGINNING one available rather
      // than blocking the sheet — the member can always start a new sequence.
      if (!cancelled && !error && data) setBegun(groupSeries(data as never));
    })();
    return () => { cancelled = true; };
  }, [visible, userId]);

  const choose = useCallback((s: Begun) => {
    setNaming(false);
    setPick({ id: s.id, title: s.title, part: nextPart(s.parts) });
  }, []);

  const begin = useCallback(() => {
    setNaming(true);
    setPick(null);
  }, []);

  const confirm = useCallback(() => {
    if (naming) {
      const t = newTitle.trim();
      if (!t) return;
      // A new series needs an id nothing else holds. Generated here rather than
      // by the server because the filing carries it on the same write.
      onSet({ id: Crypto.randomUUID(), title: t, part: 1 });
      return;
    }
    if (pick) onSet(pick);
  }, [naming, newTitle, pick, onSet]);

  const ready = naming ? newTitle.trim().length > 0 : !!pick;
  const shown = useMemo(() => begun.slice(0, 12), [begun]);

  if (!visible) return null;

  return (
    <View style={[StyleSheet.absoluteFillObject, { justifyContent: 'flex-end' }]}>
      {/* The ground closes it, as every sheet in this app does. */}
      <PressableScale
        style={StyleSheet.absoluteFillObject} onPress={onClose}
        accessibilityRole="button" accessibilityLabel="Close, without setting a series"
      >
        <View style={[StyleSheet.absoluteFillObject, { backgroundColor: 'rgba(4,3,2,0.72)' }]} />
      </PressableScale>

      <View style={[x.sheet, { paddingBottom: bottomInset + 22 }]}>
        <View style={x.head}>
          <Text style={x.headText} {...decorativeTextProps}>PART OF A SERIES</Text>
          {chosen ? (
            <PressableScale
              onPress={onClear} haptic="selection"
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              accessibilityRole="button" accessibilityLabel="Not part of a series"
            >
              <Text style={x.headClear} {...decorativeTextProps}>NOT A SERIES</Text>
            </PressableScale>
          ) : null}
        </View>
        <Text style={x.blurb} {...scaledTextProps}>
          A series is read in order. Choose one you have begun, or begin one.
        </Text>

        <ScrollView style={x.list} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          {shown.map((s) => (
            <Row key={s.id} s={s} chosen={!naming && pick?.id === s.id} onPick={() => choose(s)} />
          ))}

          <PressableScale
            style={x.row} onPress={begin} haptic="selection"
            accessibilityRole="button"
            accessibilityState={{ selected: naming }}
            accessibilityLabel="Begin a new series"
          >
            <Text style={[x.tick, !naming && x.tickOff]} {...decorativeTextProps}>+</Text>
            <Text style={x.begin} {...scaledTextProps}>BEGIN A NEW SERIES</Text>
          </PressableScale>

          {naming ? (
            <TextInput
              style={x.field}
              value={newTitle}
              onChangeText={setNewTitle}
              placeholder="Name the series"
              placeholderTextColor={colors.fog}
              maxLength={MAX_LENGTHS.seriesTitle}
              autoFocus
              cursorColor={colors.sepia}
              selectionColor={colors.sepiaGlow}
              keyboardAppearance="dark"
              accessibilityLabel="The new series' name"
              {...scaledTextProps}
            />
          ) : null}
        </ScrollView>

        {/* What is about to be written, in the words the page will print. */}
        {ready ? (
          <View style={x.confirm}>
            <Text style={x.confirmLabel} {...decorativeTextProps}>THIS DOSSIER WILL BE FILED AS</Text>
            <View style={x.confirmRow}>
              <Text style={x.confirmTitle} numberOfLines={1} {...displayTextProps}>
                {naming ? newTitle.trim() : pick?.title}
              </Text>
              <Text style={x.confirmPartLabel} {...decorativeTextProps}>PART</Text>
              <Text style={x.confirmPart} {...displayTextProps}>
                {roman(naming ? 1 : (pick?.part ?? 1))}
              </Text>
            </View>
          </View>
        ) : null}

        <PressableScale
          style={[x.set, !ready && x.setOff]} onPress={confirm} disabled={!ready} haptic="medium"
          accessibilityRole="button"
          accessibilityState={{ disabled: !ready }}
          accessibilityLabel="Set the series"
        >
          <Text style={[x.setText, !ready && x.setTextOff]} {...decorativeTextProps}>SET THE SERIES</Text>
        </PressableScale>
      </View>
    </View>
  );
}

const x = StyleSheet.create({
  sheet: {
    backgroundColor: 'rgba(8,6,4,0.99)',
    borderTopWidth: 1.5, borderTopColor: colors.sepiaBorder,
    paddingHorizontal: 20, paddingTop: 18,
  },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  headText: { fontFamily: fonts.sub, fontSize: 8.5, letterSpacing: 2, color: colors.bone, includeFontPadding: false },
  headClear: { fontFamily: fonts.sub, fontSize: 8.5, letterSpacing: 1.6, color: colors.fog, includeFontPadding: false },
  blurb: { fontFamily: fonts.body, fontSize: 11.5, lineHeight: 18, color: colors.fog, marginTop: 6, marginBottom: 10 },

  // Bounded so a member with many series cannot push the confirmation and the
  // button off a short screen.
  list: { maxHeight: 260 },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 11,
    borderBottomWidth: 1, borderBottomColor: 'rgba(184,137,26,0.16)',
  },
  tick: { fontFamily: fonts.sub, fontSize: 9, color: colors.sepia, width: 12, includeFontPadding: false },
  tickOff: { color: 'transparent' },
  rowText: { flex: 1, minWidth: 0 },
  rowTitle: { fontFamily: fonts.display, fontSize: 13, lineHeight: 17, color: colors.parchment },
  rowTitleOn: { color: colors.parchmentBright },
  rowSub: { fontFamily: fonts.sub, fontSize: 7, letterSpacing: 1.4, color: colors.fog, marginTop: 3, includeFontPadding: false },
  next: { fontFamily: fonts.sub, fontSize: 7.5, letterSpacing: 1.6, color: colors.sepia, includeFontPadding: false },
  begin: { fontFamily: fonts.sub, fontSize: 9, letterSpacing: 1.6, color: colors.sepia, includeFontPadding: false },

  field: {
    fontFamily: fonts.display, fontSize: 15, color: colors.parchmentBright,
    borderBottomWidth: 1, borderBottomColor: colors.sepiaBorder,
    paddingVertical: 10, marginTop: 4,
  },

  confirm: {
    marginTop: 16, borderWidth: 1, borderColor: 'rgba(184,137,26,0.30)',
    paddingHorizontal: 12, paddingVertical: 11,
  },
  confirmLabel: { fontFamily: fonts.sub, fontSize: 7, letterSpacing: 1.8, color: colors.sepia, marginBottom: 6, includeFontPadding: false },
  confirmRow: { flexDirection: 'row', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' },
  confirmTitle: { fontFamily: fonts.display, fontSize: 15, color: colors.parchmentBright, flex: 1, minWidth: 0 },
  confirmPartLabel: { fontFamily: fonts.sub, fontSize: 8, letterSpacing: 1.6, color: colors.fog, includeFontPadding: false },
  confirmPart: { fontFamily: fonts.display, fontSize: 17, color: colors.sepia },

  set: { borderWidth: 1, borderColor: colors.sepia, paddingVertical: 10, alignItems: 'center', marginTop: 14 },
  setOff: { borderColor: colors.ash },
  setText: { fontFamily: fonts.sub, fontSize: 8.5, letterSpacing: 2, color: colors.sepia, includeFontPadding: false },
  setTextOff: { color: colors.fog, opacity: 0.6 },
});
