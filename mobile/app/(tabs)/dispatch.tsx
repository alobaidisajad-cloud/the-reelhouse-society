/**
 * THE DISPATCH — "The Gazette of 1924"
 * A journal of cinema — for those who see in the dark.
 */
import { globalScrollY } from '@/src/lib/scrollBridge';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, RefreshControl, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn, FadeInDown, useAnimatedScrollHandler, useSharedValue, withTiming } from 'react-native-reanimated';

import { CinematicFlashList } from '@/src/components/layout/CinematicFlashList';
import TactileEngine from '@/src/utils/TactileEngine';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect, useRouter } from 'expo-router';
import { FileText, Pen, Radio } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import Buster from '@/src/components/Buster';
import PressableScale from '@/src/components/PressableScale';
import FrozenTab from '@/src/components/layout/FrozenTab';
import { tmdb } from '@/src/lib/tmdb';
import { getNews } from '@/src/services/NewsService';
import { useAuthStore } from '@/src/stores/auth';
import { Dossier, useDispatchStore } from '@/src/stores/content';
import { colors } from '@/src/theme/theme';
import reelToast from '@/src/utils/reelToast';
import { isAuteurPlusTier } from '@/src/utils/tier';
// Import deleted since it's replaced by CinematicFlashList above

// Decomposed components
import { ArticleReaderModal } from '@/src/components/dispatch/ArticleReaderModal';
import { DossierCard, WireItem } from '@/src/components/dispatch/DispatchCards';
import { OrnamentalDivider, SectionHeader } from '@/src/components/dispatch/DispatchShared';
import { NightlyTransmission } from '@/src/components/dispatch/NightlyTransmission';
import { st } from '@/src/components/dispatch/styles';
import { DispatchFilm, WireStory } from '@/src/components/dispatch/types';
import { volumeNumber } from '@/src/components/dispatch/utils';

export default function DispatchScreen() {
  const insets = useSafeAreaInsets();

  const scrollY = useSharedValue(0);
  const scrollHeight = useSharedValue(0);
  const viewHeight = useSharedValue(0);
  const isScrolling = useSharedValue(false);

  useFocusEffect(
    useCallback(() => {
      globalScrollY.value = withTiming(scrollY.value, { duration: 250 });
    }, [scrollY])
  );

  const onScroll = useAnimatedScrollHandler({
    onScroll: (event) => {
      scrollY.value = event.contentOffset.y;
      globalScrollY.value = event.contentOffset.y;
      scrollHeight.value = event.contentSize.height;
      viewHeight.value = event.layoutMeasurement.height;
    },
    onBeginDrag: () => {
      isScrolling.value = true;
    },
    onEndDrag: (event) => {
      isScrolling.value = false;
    },
    onMomentumBegin: () => {
      isScrolling.value = true;
    },
    onMomentumEnd: () => {
      isScrolling.value = false;
    }
  });
   
  const user = useAuthStore(s => s.user);
  const dossiers = useDispatchStore(s => s.dossiers);
  const loading = useDispatchStore(s => s.loading);
  const fetchDossiers = useDispatchStore(s => s.fetchDossiers);
  const router = useRouter();

  const NAV_HEIGHT = 44 + 12;
  const topPad = insets.top + NAV_HEIGHT + 8;

  const canWrite = isAuteurPlusTier(user);

  const [trending, setTrending] = useState<DispatchFilm[]>([]);
  const [news, setNews] = useState<WireStory[]>([]);
  const [newsLoading, setNewsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedArticle, setSelectedArticle] = useState<Dossier | WireStory | null>(null);

  const handleArticlePress = useCallback((article: Dossier | WireStory) => {
    setSelectedArticle(article);
  }, []);

  const closeArticle = useCallback(() => {
    setSelectedArticle(null);
  }, []);

  const isMounted = useRef(true);
  useEffect(() => {
    isMounted.current = true;
    return () => { isMounted.current = false; };
  }, []);

  const isFirstNewsRef = useRef(true);

  const loadData = useCallback(async (isUserAction = false) => {
    // 1. News — Concurrent SWR pattern
    if (isFirstNewsRef.current) setNewsLoading(true);
    const newsPromise = getNews()
      .then((items: any) => {
        if (!isMounted.current) return;
        setNews((items ?? []).map((item: any, index: number) => ({ ...item, id: item.id ?? item.link ?? `wire-fallback-${index}`, link: item.link ?? '' })).slice(0, 8));
      })
      .catch(() => {
        if ((isFirstNewsRef.current || isUserAction) && isMounted.current) {
          reelToast.error('The wire signals were disrupted.');
        }
      })
      .finally(() => {
        if (isFirstNewsRef.current && isMounted.current) {
          setNewsLoading(false);
          isFirstNewsRef.current = false;
        }
      });

    // 2. Trending — Concurrent decoupled pipeline
    const trendPromise = tmdb.trending('week')
      .then((trendRes) => {
        if (isMounted.current) {
          setTrending((trendRes?.results ?? []).slice(0, 12));
        }
      })
      .catch(() => {
        // Fallback silently if trending fails
      });

    // 3. Dossiers — Concurrent decoupled pipeline
    const dossierPromise = fetchDossiers()
      .catch(() => {
        if ((isFirstNewsRef.current || isUserAction) && isMounted.current) {
          reelToast.error('The nightly transmission could not be decoded.');
        }
      });

    // Barrier: await all decoupled pipelines concurrently
    await Promise.all([trendPromise, dossierPromise, newsPromise]);
  }, [fetchDossiers]);

  useEffect(() => {
    loadData();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    TactileEngine.navigate();
    await loadData(true);
    setRefreshing(false);
  }, [loadData]);

  const todayStr = new Date().toLocaleDateString('en-US', {
    month: 'long', day: '2-digit', year: 'numeric',
  }).toUpperCase();

  // Stable renderItem reference — prevents FlashList cell re-creation on parent re-renders
  const renderDossierItem = useCallback(({ item, index }: { item: Dossier; index: number }) => (
    <View style={st.documentItem}>
      <DossierCard dossier={item} index={index} onPress={handleArticlePress} />
    </View>
  ), [handleArticlePress]);

  const listHeader = useMemo(() => (
    <View style={st.documentHeader}>
      {/* ── MASTHEAD ── */}
      <Animated.View entering={FadeIn.duration(800)} style={st.masthead}>
        {/* Double rule top */}
        <View style={st.mastheadRuleTop} />

        <Text style={st.mastheadTitle} accessibilityRole="header" numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.7}>THE{'\n'}DISPATCH</Text>

        {/* Double rule bottom */}
        <View style={st.mastheadRuleBottom} />

        {/* Meta line: VOL · EST · DATE */}
        <View style={st.mastheadMetaRow}>
          <Text style={st.mastheadMetaText} numberOfLines={1}>VOL. {volumeNumber()}</Text>
          <View style={st.pulseDot} />
          <Text style={st.mastheadMetaText} numberOfLines={1}>EST. 1924</Text>
          <View style={st.pulseDot} />
          <Text style={st.mastheadMetaText} numberOfLines={1}>{todayStr}</Text>
        </View>

        <Text style={st.mastheadSubtitle}>
          A journal of cinema — for those who see in the dark.
        </Text>
      </Animated.View>

      {/* Writer's entry — surfaced under the masthead so auteurs can file a
          dossier without scrolling past the whole gazette (was buried in the
          Auteur Dossiers section at the very bottom of the list). */}
      {canWrite && (
        <View style={st.writerBarWrap}>
          <PressableScale
            style={st.writerBarBtn}
            onPress={() => (router.push as any)('/dispatch/compose' as any)}
            haptic
          >
            <View style={st.writerBarBtnInner}>
              <Pen size={10} color={colors.parchment} strokeWidth={1.5} />
              <Text style={st.writerBarBtnText} numberOfLines={1}>FILE NEW DOSSIER</Text>
            </View>
          </PressableScale>
        </View>
      )}

      <OrnamentalDivider />

      {/* ── THE FRONT PAGE (nightly transmission hero) ── */}
      <Animated.View entering={FadeInDown.duration(600).delay(200)}>
        <NightlyTransmission films={trending} />
      </Animated.View>

      <OrnamentalDivider />

      {/* ── THE GLOBAL WIRE ── */}
      <Animated.View entering={FadeInDown.duration(600).delay(400)}>
        <SectionHeader
          title="The Global Wire"
          sub="Decoded signals from the worldwide cinema industry."
        />

        {newsLoading ? (
          <Text style={st.wireLoader}>Decrypting incoming signals...</Text>
        ) : news.length > 0 ? (
          <View style={st.wireList}>
            {news[0] && (
              <WireItem
                item={news[0]}
                isLead
                onPress={handleArticlePress}
              />
            )}
            {news.slice(1).map((item) => (
              <WireItem
                key={item.id}
                item={item}
                onPress={handleArticlePress}
              />
            ))}
          </View>
        ) : null}

        {!newsLoading && news.length === 0 && (
          <View style={st.emptyState}>
            <Radio size={28} color={colors.sepia} strokeWidth={1} />
            <Text style={st.emptyTitle}>The wire is silent tonight.</Text>
            <Text style={st.emptySub}>No decoded signals from the worldwide cinema industry.</Text>
          </View>
        )}
      </Animated.View>

      <OrnamentalDivider />

      {/* ── AUTEUR DOSSIERS ── */}
      <Animated.View entering={FadeInDown.duration(600).delay(500)}>
        <SectionHeader
          title="Auteur Dossiers"
          sub="Original cinematic essays filed by our premium members."
        />

        {loading && dossiers.length === 0 && (
          /* Skeleton shimmer */
          <View style={st.skeletonGroup}>
            {Array.from({ length: 3 }).map((_, i) => (
              <View key={i} style={st.skeleton}>
                <View style={[st.shimmer, st.shimmerSm]} />
                <View style={[st.shimmer, st.shimmerLg]} />
                <View style={[st.shimmer, st.shimmerMd]} />
              </View>
            ))}
          </View>
        )}
      </Animated.View>
    </View>
  ), [trending, news, newsLoading, handleArticlePress, canWrite, router, loading, dossiers.length, todayStr]);

  return (
    <FrozenTab>
    <View style={st.container}>
      <LinearGradient
        colors={[colors.ink, 'rgba(10,7,3,0.98)', colors.soot]}
        locations={[0, 0.4, 1]}
        style={StyleSheet.absoluteFillObject}
      />

      {/* Ambient warm glow at top */}
      <LinearGradient
        colors={['rgba(184,137,26,0.06)', 'transparent']}
        style={st.ambientGlow}
      />

      <CinematicFlashList
        data={dossiers}
        keyExtractor={(item: any) => item.id}
        estimatedItemSize={200}
        contentContainerStyle={[st.scrollContent, { paddingTop: topPad }]}
        scrollMetrics={{ scrollY, scrollHeight, viewHeight, isScrolling }}
        onScroll={onScroll}
        topInset={topPad}
        bottomInset={insets.bottom + 49}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.sepia}
            colors={[colors.sepia]}
            progressBackgroundColor={colors.ink}
            progressViewOffset={topPad}
          />
        }
        onEndReached={() => useDispatchStore.getState().loadMoreDossiers()}
        onEndReachedThreshold={0.5}
        ListHeaderComponent={listHeader}
        renderItem={renderDossierItem as any}
        ListEmptyComponent={
          !loading ? (
            /* Wrapped in the document frame so the gazette's side-rails never break. */
            <View style={st.documentEmptyWrap}>
              <View style={st.emptyState}>
                <FileText size={28} color={colors.sepia} strokeWidth={1} />
                <Text style={st.emptyTitle}>The press room awaits its first dossier.</Text>
                <Text style={st.emptySub}>
                  Auteur members can file original essays and cinematic critiques.
                </Text>
              </View>
            </View>
          ) : null
        }
        ListFooterComponent={
          <View style={st.documentFooter}>
            <Animated.View entering={FadeInDown.duration(600).delay(300)}>
              {loading && dossiers.length > 0 && (
                <ActivityIndicator size="small" color={colors.sepia} style={{ padding: 20 }} />
              )}
            </Animated.View>

            <OrnamentalDivider />

            {/* ── BUSTER'S EDITOR NOTE ── */}
            <Animated.View entering={FadeInDown.duration(600).delay(400)} style={st.busterNote}>
              <View style={st.busterRuleTop} />
              <View style={st.busterContent}>
                <View style={st.busterAvatar}>
                  <Buster size={60} mood="peeking" />
                </View>
                <View style={st.busterTextWrap}>
                  <Text style={st.busterLabel}>FROM THE EDITOR{"'"}S DESK</Text>
                  <Text style={st.busterQuote}>
                    {"\"I know you're looking for the romantic comedies, but I hid them. We are only projecting German Expressionism tonight until morale improves.\""}
                  </Text>
                </View>
              </View>
            </Animated.View>

            {/* ── FOOTER ── */}
            <View style={st.footer}>
              <OrnamentalDivider />
              <Text style={st.footerMark}>END OF TRANSMISSION</Text>
              <Text style={st.footerHeritage}>EST. 1924 — PRINTED FROM THE PROJECTION BOOTH</Text>
              <Text style={st.footerCopyright}>© 1924–2026 The ReelHouse Society. All dispatches are classified.</Text>
            </View>
            <View style={st.tabBarSpacer} />
          </View>
        }
      />

      {/* ── ARTICLE READER MODAL ── */}
      <ArticleReaderModal
        article={selectedArticle}
        visible={!!selectedArticle}
        onClose={closeArticle}
      />
    </View>
    </FrozenTab>
  );
}

// Expo Router per-route crash net — see src/components/RouteErrorBoundary.tsx
export { RouteErrorBoundary as ErrorBoundary } from '@/src/components/RouteErrorBoundary';
