/**
 * THE DISPATCH — "The Gazette of 1924"
 * A journal of cinema — for those who see in the dark.
 */
import { useEffect, useCallback, useState, useRef, useMemo } from 'react';
import { View, Text, RefreshControl, ActivityIndicator, StyleSheet } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { Pen, Radio, Sparkles, FileText } from 'lucide-react-native';

import { useAuthStore } from '@/src/stores/auth';
import { useDispatchStore, Dossier } from '@/src/stores/content';
import { tmdb } from '@/src/lib/tmdb';
import { colors } from '@/src/theme/theme';
import reelToast from '@/src/utils/reelToast';
import Buster from '@/src/components/Buster';
import PressableScale from '@/src/components/PressableScale';
import FrozenTab from '@/src/components/layout/FrozenTab';

// Decomposed components
import { DispatchFilm, WireStory } from '@/src/components/dispatch/types';
import { volumeNumber } from '@/src/components/dispatch/utils';
import { st } from '@/src/components/dispatch/styles';
import { OrnamentalDivider, SectionHeader } from '@/src/components/dispatch/DispatchShared';
import { NightlyTransmission } from '@/src/components/dispatch/NightlyTransmission';
import { DailyFrame } from '@/src/components/dispatch/DailyFrame';
import { DossierCard, WireItem } from '@/src/components/dispatch/DispatchCards';
import { ArticleReaderModal } from '@/src/components/dispatch/ArticleReaderModal';

export default function DispatchScreen() {
  const insets = useSafeAreaInsets();
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const isAuthenticated = useAuthStore(s => s.isAuthenticated);
  const user = useAuthStore(s => s.user);
  const dossiers = useDispatchStore(s => s.dossiers);
  const loading = useDispatchStore(s => s.loading);
  const fetchDossiers = useDispatchStore(s => s.fetchDossiers);
  const router = useRouter();

  const NAV_HEIGHT = 44 + 12;
  const topPad = insets.top + NAV_HEIGHT + 8;

  const canWrite = user?.role === 'auteur';

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

  const isFirstNewsRef = useRef(true);

  const loadData = useCallback(async () => {
    try {
      const [trendRes] = await Promise.all([
        tmdb.trending('week'),
        fetchDossiers(),
      ]);
      setTrending((trendRes?.results ?? []).slice(0, 12));
    } catch {
      reelToast.error('The nightly transmission could not be decoded.');
    }

    // News — SWR pattern: only show loading skeleton on first load
    if (isFirstNewsRef.current) setNewsLoading(true);
    try {
      const items = await tmdb.getNews();
      setNews((items ?? []).map((item: any) => ({ ...item, id: item.id ?? item.link ?? Math.random().toString(), link: item.link ?? '' })).slice(0, 8));
    } catch {
      if (isFirstNewsRef.current) reelToast.error('The wire signals were disrupted.');
    }
    if (isFirstNewsRef.current) {
      setNewsLoading(false);
      isFirstNewsRef.current = false;
    }
  }, [fetchDossiers]);

  useEffect(() => {
    loadData();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    await loadData();
    setRefreshing(false);
  }, [loadData]);

  const todayStr = new Date().toLocaleDateString('en-US', {
    month: 'long', day: '2-digit', year: 'numeric',
  }).toUpperCase();

  // S3-01 AUDIT FIX: Stable renderItem reference — prevents FlashList cell re-creation on parent re-renders
  const renderDossierItem = useCallback(({ item, index }: { item: Dossier; index: number }) => (
    <View style={st.documentItem}>
      <DossierCard dossier={item} index={index} onPress={handleArticlePress} />
    </View>
  ), [handleArticlePress]);

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
        colors={['rgba(139,105,20,0.06)', 'transparent']}
        style={st.ambientGlow}
      />

      <FlashList
        data={dossiers}
        keyExtractor={(item) => item.id}
        estimatedItemSize={200}
        contentContainerStyle={[st.scrollContent, { paddingTop: topPad }]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.sepia}
            progressViewOffset={topPad}
          />
        }
        onEndReached={() => useDispatchStore.getState().loadMoreDossiers()}
        onEndReachedThreshold={0.5}
        ListHeaderComponent={
          <View style={st.documentHeader}>
            {/* ── MASTHEAD ── */}
            <Animated.View entering={FadeIn.duration(800)} style={st.masthead}>
              <View style={st.mastheadPublisherRow}>
                <Sparkles size={7} color={colors.sepia} strokeWidth={2} />
                <Text style={st.mastheadPublisher}>THE REELHOUSE SOCIETY</Text>
                <Sparkles size={7} color={colors.sepia} strokeWidth={2} />
              </View>

              {/* Double rule top */}
              <View style={st.mastheadRuleTop} />

              <Text style={st.mastheadTitle} accessibilityRole="header" numberOfLines={2}>THE{'\n'}DISPATCH</Text>

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

            <OrnamentalDivider />

            {/* ── AUTEUR DOSSIERS ── */}
            <Animated.View entering={FadeInDown.duration(600).delay(300)}>
              <SectionHeader
                title="Auteur Dossiers"
                sub="Original cinematic essays filed by our premium members."
              />

              {canWrite && (
                <View style={st.writerBarWrap}>
                  <PressableScale
                    style={st.writerBarBtn}
                    onPress={() => router.push('/dispatch/compose' as any)}
                    haptic
                  >
                    <View style={st.writerBarBtnInner}>
                      <Pen size={10} color={colors.parchment} strokeWidth={1.5} />
                      <Text style={st.writerBarBtnText} numberOfLines={1}>FILE NEW DOSSIER</Text>
                    </View>
                  </PressableScale>
                </View>
              )}

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
        }
        renderItem={renderDossierItem}
        ListEmptyComponent={
          !loading ? (
            <View style={st.emptyState}>
              <FileText size={28} color={colors.sepia} strokeWidth={1} />
              <Text style={st.emptyTitle}>The press room awaits its first dossier.</Text>
              <Text style={st.emptySub}>
                Auteur members can file original essays and cinematic critiques.
              </Text>
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

            {/* ── NIGHTLY TRANSMISSION ── */}
            <Animated.View entering={FadeInDown.duration(600).delay(400)}>
              <NightlyTransmission films={trending} />
            </Animated.View>

            <OrnamentalDivider />

            {/* ── DAILY FRAME ── */}
            <Animated.View entering={FadeInDown.duration(600).delay(500)}>
              <DailyFrame films={trending} />
            </Animated.View>

            <OrnamentalDivider />

            {/* ── THE GLOBAL WIRE ── */}
            <Animated.View entering={FadeInDown.duration(600).delay(600)}>
              <SectionHeader
                title="The Global Wire"
                sub="Decoded signals from the worldwide cinema industry."
              />

              {newsLoading ? (
                <Text style={st.wireLoader}>Decrypting incoming signals...</Text>
              ) : (
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
              )}

              {!newsLoading && news.length === 0 && (
                <View style={st.emptyState}>
                  <Radio size={28} color={colors.sepia} strokeWidth={1} />
                  <Text style={st.emptyTitle}>The wire is silent tonight.</Text>
                  <Text style={st.emptySub}>No decoded signals from the worldwide cinema industry.</Text>
                </View>
              )}
            </Animated.View>

            {/* ── BUSTER'S EDITOR NOTE ── */}
            <Animated.View entering={FadeInDown.duration(600).delay(700)} style={st.busterNote}>
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
