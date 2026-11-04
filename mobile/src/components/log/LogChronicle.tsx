import React, { useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { Text } from '@/src/components/text';
import { ReelRating } from '@/src/components/Decorative';
import PressableScale from '@/src/components/PressableScale';
import { stripHTML, isRTLText } from '@/src/utils/text';
import { dateParts, formatDate } from '@/src/utils/timeAgo';
import { scaledTextProps } from '@/src/constants/textScaling';
import { colors, fonts } from '@/src/theme/theme';
import VaultNote from '@/src/components/log/VaultNote';
import { PageSection } from '@/src/components/log/PageSection';
import { lineWidth } from '@/src/components/lobby/measure';
import { useTextScale } from '@/src/hooks/useTextScale';
import { useColumnWidth } from '@/src/components/layout/navMetrics';
import { PAGE } from '@/src/components/log/pageMetrics';

/**
 * THE VIEWINGS: every time the film was watched, oldest first, this one last, as a strip of
 * dates and reels. The one chosen is marked along its top; choosing a past viewing shows its own
 * words beneath the strip (and, for its author, the Vault's note about it). This viewing's words
 * are the page's own, above.
 */
interface ViewingHistoryEntry {
  /** This viewing's own identity — how its private note is found. */
  viewingId?: string | null;
  date?: string | null;
  rating: number;
  review?: string | null;
  watchedWith?: string | null;
}

interface Viewing extends ViewingHistoryEntry {
  /** What the chronicle calls it: ◆ CURRENT, ◆ FIRST WATCH, VIEWING n. */
  label: string;
  isCurrent: boolean;
  /** Its note, for its author alone: a visitor's history has no notes in it at all. */
  note?: string;
}

interface LogChronicleProps {
  log: {
    watched_date?: string | null;
    rating: number;
    review?: string | null;
    watched_with?: string | null;
    viewing_history?: unknown;
    viewing_id?: string | null;
  };
  /** The note written about a given viewing, for the owner only. */
  noteFor?: (viewingId: string | null | undefined) => string;
  onOpenNote?: (args: { viewingId: string; label: string; isCurrent: boolean }) => void;
}

const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'] as const;
/** A cell's date: the month and the year, the strip's grain. */
const monthYear = (date: string | null | undefined) => {
  const p = dateParts(date);
  return p ? `${MONTHS[p.month] ?? ''} ${p.year}` : null;
};
const CELL = { size: 10, spacing: 1.2, padX: 8 } as const;

/** The history as stored: a list, or a list written as JSON; anything else is none. */
function historyOf(raw: unknown): ViewingHistoryEntry[] {
  if (Array.isArray(raw)) return raw;
  if (typeof raw !== 'string') return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export default function LogChronicle({ log, noteFor, onOpenNote }: LogChronicleProps) {
  const history = historyOf(log.viewing_history);
  const scale = useTextScale();
  const column = useColumnWidth();
  // Oldest first, this viewing last: the history is kept newest first.
  const viewings: Viewing[] = [
    ...history.map((entry, idx) => ({
      label: idx === history.length - 1 ? '◆ FIRST WATCH' : `VIEWING ${history.length - idx}`,
      viewingId: entry.viewingId, date: entry.date, rating: entry.rating, review: entry.review, watchedWith: entry.watchedWith,
      isCurrent: false, note: noteFor?.(entry.viewingId) || undefined,
    })).reverse(),
    {
      label: '◆ CURRENT', viewingId: log.viewing_id, date: log.watched_date, rating: log.rating, review: log.review,
      watchedWith: log.watched_with, isCurrent: true, note: noteFor?.(log.viewing_id) || undefined,
    },
  ];
  // A past viewing chosen, by its place; none chosen is this one (the last), whatever the history grows to.
  const [chosenPast, setChosenPast] = useState<number | null>(null);
  const chosen = chosenPast !== null && chosenPast < viewings.length - 1 ? chosenPast : viewings.length - 1;
  if (!history.length) return null;

  // As many to a row as each cell's widest date allows; the rest wrap beneath.
  const room = column - PAGE.pad * 2;
  const widest = Math.max(...viewings.map((v) => lineWidth(monthYear(v.date) ?? v.label, 'elite', CELL.size, scale, CELL.spacing))) + CELL.padX * 2;
  const cols = Math.max(1, Math.min(viewings.length, Math.floor(room / Math.max(widest, 72))));
  const pick = viewings[chosen];

  return (
    <PageSection title="THE VIEWINGS">
      <View style={st.strip} accessibilityRole="tablist">
        {viewings.map((v, i) => {
          const on = i === chosen;
          const when = monthYear(v.date);
          return (
            <PressableScale key={`${v.viewingId ?? v.label}-${i}`} onPress={() => setChosenPast(v.isCurrent ? null : i)} hitSlop={null} pressedScale={0.97} haptic="selection"
              style={[st.cell, { width: `${100 / cols}%` }, i % cols !== 0 && st.cellRuled]}
              accessibilityRole="tab" accessibilityState={{ selected: on }}
              accessibilityLabel={`${v.isCurrent ? 'This viewing' : v.label.replace('◆ ', '').toLowerCase()}${when ? `, ${when.toLowerCase()}` : ''}${v.rating > 0 ? `, ${v.rating} of 5 reels` : ''}`}>
              {on ? <View style={st.cellMark} /> : null}
              <Text style={[st.cellDate, on && st.cellDateOn]} {...scaledTextProps}>{when ?? v.label.replace('◆ ', '')}</Text>
              {v.rating > 0 ? <ReelRating rating={v.rating} size={11} /> : null}
            </PressableScale>
          );
        })}
      </View>

      {/* A past viewing, chosen: its own words, who it was with, its note. */}
      {pick && !pick.isCurrent ? (
        <View style={st.past}>
          <Text style={st.pastLabel} {...scaledTextProps}>
            {pick.label}{dateParts(pick.date) ? <Text style={st.pastDate}>{`  · ${formatDate(pick.date)}`}</Text> : null}
          </Text>
          {pick.review ? (
            <Text style={[st.pastWords, isRTLText(pick.review) && st.rtl]} {...scaledTextProps}>“{stripHTML(pick.review)}”</Text>
          ) : null}
          {pick.watchedWith ? <Text style={st.pastWith} {...scaledTextProps}>WITH {pick.watchedWith.toUpperCase()}</Text> : null}
          {pick.note ? (
            <VaultNote note={pick.note} compact
              onOpen={onOpenNote && pick.viewingId ? () => onOpenNote({ viewingId: pick.viewingId as string, label: pick.label, isCurrent: false }) : undefined} />
          ) : null}
        </View>
      ) : null}
    </PageSection>
  );
}

const st = StyleSheet.create({
  strip: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 10 },
  cell: { minHeight: 48, paddingHorizontal: CELL.padX, paddingVertical: 6, alignItems: 'center', justifyContent: 'center', gap: 6 },
  cellRuled: { borderLeftWidth: StyleSheet.hairlineWidth * 2, borderLeftColor: 'rgba(232,223,208,0.1)' },
  cellMark: { position: 'absolute', top: 0, left: 8, right: 8, height: 2, backgroundColor: colors.sepia },
  cellDate: { fontFamily: fonts.sub, fontSize: CELL.size, letterSpacing: CELL.spacing, color: colors.bone, includeFontPadding: false },
  cellDateOn: { color: colors.parchment },
  past: { marginTop: 12, gap: 8 },
  pastLabel: { fontFamily: fonts.sub, fontSize: 10, letterSpacing: 2, color: colors.sepia },
  pastDate: { color: colors.fog },
  pastWords: { fontFamily: fonts.bodyItalic, fontSize: 13, lineHeight: 19, color: colors.parchment },
  pastWith: { fontFamily: fonts.sub, fontSize: 10, letterSpacing: 1.4, color: colors.bone },
  rtl: { writingDirection: 'rtl', textAlign: 'right' },
});
