/**
 * film-reviews/[id] — THE LOG ARCHIVE for a single film.
 * ────────────────────────────────────────────────────────
 * Cohesion law: a log looks the same in every room of the house.
 * This page renders the Reel's own frame (ActivityCard) — its byline, still,
 * poster, verdict, words, breakdown and action band — filtered to one film, twenty at a time, each page starting where the last
 * one ended (by time, then id): a critique filed while a member reads, or two
 * filed in the same instant, never repeats or skips one.
 *
 * The poster press is overridden to go BACK: the member came from this
 * film's page, so the card must never stack a duplicate on top of it.
 */
import React, { useState, useEffect, useCallback } from 'react';
import { View, StyleSheet } from 'react-native';
import { Text } from '@/src/components/text';
import { CinematicFlashList } from '@/src/components/layout/CinematicFlashList';
import { Stack } from 'expo-router';
import { P, useRouteParams } from '@/src/utils/routeParams';
import { NotInTheArchive } from '@/src/components/NotInTheArchive';
import { useQuery } from '@tanstack/react-query';
import { tmdb } from '@/src/lib/tmdb';
import { ArrowLeft } from 'lucide-react-native';
import {
  useBottomEdge, useContentBottom, usePushedHeaderTop,
} from '@/src/components/layout/navMetrics';

import { supabase } from '../../src/lib/supabase';
import { colors, fonts } from '../../src/theme/theme';
import { RoomLight } from '@/src/components/atmosphere/RoomLight';
import PressableScale from '@/src/components/PressableScale';
import { ActivityCard } from '@/src/components/feed/ActivityCard';
import { FeedItemSchema, type FeedItem } from '@/src/schemas/feed.schema';
import { filterContentByBlocks } from '@/src/utils/filterContentByBlocks';
import { logCountsSelect, withLogCountFilters, liftLogCounts } from '@/src/services/logCounts';
import { tellMarks } from '@/src/stores/tellMarks';
import { useAuthStore } from '@/src/stores/auth';
import { EmptyOffline } from '@/src/components/EmptyStates';
import { nav } from '@/src/utils/typedRouter';
import { LogModerationHost } from '@/src/components/moderation/LogModerationHost';
import { ReelReading, StateFrame, NextReelFailed, FrameSkeleton } from '@/src/components/reels/ReelStates';
import Buster from '@/src/components/Buster';
import { scaledTextProps, displayTextProps } from '@/src/constants/textScaling';

const PAGE_SIZE = 20;

// The Reel's columns, the Reel's two counts and the viewer's own mark: this
// page draws the Reel's own card, and a card is not whole without the numbers
// on its bar and the right heart.
const LOG_COLUMNS = (viewerId: string | null) =>
  `id, film_id, film_title, poster_path, rating, review, drop_cap, status, abandoned_reason, created_at, year, user_id, editorial_header, pull_quote, watched_with, is_autopsied, autopsy, is_spoiler, profiles!logs_user_id_fkey(username, avatar_url, role), ${logCountsSelect(viewerId)}`;

/** Where the next page starts: the last row read, by its time and then its id. */
type Cursor = { at: string; id: string } | null;

/** Rows after the cursor, in the page's own order (newest first, id breaking ties). */
export function afterCursor(c: { at: string; id: string }): string {
  return `created_at.lt."${c.at}",and(created_at.eq."${c.at}",id.lt."${c.id}")`;
}

interface RawLogRow {
  [key: string]: unknown;
  user_id: string;
  profiles: { username?: string; avatar_url?: string | null; role?: string } | { username?: string; avatar_url?: string | null; role?: string }[] | null;
}

/** One page of the film's critiques, newest first, from `from` (null: the first page). */
async function readPage(filmId: string, from: Cursor) {
  const askedAt = Date.now();
  const viewer = useAuthStore.getState().user?.id ?? null;
  let query = withLogCountFilters(supabase
    .from('logs')
    .select(LOG_COLUMNS(viewer)), viewer)
    .eq('film_id', filmId)
    .not('review', 'is', null)
    .neq('review', '')
    .order('created_at', { ascending: false })
    .order('id', { ascending: false });
  if (from) query = query.or(afterCursor(from));
  const { data, error } = await query.limit(PAGE_SIZE);
  return { data, error, askedAt };
}

const PARAMS = { id: P.tmdbId, title: P.words(200) };

/** The route: a link of another shape is a page not in the archive (routeParams, P4.4). */
export default function FilmReviewsScreenRoute() {
  const { id, title } = useRouteParams(PARAMS);
  return id ? <FilmReviewsScreen filmId={String(id)} title={title} /> : <NotInTheArchive />;
}

function FilmReviewsScreen({ filmId, title }: { filmId: string; title?: string }) {
  const edge = useBottomEdge();
  const end = useContentBottom();
  const headerTop = usePushedHeaderTop();

  const [logs, setLogs] = useState<FeedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchingMore, setFetchingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [cursor, setCursor] = useState<Cursor>(null);
  // The first page could not be read: said, not "the projection box awaits".
  const [failed, setFailed] = useState(false);
  // A later page could not be read: the critiques drawn stay, and the foot says so.
  const [moreFailed, setMoreFailed] = useState(false);

  const showPage = useCallback((isLoadMore: boolean, { data, error, askedAt }: Awaited<ReturnType<typeof readPage>>) => {
    if (isLoadMore) setMoreFailed(!!error);
    else setFailed(!!error);

    if (data) {
      // Map the profiles join into the flat FeedItem shape the card expects;
      // one malformed row is dropped, never the whole archive.
      const mapped = (data as unknown as RawLogRow[])
        .map((r) => {
          const profile = Array.isArray(r.profiles) ? r.profiles[0] : r.profiles;
          const parsed = FeedItemSchema.safeParse({
            ...liftLogCounts(r as unknown as Record<string, unknown>),
            username: profile?.username,
            avatar_url: profile?.avatar_url ?? null,
            role: profile?.role,
          });
          return parsed.success ? parsed.data : null;
        })
        .filter((x): x is FeedItem => x !== null);
      tellMarks('log', mapped.map((i) => ({ id: i.id, certify: i.certify_count, critique: i.critique_count, certified: i.certified })), askedAt);

      // HOOK-8 parity with the Reel: blocked/muted members stay invisible.
      const visible = filterContentByBlocks(mapped, (r) => r.user_id ?? '');

      if (isLoadMore) {
        setLogs(prev => {
          const have = new Set(prev.map((p) => p.id));
          return [...prev, ...visible.filter((v) => !have.has(v.id))];
        });
      } else {
        setLogs(visible);
      }
      // From the RAW page: a row dropped as malformed or blocked never ends the archive early.
      setHasMore(data.length === PAGE_SIZE);
      const last = (data as unknown as { created_at?: string; id?: string }[])[data.length - 1];
      setCursor(last?.created_at && last?.id ? { at: last.created_at, id: last.id } : null);
    }

    if (isLoadMore) setFetchingMore(false);
    else setLoading(false);
  }, []);

  const fetchLogs = useCallback((isLoadMore = false) => {
    if (!filmId) return;
    if (isLoadMore && (!hasMore || fetchingMore)) return;
    if (isLoadMore) setFetchingMore(true);
    else setLoading(true);
    void readPage(filmId, isLoadMore ? cursor : null).then((page) => showPage(isLoadMore, page));
  }, [filmId, cursor, hasMore, fetchingMore, showPage]);

  // The first page, read once: the screen opens loading.
  useEffect(() => {
    if (!filmId) return;
    void readPage(filmId, null).then((page) => showPage(false, page));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleFilmPress = useCallback(() => {
    // The member came from this film: walk them back to it. Opened cold, open it.
    if (nav.canGoBack()) nav.back();
    else nav.replace(`/film/${filmId}`);
  }, [filmId]);

  const renderLog = useCallback(({ item, index }: { item: FeedItem; index: number }) => (
    <ActivityCard item={item} index={index} onFilmPress={handleFilmPress} />
  ), [handleFilmPress]);

  // No critique on file: the film itself is asked after, so a number the catalogue never had is a
  // path that leads nowhere, never "no member has written on this film yet" (P4.21). Unreachable,
  // the archive's own answer stands: no member has written on it.
  const onFile = useQuery({
    queryKey: ['film-on-file', filmId],
    enabled: !loading && !failed && logs.length === 0,
    retry: false,
    queryFn: async () => (await tmdb.detail(Number(filmId))) !== null,
  });
  if (onFile.data === false) return <NotInTheArchive />;
  const asking = !loading && !failed && logs.length === 0 && onFile.isPending;

  return (
    <View style={s.container}>
      <RoomLight room="film" />
      <Stack.Screen options={{ headerShown: false }} />

      {/* Header */}
      <View style={[s.header, { paddingTop: headerTop }]}>
        <PressableScale touch="wayOut" onPress={() => nav.back()} style={s.backBtn} hitSlop={null} haptic="light" accessibilityLabel="Go back">
          <ArrowLeft size={18} color={colors.sepia} strokeWidth={1.5} />
        </PressableScale>
        <View style={s.headerTextWrap}>
          <Text style={s.headerEyebrow} {...scaledTextProps}>THE LOG ARCHIVE</Text>
          {/* Already decoded by the router. Decoding it again threw on a title
              with a percent sign ("100% Wolf") and took the page down. Whole, on as many lines as it takes. */}
          <Text style={s.headerTitle} {...displayTextProps} accessibilityRole="header">{title || 'Archive'}</Text>
        </View>
        {/* The back's width again, so the title stands in the middle of the page. */}
        <View style={s.backBtn} />
      </View>

      {/* Content */}
      {loading || asking ? (
        <View style={s.listContent}><ReelReading /></View>
      ) : (
        <CinematicFlashList
          bottomInset={edge}
          data={logs}
          keyExtractor={(item: FeedItem) => item.id}
          renderItem={renderLog}
          onEndReached={() => fetchLogs(true)}
          onEndReachedThreshold={0.5}
          contentContainerStyle={[s.listContent, { paddingBottom: end }]}
          showsVerticalScrollIndicator={false}
          estimatedItemSize={230}
          ListFooterComponent={
            fetchingMore ? <FrameSkeleton />
              : moreFailed ? <NextReelFailed words="More critiques could not be reached." what="ask for more critiques" onRetry={() => fetchLogs(true)} />
              : null
          }
          ListEmptyComponent={failed ? (
            <StateFrame><EmptyOffline onRetry={() => fetchLogs()} /></StateFrame>
          ) : (
            <StateFrame>
              <Buster size={48} mood="unimpressed" />
              <Text style={s.emptyTitle} {...displayTextProps}>The projection box awaits.</Text>
              <Text style={s.emptySub} {...scaledTextProps}>No member has written on this film yet.</Text>
            </StateFrame>
          )}
        />
      )}
      <LogModerationHost />
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.ink },
  // The back, the archive's name in the middle, and the back's width again: the title centred.
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingBottom: 12, paddingHorizontal: 8,
    borderBottomWidth: 1, borderBottomColor: 'rgba(232,223,208,0.1)',
  },
  backBtn: { width: 48, height: 48, justifyContent: 'center', alignItems: 'center' },
  headerTextWrap: { flex: 1, alignItems: 'center' },
  headerEyebrow: { fontFamily: fonts.sub, fontSize: 10, letterSpacing: 3, color: colors.bone, includeFontPadding: false, textAlign: 'center' },
  headerTitle: { fontFamily: fonts.display, fontSize: 18, lineHeight: 24, color: colors.silverScreen, marginTop: 4, textAlign: 'center' },
  // Its foot is the page's (useContentBottom), set where it is drawn.
  listContent: { paddingTop: 12 },

  emptyTitle: { fontFamily: fonts.display, fontSize: 17, letterSpacing: 0.5, color: colors.parchment, textAlign: 'center', marginTop: 14 },
  emptySub: { fontFamily: fonts.bodyItalic, fontSize: 13, lineHeight: 20, color: colors.fog, textAlign: 'center', maxWidth: 280, marginTop: 8 },
});

// Expo Router per-route crash net — see src/components/RouteErrorBoundary.tsx
export { RouteErrorBoundary as ErrorBoundary } from '@/src/components/RouteErrorBoundary';
