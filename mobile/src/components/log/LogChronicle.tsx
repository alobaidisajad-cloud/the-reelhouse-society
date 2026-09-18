 
import React from 'react';
import { View, Text, ScrollView } from 'react-native';
import { ReelRating } from '@/src/components/Decorative';
import { stripHTML, isRTLText } from '@/src/utils/text';
import { dateParts, formatDate } from '@/src/utils/timeAgo';
import { scaledTextProps } from '@/src/constants/textScaling';
import { s, SPINE } from '@/src/components/log/logDetailStyles';
import VaultNote from '@/src/components/log/VaultNote';

interface ViewingHistoryEntry {
  /** This viewing's own identity — how its private note is found. */
  viewingId?: string | null;
  date?: string | null;
  rating: number;
  review?: string | null;
  watchedWith?: string | null;
}

/**
 * A past viewing plus the two things this screen adds: what to call it, and
 * whether it is the viewing being read right now.
 *
 * Spelled out because the card took `Record<string, any>`, which meant every
 * field it reads — and the six it compares in the memo below — were unchecked.
 * A renamed field would have compiled and silently rendered a blank card.
 */
interface ChronicleEntry extends ViewingHistoryEntry {
  label: string;
  isCurrent: boolean;
  /**
   * The note this member wrote about this viewing. Only ever set for the log's
   * owner — a visitor's copy of a viewing has no note in it at all, because the
   * server strips notes out of the history every member can read.
   */
  note?: string;
}

// ── Memoized Viewing History Card ──
 
const ChronicleCard = React.memo(({ entry, cardWidth, onOpenNote }: {
  entry: ChronicleEntry;
  cardWidth: number;
  onOpenNote?: (entry: ChronicleEntry) => void;
}) => (
  <View style={[s.chronicleCard, { width: cardWidth }]}>
    <View style={s.chronicleLabelRow}>
      <View style={[s.chronicleLabelBadge, entry.isCurrent && s.chronicleLabelBadgeCurrent]}>
        <Text style={[s.chronicleLabelText, entry.isCurrent && s.chronicleLabelTextCurrent]}>
          {entry.label}
        </Text>
      </View>
      {!!dateParts(entry.date) && (
        <Text style={s.chronicleDateText}>· {formatDate(entry.date)}</Text>
      )}
    </View>
    {entry.rating > 0 && (
      <View style={s.chronicleRatingWrap}>
        <ReelRating rating={entry.rating} size={12} />
      </View>
    )}
    {entry.review ? (
      <ScrollView style={s.maxHeight200} nestedScrollEnabled showsVerticalScrollIndicator={false}>
        {/* Same two rules as every other place a member's own writing is read on
            this page: a capped line box (this one is fixed at 20/22pt and would
            clip without it) and the paragraph's own direction. */}
        <Text
          style={[
            s.chronicleReviewText,
            entry.isCurrent && s.chronicleReviewTextCurrent,
            !entry.isCurrent && s.chronicleReviewTextPast,
            isRTLText(entry.review) && s.rtlText,
          ]}
          {...scaledTextProps}
        >
          {entry.isCurrent ? '' : '"'}{stripHTML(entry.review)}{entry.isCurrent ? '' : '"'}
        </Text>
      </ScrollView>
    ) : null}
    {entry.watchedWith ? (
      <Text style={s.chronicleWatchedWith}>
        ♡ {entry.watchedWith}
      </Text>
    ) : null}
    {/* The note written about THIS viewing. Clamped to three lines so one long
        note cannot swell a card every other viewing has to match; the whole of
        it is one tap away. The CURRENT viewing's note is not repeated here — it
        is already under the review, a few hundred points up the same page. */}
    {!entry.isCurrent && !!entry.note && (
      <VaultNote note={entry.note} compact onOpen={onOpenNote ? () => onOpenNote(entry) : undefined} />
    )}
  </View>
), (prevProps, nextProps) => {
  return prevProps.cardWidth === nextProps.cardWidth &&
         prevProps.entry.label === nextProps.entry.label &&
         prevProps.entry.date === nextProps.entry.date &&
         prevProps.entry.rating === nextProps.entry.rating &&
         prevProps.entry.review === nextProps.entry.review &&
         prevProps.entry.watchedWith === nextProps.entry.watchedWith &&
         prevProps.entry.note === nextProps.entry.note &&
         prevProps.entry.isCurrent === nextProps.entry.isCurrent;
});

ChronicleCard.displayName = 'ChronicleCard';

interface LogChronicleProps {
  log: {
    watched_date?: string | null;
    rating: number;
    review?: string | null;
    watched_with?: string | null;
    viewing_history?: unknown;
    viewing_id?: string | null;
  };
  windowWidth: number;
  chronicleActiveIdx: number;
  onChronicleIdxChange: (idx: number) => void;
  /**
   * The note written about a given viewing, for the owner only. Absent for
   * everyone else, which is why a visitor's chronicle draws no Vault at all.
   */
  noteFor?: (viewingId: string | null | undefined) => string;
  onOpenNote?: (args: { viewingId: string; label: string; isCurrent: boolean }) => void;
}

export default function LogChronicle({
  log,
  windowWidth,
  chronicleActiveIdx,
  onChronicleIdxChange,
  noteFor,
  onOpenNote,
}: LogChronicleProps) {
  const rawHist = log.viewing_history;
  const history: ViewingHistoryEntry[] = Array.isArray(rawHist)
    ? rawHist
    : (typeof rawHist === 'string'
      ? (() => {
          try {
            const parsed = JSON.parse(rawHist);
            return Array.isArray(parsed) ? parsed : [];
          } catch {
            return [];
          }
        })()
      : []);
  if (!history.length) return null;

  // Annotated so a mismatch is caught HERE, where the entries are built, rather
  // than surfacing as a blank card.
  const allViewings: ChronicleEntry[] = [
    // Current viewing (top-level log data)
    {
      label: '◆ CURRENT',
      viewingId: log.viewing_id,
      date: log.watched_date,
      rating: log.rating,
      review: log.review,
      watchedWith: log.watched_with,
      isCurrent: true,
      note: noteFor?.(log.viewing_id) || undefined,
    },
    // Past viewings (archived history)
    ...history.map((entry: ViewingHistoryEntry, idx: number) => ({
      label: idx === history.length - 1 ? '◆ FIRST WATCH' : `VIEWING ${history.length - idx}`,
      viewingId: entry.viewingId,
      date: entry.date,
      rating: entry.rating,
      review: entry.review,
      watchedWith: entry.watchedWith,
      isCurrent: false,
      note: noteFor?.(entry.viewingId) || undefined,
    })),
  ];

  // Flush paging: the chronicle sits at one spine each side inside the card, minus its own hairline borders.
  const cardWidth = windowWidth - SPINE * 2 - 2;

  return (
    <View style={s.chronicleWrap}>
      {/* Header */}
      <View style={s.chronicleHeader}>
        <View style={s.chronicleDot} />
        <Text style={s.chronicleTitle}>
          VIEWING CHRONICLE — {allViewings.length} viewings
        </Text>
      </View>

      {/* Horizontal scroll */}
      <ScrollView
        horizontal
        pagingEnabled={false}
        snapToInterval={cardWidth}
        snapToAlignment="start"
        decelerationRate="fast"
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={(e) => {
          const page = Math.round(e.nativeEvent.contentOffset.x / cardWidth);
          onChronicleIdxChange(page);
        }}
        style={s.flexGrowZero}
      >
        {allViewings.map((entry, idx) => (
          <ChronicleCard
            key={idx}
            entry={entry}
            cardWidth={cardWidth}
            onOpenNote={onOpenNote && entry.viewingId
              ? (e) => onOpenNote({ viewingId: e.viewingId as string, label: e.label, isCurrent: e.isCurrent })
              : undefined}
          />
        ))}
      </ScrollView>

      {/* Dot indicators */}
      {allViewings.length > 1 && (
        <View style={s.chronicleDots}>
          {allViewings.map((_, idx) => (
            <View key={idx} style={[s.chronicleDotIndicator, idx === chronicleActiveIdx && s.chronicleDotActive]} />
          ))}
        </View>
      )}
    </View>
  );
}
