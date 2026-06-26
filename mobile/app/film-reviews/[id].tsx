import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { CinematicFlashList } from '@/src/components/layout/CinematicFlashList';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { supabase } from '../../src/lib/supabase';
import { colors, fonts } from '../../src/theme/theme';
import { ArrowLeft, Star } from 'lucide-react-native';
import PressableScale from '@/src/components/PressableScale';
import SpoilerVeil from '@/src/components/SpoilerVeil';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

type CommunityReview = {
  id: string;
  rating: number;
  review: string;
  status: string;
  abandoned_reason: string | null;
  created_at: string;
  username: string;
  role: string;
  pull_quote: string | null;
  drop_cap: boolean;
  is_spoiler: boolean;
};

interface RawReviewRow {
  id: string;
  rating: number;
  review: string;
  status: string;
  abandoned_reason: string | null;
  created_at: string;
  user_id: string;
  pull_quote: string | null;
  drop_cap: boolean;
  is_spoiler: boolean | null;
  profiles: { username: string; role: string } | { username: string; role: string }[] | null;
}

const PAGE_SIZE = 20;

export default function FilmReviewsScreen() {
  const { id: filmId, title } = useLocalSearchParams<{ id: string; title?: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [reviews, setReviews] = useState<CommunityReview[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchingMore, setFetchingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [page, setPage] = useState(0);

  const fetchReviews = useCallback(async (isLoadMore = false) => {
    if (!filmId) return;
    if (isLoadMore && (!hasMore || fetchingMore)) return;

    if (isLoadMore) {
      setFetchingMore(true);
    } else {
      setLoading(true);
    }

    const { data } = await supabase
      .from('logs')
      .select('id, rating, review, status, abandoned_reason, created_at, pull_quote, drop_cap, is_spoiler, user_id, profiles!logs_user_id_fkey(username, role)')
      .eq('film_id', filmId)
      .not('review', 'is', null)
      .order('created_at', { ascending: false })
      .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

    if (data) {
      const mapped = (data as unknown as RawReviewRow[]).map((r) => {
        const profile = Array.isArray(r.profiles) ? r.profiles[0] : r.profiles;
        return {
          id: String(r.id),
          rating: Number(r.rating) || 0,
          review: String(r.review) || '',
          status: String(r.status),
          abandoned_reason: r.abandoned_reason,
          created_at: String(r.created_at),
          username: profile?.username || 'anonymous',
          role: profile?.role || 'cinephile',
          pull_quote: r.pull_quote,
          drop_cap: Boolean(r.drop_cap),
          is_spoiler: Boolean(r.is_spoiler),
        };
      });

      if (isLoadMore) {
        setReviews(prev => [...prev, ...mapped]);
      } else {
        setReviews(mapped);
      }
      setHasMore(data.length === PAGE_SIZE);
      setPage(prev => prev + 1);
    }
    
    if (isLoadMore) setFetchingMore(false);
    else setLoading(false);
  }, [filmId, page, hasMore, fetchingMore]);

  useEffect(() => {
    fetchReviews();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const renderReview = ({ item }: { item: CommunityReview }) => {
    const tierLabel = item.role === 'auteur' ? 'Auteur' : item.role === 'archivist' ? 'Archivist' : 'Cinephile';
    const strippedReview = (item.review ?? '').replace(/<[^>]+>/g, '').trim();

    return (
      <View style={s.reviewCard}>
        {/* eslint-disable-next-line react/no-unescaped-entities */}
        <Text style={s.reviewQuote}>"</Text>
        <View style={s.reviewHeader}>
          <View>
            <PressableScale onPress={() => router.push(`/user/${item.username}` as any)} pressedScale={0.97} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Text style={s.reviewAuthor}>@{item.username ?? 'anonymous'}</Text>
            </PressableScale>
            <Text style={s.reviewTier}>{tierLabel}</Text>
          </View>
          {item.status === 'abandoned' ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(125,31,31,0.1)', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 2, borderWidth: 1, borderColor: 'rgba(125,31,31,0.3)' }}>
              <Text style={{ fontFamily: fonts.ui, fontSize: 8, letterSpacing: 1, color: colors.bloodReel }}>
                ABANDONED{item.abandoned_reason ? ` — ${item.abandoned_reason.toUpperCase()}` : ''}
              </Text>
            </View>
          ) : item.rating > 0 ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
              <Star size={10} color={colors.sepia} strokeWidth={2} fill={colors.sepia} />
              <Text style={{ fontFamily: fonts.ui, fontSize: 10, color: colors.sepia }}>
                {item.rating}
              </Text>
            </View>
          ) : null}
        </View>
        <PressableScale onPress={() => router.push(`/log/${item.id}` as any)} pressedScale={0.99}>
          {/* COMP-SPOILER-1: veil flagged critiques; keyed by id for the recycled list. */}
          <SpoilerVeil isSpoiler={item.is_spoiler} revealKey={item.id}>
            {item.pull_quote && (
              <View style={[s.pullQuoteWrap, item.role === 'auteur' && s.pullQuoteWrapAuteur, (item.role === 'archivist' || item.role === 'auteur') && item.role !== 'auteur' && s.pullQuoteWrapPremium]}>
                <Text style={[s.pullQuote, item.role === 'auteur' && s.pullQuoteAuteur, (item.role === 'archivist' || item.role === 'auteur') && item.role !== 'auteur' && s.pullQuotePremium]}>
                  « {item.pull_quote} »
                </Text>
              </View>
            )}
            {strippedReview ? (
              <Text style={[s.reviewText, item.drop_cap && { lineHeight: undefined }]} numberOfLines={12} ellipsizeMode="tail">
                {item.drop_cap ? (
                  <Text style={s.dropCapLetter}>{strippedReview.charAt(0)}</Text>
                ) : null}
                <Text style={item.drop_cap ? { lineHeight: 22 } : undefined}>
                  {item.drop_cap ? strippedReview.slice(1) : strippedReview}
                </Text>
              </Text>
            ) : null}
            {strippedReview.length > 400 && (
              <Text style={s.yourLogReadMore}>READ FULL CRITIQUE →</Text>
            )}
          </SpoilerVeil>
        </PressableScale>
      </View>
    );
  };

  return (
    <View style={s.container}>
      <Stack.Screen options={{ headerShown: false }} />
      
      {/* Header */}
      <View style={[s.header, { paddingTop: Math.max(insets.top + 10, 60) }]}>
        <PressableScale onPress={() => router.back()} style={s.backBtn} hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }} haptic="light">
          <ArrowLeft size={16} color={colors.sepia} strokeWidth={1.5} />
        </PressableScale>
        <View style={s.headerTextWrap}>
          <Text style={s.headerEyebrow}>SOCIETY LOGS</Text>
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
          data={reviews}
          keyExtractor={item => item.id}
          renderItem={renderReview}
          onEndReached={() => fetchReviews(true)}
          onEndReachedThreshold={0.5}
          contentContainerStyle={[s.listContent, { paddingBottom: Math.max(insets.bottom + 20, 100) }]}
          showsVerticalScrollIndicator={false}
          estimatedItemSize={180}
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
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: 'rgba(139,105,20,0.15)'
  },
  backBtn: { width: 40, height: 40, justifyContent: 'center', alignItems: 'flex-start' },
  headerTextWrap: { flex: 1 },
  headerEyebrow: { fontFamily:fonts.ui, fontSize: 8, letterSpacing: 2, color: colors.sepia, marginBottom: 2 },
  headerTitle: { fontFamily:fonts.display, fontSize: 18, color: colors.parchment },
  centerBox: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  listContent: { padding: 20, paddingBottom: 100 },

  reviewCard: {
    backgroundColor: colors.soot, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.ash,
    borderRadius: 4, padding: 16, marginBottom: 12,
    borderLeftWidth: 2, borderLeftColor: 'rgba(196,150,26,0.3)',
    position: 'relative', overflow: 'hidden',
  },
  reviewHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 },
  reviewQuote: {
    position: 'absolute', top: -4, left: 10, fontSize: 60,
    fontFamily: fonts.display, color: colors.sepia, opacity: 0.25,
  },
  reviewAuthor: { fontFamily: fonts.ui, fontSize: 10, letterSpacing: 1, color: colors.sepia },
  reviewTier: { fontFamily: fonts.ui, fontSize: 8, letterSpacing: 0.8, color: colors.fog, marginTop: 2 },
  reviewText: { fontFamily: fonts.bodyItalic, fontSize: 13, color: colors.bone, lineHeight: 20, opacity: 0.9 },
  yourLogReadMore: { fontFamily: fonts.ui, fontSize: 8, letterSpacing: 1, color: colors.sepia, marginTop: 4 },
  
  pullQuoteWrap: { marginTop: 6, marginBottom: 8, paddingLeft: 12, borderLeftWidth: 2, borderLeftColor: 'rgba(139,105,20,0.4)', paddingVertical: 2 },
  pullQuoteWrapAuteur: { borderLeftColor: colors.bloodReel, backgroundColor: 'rgba(125,31,31,0.05)', paddingVertical: 6, borderRadius: 2 },
  pullQuoteWrapPremium: { borderLeftColor: colors.sepia, backgroundColor: 'rgba(139,105,20,0.05)', paddingVertical: 6, borderRadius: 2 },
  pullQuote: { fontFamily: fonts.display, fontSize: 15, color: colors.sepia, lineHeight: 22 },
  pullQuoteAuteur: { color: colors.bloodReel },
  pullQuotePremium: { color: colors.sepia },
  dropCapLetter: { fontFamily: fonts.display, fontSize: 42, color: colors.sepia, marginRight: 6, marginTop: -4, lineHeight: 42 },

  emptyBox: { padding: 40, alignItems: 'center' },
  emptyTitle: { fontFamily: fonts.display, fontSize: 16, color: colors.sepia },
});
