import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { supabase } from '../../src/lib/supabase';
import { colors, fonts } from '../../src/theme/theme';
import { ArrowLeft, Star } from 'lucide-react-native';
import PressableScale from '@/src/components/PressableScale';

type CommunityReview = {
  id: string;
  rating: number;
  review: string;
  created_at: string;
  username: string;
  role: string;
};

const PAGE_SIZE = 20;

export default function FilmReviewsScreen() {
  const { id: filmId, title } = useLocalSearchParams<{ id: string; title?: string }>();
  const router = useRouter();

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
      .select('id, rating, review, created_at, user_id, profiles!logs_user_id_fkey(username, role)')
      .eq('film_id', filmId)
      .not('review', 'is', null)
      .order('created_at', { ascending: false })
      .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

    if (data) {
      const mapped = data.map((r: Record<string, unknown>) => {
        const profiles = r.profiles as Record<string, unknown> | Record<string, unknown>[] | null;
        const profile = Array.isArray(profiles) ? profiles[0] : profiles;
        return {
          id: r.id as string,
          rating: r.rating as number,
          review: r.review as string,
          created_at: r.created_at as string,
          username: (profile?.username as string) ?? 'anonymous',
          role: (profile?.role as string) ?? 'cinephile',
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
  }, []);

  const renderReview = ({ item }: { item: CommunityReview }) => {
    const tierLabel = item.role === 'auteur' ? 'Auteur' : item.role === 'archivist' ? 'Archivist' : 'Cinephile';
    const strippedReview = (item.review ?? '').replace(/<[^>]+>/g, '').trim();

    return (
      <View style={s.reviewCard}>
        <Text style={s.reviewQuote}>"</Text>
        <View style={s.reviewHeader}>
          <View>
            <PressableScale onPress={() => router.push(`/user/${item.username}`)} pressedScale={0.97} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Text style={s.reviewAuthor}>@{item.username ?? 'anonymous'}</Text>
            </PressableScale>
            <Text style={s.reviewTier}>{tierLabel}</Text>
          </View>
          {item.rating > 0 && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
              <Star size={10} color={colors.sepia} strokeWidth={2} fill={colors.sepia} />
              <Text style={{ fontFamily: fonts.ui, fontSize: 10, color: colors.sepia }}>
                {item.rating}
              </Text>
            </View>
          )}
        </View>
        <PressableScale onPress={() => router.push(`/log/${item.id}`)} pressedScale={0.99}>
          <Text style={s.reviewText} numberOfLines={12} ellipsizeMode="tail">{strippedReview}</Text>
          {strippedReview.length > 400 && (
            <Text style={s.yourLogReadMore}>READ FULL CRITIQUE →</Text>
          )}
        </PressableScale>
      </View>
    );
  };

  return (
    <View style={s.container}>
      <Stack.Screen options={{ headerShown: false }} />
      
      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} activeOpacity={0.7} style={s.backBtn} hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }}>
          <ArrowLeft size={16} color={colors.sepia} strokeWidth={1.5} />
        </TouchableOpacity>
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
        <FlatList
          data={reviews}
          keyExtractor={item => item.id}
          renderItem={renderReview}
          onEndReached={() => fetchReviews(true)}
          onEndReachedThreshold={0.5}
          contentContainerStyle={s.listContent}
          showsVerticalScrollIndicator={false}
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
    paddingTop: 60, paddingBottom: 16, paddingHorizontal: 20,
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
  
  emptyBox: { padding: 40, alignItems: 'center' },
  emptyTitle: { fontFamily: fonts.display, fontSize: 16, color: colors.sepia },
});
