/**
 * film-reviews/[id] — THE LOG ARCHIVE for a single film.
 * ────────────────────────────────────────────────────────
 * Cohesion law: a log looks the same in every room of the house.
 * This page renders the Reel's own ActivityCard — ledger row, poster
 * frame, verdict, prose, stamp bar, and the confidential autopsy back —
 * filtered to one film, paginated twenty at a time.
 *
 * The poster press is overridden to go BACK: the member came from this
 * film's page, so the card must never stack a duplicate on top of it.
 */
import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { CinematicFlashList } from '@/src/components/layout/CinematicFlashList';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { ArrowLeft } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { supabase } from '../../src/lib/supabase';
import { colors, fonts } from '../../src/theme/theme';
import PressableScale from '@/src/components/PressableScale';
import { ActivityCard } from '@/src/components/feed/ActivityCard';
import { FeedItemSchema, type FeedItem } from '@/src/schemas/feed.schema';
import { filterContentByBlocks } from '@/src/utils/filterContentByBlocks';

const PAGE_SIZE = 20;

const LOG_COLUMNS =
  'id, film_id, film_title, poster_path, rating, review, drop_cap, status, abandoned_reason, created_at, year, user_id, editorial_header, pull_quote, watched_with, is_autopsied, autopsy, is_spoiler, profiles!logs_user_id_fkey(username, avatar_url, role)';

interface RawLogRow {
  [key: string]: unknown;
  user_id: string;
  profiles: { username?: string; avatar_url?: string | null; role?: string } | { username?: string; avatar_url?: string | null; role?: string }[] | null;
}

export default function FilmReviewsScreen() {
  const { id: filmId, title } = useLocalSearchParams<{ id: string; title?: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [logs, setLogs] = useState<FeedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchingMore, setFetchingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [page, setPage] = useState(0);

  const fetchLogs = useCallback(async (isLoadMore = false) => {
    if (!filmId) return;
    if (isLoadMore && (!hasMore || fetchingMore)) return;

    if (isLoadMore) {
      setFetchingMore(true);
    } else {
      setLoading(true);
    }

    const { data } = await supabase
      .from('logs')
      .select(LOG_COLUMNS)
      .eq('film_id', filmId)
      .not('review', 'is', null)
      .neq('review', '')
      .order('created_at', { ascending: false })
      .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

    if (data) {
      // Map the profiles join into the flat FeedItem shape the card expects;
      // one malformed row is dropped, never the whole archive.
      const mapped = (data as unknown as RawLogRow[])
        .map((r) => {
          const profile = Array.isArray(r.profiles) ? r.profiles[0] : r.profiles;
          const parsed = FeedItemSchema.safeParse({
            ...r,
            username: profile?.username,
            avatar_url: profile?.avatar_url ?? null,
            role: profile?.role,
          });
          return parsed.success ? parsed.data : null;
        })
        .filter((x): x is FeedItem => x !== null);

      // HOOK-8 parity with the Reel: blocked/muted members stay invisible.
      const visible = filterContentByBlocks(mapped, (r) => r.user_id ?? '');

      if (isLoadMore) {
        setLogs(prev => [...prev, ...visible]);
      } else {
        setLogs(visible);
      }
      setHasMore(data.length === PAGE_SIZE);
      setPage(prev => prev + 1);
    }

    if (isLoadMore) setFetchingMore(false);
    else setLoading(false);
  }, [filmId, page, hasMore, fetchingMore]);

  useEffect(() => {
    fetchLogs();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleFilmPress = useCallback(() => {
    // The member is already standing on this film — walk them back to it.
    if (router.canGoBack()) router.back();
  }, [router]);

  const renderLog = useCallback(({ item, index }: { item: FeedItem; index: number }) => (
    <ActivityCard item={item} index={index} onFilmPress={handleFilmPress} />
  ), [handleFilmPress]);

  return (
    <View style={s.container}>
      <Stack.Screen options={{ headerShown: false }} />

      {/* Header */}
      <View style={[s.header, { paddingTop: Math.max(insets.top + 10, 60) }]}>
        <PressableScale onPress={() => router.back()} style={s.backBtn} hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }} haptic="light" accessibilityLabel="Go back">
          <ArrowLeft size={16} color={colors.sepia} strokeWidth={1.5} />
        </PressableScale>
        <View style={s.headerTextWrap}>
          <Text style={s.headerEyebrow}>THE LOG ARCHIVE</Text>
          <Text style={s.headerTitle} numberOfLines={1}>{title ? decodeURIComponent(title) : 'Archive'}</Text>
        </View>
      </View>

      {/* Content */}
      {loading ? (
        <View style={s.centerBox}>
          <ActivityIndicator color={colors.sepia} />
        </View>
      ) : (
        <CinematicFlashList
          bottomInset={insets.bottom}
          data={logs}
          keyExtractor={(item: FeedItem) => item.id}
          renderItem={renderLog}
          onEndReached={() => fetchLogs(true)}
          onEndReachedThreshold={0.5}
          contentContainerStyle={[s.listContent, { paddingBottom: Math.max(insets.bottom + 20, 100) }]}
          showsVerticalScrollIndicator={false}
          estimatedItemSize={230}
          ListFooterComponent={
            fetchingMore ? <ActivityIndicator color={colors.sepia} style={{ marginVertical: 20 }} /> : null
          }
          ListEmptyComponent={
            <View style={s.emptyBox}>
              <Text style={s.emptyTitle}>The projection box awaits.</Text>
            </View>
          }
        />
      )}
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.ink },
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingBottom: 16, paddingHorizontal: 20,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.sepiaBorder,
  },
  backBtn: { width: 40, height: 40, justifyContent: 'center', alignItems: 'flex-start' },
  headerTextWrap: { flex: 1 },
  headerEyebrow: { fontFamily: fonts.sub, fontSize: 8, letterSpacing: 2.5, color: colors.sepia, marginBottom: 2, includeFontPadding: false },
  headerTitle: { fontFamily: fonts.display, fontSize: 18, color: colors.parchment },
  centerBox: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  listContent: { paddingTop: 20, paddingBottom: 100 },

  emptyBox: { padding: 40, alignItems: 'center' },
  emptyTitle: { fontFamily: fonts.display, fontSize: 16, color: colors.sepia },
});
