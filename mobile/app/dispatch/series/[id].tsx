/**
 * A SERIES — an essay in parts, listed.
 * ─────────────────────────────────────────────────────────────────────────────
 * `Part II of Ozu, in four parts` was a line at the head of a dossier pointing
 * at a page that did not exist. It exists now, and it is the letters page again:
 * the part number in the margin, the part in the column.
 *
 * ── IT DOES NOT DRAW PARTS THAT ARE NOT WRITTEN ────────────────────────────
 * `SeriesList` can dim an unwritten part and print TO COME, and this page never
 * passes that flag. Not an omission — a part exists as a ROW or it does not
 * exist at all, and the schema has no notion of one that is merely planned. The
 * only place a total appears is inside the series TITLE, as prose the member
 * wrote: "in four parts". Reading a number back out of an English sentence is
 * how a series called "Ozu, in the 1950s" acquires nineteen hundred and fifty
 * phantom parts.
 *
 * So `3 OF 3` counts what is really there. Less than the design imagined, and
 * true, which is the trade this app makes every time.
 *
 * ── AND WHY IT ASKS FOR THE WHOLE ESSAY ────────────────────────────────────
 * `FILING_FULL_COLUMNS`, not the card's. A dossier's `body` is a 500-character
 * EXCERPT, so a read time computed from it would say `1 MIN` under every essay
 * in the series — a fabricated number on a page whose entire job is helping
 * someone choose what to read next. The essay ceiling is 25,000 characters and
 * the list is bounded at 24, so the worst case is bounded too, and the real
 * case is four essays.
 */
import { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, Text, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PaperSheet } from '@/src/components/dispatch/paper/PaperFrame';
import { PaperBack } from '@/src/components/dispatch/paper/PaperMore';
import { SeriesList, type Part } from '@/src/components/dispatch/paper/PaperEssay';
import { p } from '@/src/components/dispatch/paper/paperStyles';
import { readTimeOf } from '@/src/components/dispatch/readTime';
import { supabase } from '@/src/lib/supabase';
import { FILING_FULL_COLUMNS, parseFilingRows, type Filing } from '@/src/stores/dispatchTypes';
import { colors } from '@/src/theme/theme';
import { nav } from '@/src/utils/typedRouter';
import { scaledTextProps } from '@/src/constants/textScaling';

/** A series is a handful of essays. Bounded because every read here is. */
const MOST_PARTS = 24;

export default function SeriesScreen() {
  const { id, from } = useLocalSearchParams<{ id: string; from?: string }>();
  const insets = useSafeAreaInsets();

  const [parts, setParts] = useState<Filing[]>([]);
  /**
   * How many parts the SERVER says there are, which is not always how many are
   * listed. `SeriesList` prints `3 OF 3` from the array it was handed, so a
   * series longer than the bound would have shown `24 OF 24` and called that the
   * whole thing — the same defect as the critique footer promising a page it
   * could not fetch, in my own code, three files away from where I found it.
   *
   * A twenty-five part essay series is not going to happen. That is not a reason
   * to print a number that would be wrong if it did.
   */
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    (async () => {
      try {
        const { data, error, count } = await supabase
          .from('dispatch_posts')
          // `exact`, so the page knows the difference between "these are all of
          // them" and "these are the first of them".
          .select(FILING_FULL_COLUMNS, { count: 'exact' })
          .eq('series_id', id)
          // The feed's own two gates, so a part cannot appear here that the
          // Dispatch itself would not show.
          .eq('is_published', true)
          .is('withheld_at', null)
          // And one more the feed does not have. The feed keeps an ENDED filing
          // in place as a tombstone, because the critiques written underneath it
          // survive and need somewhere to live. A reading list is not that: an
          // ended part has no title and no words left, so it would be a blank
          // row. It is left out, and the numbering keeps the truth — I, III, IV
          // says a part was withdrawn far more plainly than a blank line would.
          .is('ended_at', null)
          .order('part_number', { ascending: true, nullsFirst: false })
          .limit(MOST_PARTS);
        if (error) throw error;
        if (cancelled) return;
        const got = parseFilingRows(data ?? []).filings;
        setParts(got);
        // `count` is null when the server does not send one. Falling back to the
        // rows in hand is the only honest default: it claims nothing extra.
        setTotal(count ?? got.length);
      } catch {
        // Falls through to the empty page below, which is honest about a series
        // it cannot show. There is nothing to retry INTO — no cache, no partial
        // list — so a toast here would only interrupt the reader on their way
        // back to the essay they came from.
        if (!cancelled) setParts([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [id]);

  if (loading) {
    return (
      <View style={[p.screen, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator size="small" color={colors.sepia} />
      </View>
    );
  }

  /**
   * A series with nothing left in it.
   *
   * Reachable from an essay whose parts have since been withdrawn, from a stale
   * link, or from a read that failed. It gets a real page rather than a header
   * over blank space, which reads as a screen that did not finish loading.
   */
  if (parts.length === 0) {
    return (
      <View style={p.screen}>
        <PaperBack label="SERIES" onBack={() => nav.back()} />
        <View style={{ flex: 1, justifyContent: 'center', paddingHorizontal: 32 }}>
          <Text style={p.emptyTitle} accessibilityRole="header" {...scaledTextProps}>
            Nothing is left of this series.
          </Text>
          <Text style={p.emptyBody} {...scaledTextProps}>
            Its parts have been withdrawn, or the house removed them.
          </Text>
        </View>
      </View>
    );
  }

  const author = parts[0].author;
  const title = parts[0].seriesTitle ?? 'A SERIES';

  const rows: Part[] = parts.map((f, i) => ({
    // The member's own part number, and a position only when they left it null.
    // Roman-numbered margins are the design; an empty margin is not.
    n: String(f.partNumber ?? i + 1),
    title: f.title ?? '',
    readTime: readTimeOf(f.fullContent ?? f.body),
    certified: f.certifyCount,
    // `from` is the part the reader arrived from, so the page marks where they
    // already are. Absent when the series is reached any other way — and then
    // nothing is marked, which is correct: they are not in any of them.
    current: !!from && f.id === from,
  }));

  return (
    <View style={p.screen}>
      <PaperBack label="SERIES" onBack={() => nav.back()} />
      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}>
        {/* No `top` rail — the same as the reader, which is the page on the
            other side of this one. Both sit under a PaperBack bar, and that bar
            is the top edge; a second one 40pt below it reads as two headers.
            `seriesTitle` carries its own 16pt, so nothing sits flush. */}
        <PaperSheet>
          <SeriesList
            title={title}
            // The same stand-in the reader prints for a departed member, so one
            // author reads the same on both pages.
            author={author ?? { name: '[deleted]', memberNo: 0, tier: 'free' }}
            parts={rows}
            // Matched back by INDEX, not by the printed number: two parts a
            // member numbered `2` by hand would both point at the first one.
            onPart={(part) => {
              const at = rows.indexOf(part);
              const hit = at >= 0 ? parts[at] : undefined;
              if (hit) nav.push(`/dispatch/${hit.id}`);
            }}
            onAuthor={author ? () => nav.push(`/user/${author.name}`) : undefined}
          />
          {/* Said out loud rather than swallowed. The alternative is a page that
              lists twenty-four parts, prints `24 OF 24`, and is wrong. */}
          {total > parts.length ? (
            <Text style={p.ballotFoot} {...scaledTextProps}>
              {`THE FIRST ${parts.length} OF ${total} PARTS`}
            </Text>
          ) : null}
        </PaperSheet>
      </ScrollView>
    </View>
  );
}

// Expo Router per-route crash net — see src/components/RouteErrorBoundary.tsx
export { RouteErrorBoundary as ErrorBoundary } from '@/src/components/RouteErrorBoundary';
