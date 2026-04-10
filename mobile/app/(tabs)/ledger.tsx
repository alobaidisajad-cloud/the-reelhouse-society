import { useEffect, useState, useCallback } from 'react';
import { View, Text, StyleSheet, FlatList, Image, TouchableOpacity, ScrollView, RefreshControl } from 'react-native';
import Animated, { FadeInDown, FadeInUp } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { useAuthStore } from '@/src/stores/auth';
import { useFilmStore } from '@/src/stores/films';
import { useRouter } from 'expo-router';
import { colors, fonts } from '@/src/theme/theme';
import { SectionDivider, ReelRating } from '@/src/components/Decorative';

const TMDB_IMG = 'https://image.tmdb.org/t/p/w185';
const AnimatedView = Animated.createAnimatedComponent(View);

type TabName = 'logs' | 'watchlist' | 'vault' | 'lists';

export default function StacksScreen() {
  const { isAuthenticated, user } = useAuthStore();
  const { logs, watchlist, vault, lists, fetchLogs, fetchWatchlist, fetchVault, fetchLists } = useFilmStore();
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<TabName>('logs');

  useEffect(() => {
    if (isAuthenticated) {
      fetchLogs(); fetchWatchlist(); fetchVault(); fetchLists();
    }
  }, [isAuthenticated]);

  if (!isAuthenticated) {
    return (
      <View style={s.container}>
        <View style={s.center}>
          <Text style={s.lockedIcon}>▤</Text>
          <Text style={s.lockedText}>Sign in to access your Stacks</Text>
          <TouchableOpacity style={s.ctaBtn} onPress={() => router.push('/login')}>
            <Text style={s.ctaText}>✦ ENTER THE HOUSE</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  const tabs: { key: TabName; label: string; count: number }[] = [
    { key: 'logs', label: 'LEDGER', count: logs.length },
    { key: 'watchlist', label: 'WATCHLIST', count: watchlist.length },
    { key: 'vault', label: 'VAULT', count: vault.length },
    { key: 'lists', label: 'LISTS', count: lists.length },
  ];

  const onRefresh = () => { fetchLogs(); fetchWatchlist(); fetchVault(); fetchLists(); };

  return (
    <View style={s.container}>
      {/* Header */}
      <AnimatedView entering={FadeInDown.duration(600)} style={s.header}>
        <Text style={s.eyebrow}>YOUR PRIVATE ARCHIVE</Text>
        <Text style={s.title}>The Stacks</Text>
      </AnimatedView>

      {/* Stats Bar */}
      <AnimatedView entering={FadeInDown.duration(600).delay(100)} style={s.statsBar}>
        {tabs.map((t) => (
          <TouchableOpacity key={t.key} style={[s.statItem, activeTab === t.key && s.statActive]} onPress={() => setActiveTab(t.key)}>
            <Text style={[s.statNum, activeTab === t.key && s.statNumActive]}>{t.count}</Text>
            <Text style={[s.statLabel, activeTab === t.key && s.statLabelActive]}>{t.label}</Text>
          </TouchableOpacity>
        ))}
      </AnimatedView>

      <SectionDivider />

      {/* Content based on active tab */}
      {activeTab === 'logs' && (
        <FlatList
          data={logs}
          keyExtractor={(item) => item.id}
          contentContainerStyle={s.listContent}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={false} onRefresh={onRefresh} tintColor={colors.sepia} />}
          renderItem={({ item, index }) => {
            const posterUri = item.poster ? `${TMDB_IMG}${item.poster}` : null;
            return (
              <AnimatedView entering={FadeInUp.duration(350).delay(Math.min(index * 40, 300))}>
                <TouchableOpacity
                  style={s.logRow}
                  onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); router.push(`/film/${item.filmId}`); }}
                  activeOpacity={0.7}
                >
                  {posterUri ? <Image source={{ uri: posterUri }} style={s.logPoster} /> : <View style={[s.logPoster, s.noPoster]} />}
                  <View style={s.logInfo}>
                    <Text style={s.logTitle} numberOfLines={1}>{item.title}</Text>
                    <Text style={s.logMeta}>{item.year || ''}</Text>
                    {item.rating > 0 && <ReelRating rating={item.rating} size={11} />}
                  </View>
                  <Text style={s.logStatus}>{(item.status || 'watched').toUpperCase()}</Text>
                </TouchableOpacity>
              </AnimatedView>
            );
          }}
          ListEmptyComponent={<Text style={s.emptyText}>No films logged yet.</Text>}
        />
      )}

      {activeTab === 'watchlist' && (
        <FlatList
          data={watchlist}
          keyExtractor={(item) => String(item.id)}
          numColumns={3}
          contentContainerStyle={s.gridContent}
          showsVerticalScrollIndicator={false}
          renderItem={({ item, index }) => {
            const posterUri = item.poster_path ? `${TMDB_IMG}${item.poster_path}` : null;
            return (
              <AnimatedView entering={FadeInUp.duration(300).delay(Math.min(index * 30, 250))} style={s.gridItem}>
                <TouchableOpacity onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); router.push(`/film/${item.id}`); }} activeOpacity={0.7}>
                  {posterUri ? <Image source={{ uri: posterUri }} style={s.gridPoster} /> : <View style={[s.gridPoster, s.noPoster]}><Text style={s.noPosterText}>?</Text></View>}
                  <Text style={s.gridTitle} numberOfLines={1}>{item.title}</Text>
                </TouchableOpacity>
              </AnimatedView>
            );
          }}
          ListEmptyComponent={<Text style={s.emptyText}>Your watchlist is empty.</Text>}
        />
      )}

      {activeTab === 'vault' && (
        <FlatList
          data={vault}
          keyExtractor={(item) => String(item.id)}
          numColumns={3}
          contentContainerStyle={s.gridContent}
          showsVerticalScrollIndicator={false}
          renderItem={({ item, index }) => {
            const posterUri = item.poster_path ? `${TMDB_IMG}${item.poster_path}` : null;
            return (
              <AnimatedView entering={FadeInUp.duration(300).delay(Math.min(index * 30, 250))} style={s.gridItem}>
                <TouchableOpacity onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); router.push(`/film/${item.id}`); }} activeOpacity={0.7}>
                  {posterUri ? <Image source={{ uri: posterUri }} style={s.gridPoster} /> : <View style={[s.gridPoster, s.noPoster]}><Text style={s.noPosterText}>?</Text></View>}
                  <Text style={s.gridTitle} numberOfLines={1}>{item.title}</Text>
                  <Text style={s.gridFormat}>{item.format}</Text>
                </TouchableOpacity>
              </AnimatedView>
            );
          }}
          ListEmptyComponent={<Text style={s.emptyText}>Your vault is empty.</Text>}
        />
      )}

      {activeTab === 'lists' && (
        <FlatList
          data={lists}
          keyExtractor={(item) => item.id}
          contentContainerStyle={s.listContent}
          showsVerticalScrollIndicator={false}
          renderItem={({ item, index }) => (
            <AnimatedView entering={FadeInUp.duration(350).delay(Math.min(index * 50, 300))} style={s.listCard}>
              <Text style={s.listTitle}>{item.title}</Text>
              <Text style={s.listMeta}>{item.films?.length || 0} films{item.description ? ` · ${item.description}` : ''}</Text>
              {item.films && item.films.length > 0 && (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.listPosters}>
                  {item.films.slice(0, 6).map((f, i) => {
                    const uri = f.poster_path ? `${TMDB_IMG}${f.poster_path}` : null;
                    return uri ? <Image key={i} source={{ uri }} style={s.listPosterThumb} /> : null;
                  })}
                </ScrollView>
              )}
            </AnimatedView>
          )}
          ListEmptyComponent={<Text style={s.emptyText}>No lists created yet.</Text>}
        />
      )}
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.ink },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 32 },
  header: { paddingTop: 60, paddingHorizontal: 16, marginBottom: 16 },
  eyebrow: { fontFamily: fonts.sub, fontSize: 10, letterSpacing: 4, color: colors.sepia, marginBottom: 6 },
  title: { fontFamily: fonts.display, fontSize: 26, color: colors.parchment },

  // Stats Tab Bar
  // Web: statsBar borderRadius 2px matching --radius-card
  statsBar: { flexDirection: 'row', marginHorizontal: 16, backgroundColor: colors.soot, borderRadius: 2, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.ash },
  statItem: { flex: 1, alignItems: 'center', paddingVertical: 14 },
  statActive: { borderBottomWidth: 2, borderBottomColor: colors.sepia },
  statNum: { fontFamily: fonts.display, fontSize: 20, color: colors.fog, marginBottom: 2 },
  statNumActive: { color: colors.sepia },
  statLabel: { fontFamily: fonts.ui, fontSize: 7, letterSpacing: 1.5, color: colors.fog },
  statLabelActive: { color: colors.bone },

  listContent: { paddingHorizontal: 16, paddingBottom: 40 },
  gridContent: { paddingHorizontal: 12, paddingBottom: 40 },

  // Log Rows
  // Web: log row borderRadius 2px
  logRow: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: colors.soot, borderRadius: 2,
    marginBottom: 8, overflow: 'hidden', borderWidth: StyleSheet.hairlineWidth, borderColor: colors.ash,
  },
  logPoster: { width: 50, height: 75, backgroundColor: colors.ash },
  noPoster: { alignItems: 'center', justifyContent: 'center' },
  noPosterText: { fontFamily: fonts.display, color: colors.fog, fontSize: 14 },
  logInfo: { flex: 1, padding: 12 },
  logTitle: { fontFamily: fonts.sub, fontSize: 14, color: colors.parchment, marginBottom: 3 },
  logMeta: { fontFamily: fonts.body, fontSize: 11, color: colors.sepia },
  logStatus: { fontFamily: fonts.ui, fontSize: 7, letterSpacing: 2, color: colors.bloodReel, marginRight: 12 },

  // Poster Grid
  // Web: poster grid borderRadius 2px
  gridItem: { flex: 1 / 3, margin: 4, maxWidth: '31%' },
  gridPoster: { width: '100%', aspectRatio: 2 / 3, borderRadius: 2, backgroundColor: colors.ash },
  gridTitle: { fontFamily: fonts.body, fontSize: 10, color: colors.bone, marginTop: 4 },
  gridFormat: { fontFamily: fonts.ui, fontSize: 8, color: colors.fog, letterSpacing: 1 },

  // List Cards
  // Web: list card borderRadius 2px
  listCard: {
    backgroundColor: colors.soot, borderRadius: 2, padding: 16, marginBottom: 10,
    borderWidth: StyleSheet.hairlineWidth, borderColor: colors.ash,
  },
  listTitle: { fontFamily: fonts.sub, fontSize: 15, color: colors.parchment, marginBottom: 4 },
  listMeta: { fontFamily: fonts.body, fontSize: 11, color: colors.fog, marginBottom: 8 },
  listPosters: { flexDirection: 'row', marginTop: 4 },
  listPosterThumb: { width: 40, height: 60, borderRadius: 2, marginRight: 6, backgroundColor: colors.ash },

  // Locked
  lockedIcon: { fontSize: 48, color: colors.ash, marginBottom: 12 },
  lockedText: { fontFamily: fonts.body, color: colors.fog, fontSize: 13, marginBottom: 16 },
  ctaBtn: { backgroundColor: colors.sepia, borderRadius: 2, paddingVertical: 14, paddingHorizontal: 28 },
  ctaText: { fontFamily: fonts.uiMedium, fontSize: 11, letterSpacing: 2, color: colors.ink, fontWeight: '700' },
  emptyText: { fontFamily: fonts.body, color: colors.fog, fontSize: 13, fontStyle: 'italic', textAlign: 'center', marginTop: 40 },
});
