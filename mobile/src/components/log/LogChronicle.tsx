 
import React from 'react';
import { View, Text, ScrollView } from 'react-native';
import { ReelRating } from '@/src/components/Decorative';
import { stripHTML } from '@/src/utils/text';
import { s } from '@/app/log/_logDetailStyles';

interface ViewingHistoryEntry {
  date?: string;
  rating: number;
  review?: string;
  watchedWith?: string;
}

// ── Memoized Viewing History Card ──
 
const ChronicleCard = React.memo(({ entry, cardWidth }: { entry: Record<string, any>; cardWidth: number }) => (
  <View style={[s.chronicleCard, { width: cardWidth }]}>
    <View style={s.chronicleLabelRow}>
      <View style={[s.chronicleLabelBadge, entry.isCurrent && s.chronicleLabelBadgeCurrent]}>
        <Text style={[s.chronicleLabelText, entry.isCurrent && s.chronicleLabelTextCurrent]}>
          {entry.label}
        </Text>
      </View>
      {entry.date && (
        <Text style={s.chronicleDateText}>
          · {new Date(entry.date).toLocaleDateString('en-US', { timeZone: 'UTC', month: 'short', day: 'numeric', year: 'numeric' })}
        </Text>
      )}
    </View>
    {entry.rating > 0 && (
      <View style={s.chronicleRatingWrap}>
        <ReelRating rating={entry.rating} size={12} />
      </View>
    )}
    {entry.review ? (
      <ScrollView style={s.maxHeight200} nestedScrollEnabled showsVerticalScrollIndicator={false}>
        <Text style={[s.chronicleReviewText, entry.isCurrent && s.chronicleReviewTextCurrent, !entry.isCurrent && s.chronicleReviewTextPast]} adjustsFontSizeToFit minimumFontScale={0.8}>
          {entry.isCurrent ? '' : '"'}{stripHTML(entry.review)}{entry.isCurrent ? '' : '"'}
        </Text>
      </ScrollView>
    ) : null}
    {entry.watchedWith ? (
      <Text style={s.chronicleWatchedWith}>
        ♡ {entry.watchedWith}
      </Text>
    ) : null}
  </View>
), (prevProps, nextProps) => {
  return prevProps.cardWidth === nextProps.cardWidth &&
         prevProps.entry.label === nextProps.entry.label &&
         prevProps.entry.date === nextProps.entry.date &&
         prevProps.entry.rating === nextProps.entry.rating &&
         prevProps.entry.review === nextProps.entry.review &&
         prevProps.entry.watchedWith === nextProps.entry.watchedWith &&
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
  };
  windowWidth: number;
  chronicleActiveIdx: number;
  onChronicleIdxChange: (idx: number) => void;
}

export default function LogChronicle({
  log,
  windowWidth,
  chronicleActiveIdx,
  onChronicleIdxChange,
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

  const allViewings = [
    // Current viewing (top-level log data)
    {
      label: '◆ CURRENT',
      date: log.watched_date,
      rating: log.rating,
      review: log.review,
      watchedWith: log.watched_with,
      isCurrent: true,
    },
    // Past viewings (archived history)
    ...history.map((entry: ViewingHistoryEntry, idx: number) => ({
      label: idx === history.length - 1 ? '◆ FIRST WATCH' : `VIEWING ${history.length - idx}`,
      date: entry.date,
      rating: entry.rating,
      review: entry.review,
      watchedWith: entry.watchedWith,
      isCurrent: false,
    })),
  ];

  const cardWidth = windowWidth - 34; // 32 margin + 2 border

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
          <ChronicleCard key={idx} entry={entry} cardWidth={cardWidth} />
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
