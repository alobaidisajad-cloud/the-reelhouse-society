/**
 * THE DISPATCH — "The Gazette of 1924"
 * A journal of cinema — for those who see in the dark.
 */
import { useEffect, useCallback, useState, memo } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, RefreshControl,
  Image, Platform, Dimensions, Modal, Linking, ActivityIndicator,
} from 'react-native';
import Animated, {
  FadeIn, FadeInDown,
  useSharedValue, useAnimatedStyle, withRepeat, withTiming, Easing,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import {
  Eye, Pen, Heart, Share2, ChevronRight, X as XIcon,
  Radio, Star, BookOpen, Sparkles, ExternalLink, FileText,
} from 'lucide-react-native';

import { useAuthStore } from '@/src/stores/auth';
import { useDispatchStore, Dossier } from '@/src/stores/content';
import { tmdb } from '@/src/lib/tmdb';
import { supabase } from '@/src/lib/supabase';
import { colors, fonts, effects } from '@/src/theme/theme';
import Buster from '@/src/components/Buster';

const TMDB_IMG_W780 = 'https://image.tmdb.org/t/p/w780';
const TMDB_IMG_W500 = 'https://image.tmdb.org/t/p/w500';
const { width: SCREEN_W } = Dimensions.get('window');

// ── Volume / Transmission number helpers ──
const EPOCH = new Date('2026-03-12T00:00:00Z').getTime();
const daysSinceEpoch = () => Math.floor(Date.now() / (24 * 60 * 60 * 1000));
const volumeNumber = () => String(Math.floor((Date.now() - EPOCH) / (7 * 24 * 60 * 60 * 1000)) + 1).padStart(3, '0');
const transmissionNum = () => String(Math.floor((Date.now() - EPOCH) / (24 * 60 * 60 * 1000)) + 1).padStart(3, '0');

// ════════════════════════════════════════════════════════════════
//  ORNAMENTAL DIVIDER — ──◇──
// ════════════════════════════════════════════════════════════════
function OrnamentalDivider() {
  return (
    <View style={st.dividerWrap}>
      <View style={st.dividerLine} />
      <View style={st.dividerDiamond} />
      <View style={st.dividerLine} />
    </View>
  );
}

// ════════════════════════════════════════════════════════════════
//  SECTION HEADER BLOCK
// ════════════════════════════════════════════════════════════════
function SectionHeader({ title, sub }: { title: string; sub: string }) {
  return (
    <View style={st.sectionHeaderBlock}>
      <Text style={st.shTitle}>{title}</Text>
      <Text style={st.shSub}>{sub}</Text>
    </View>
  );
}

// ════════════════════════════════════════════════════════════════
//  NIGHTLY TRANSMISSION — Dynamic trending film pick
// ════════════════════════════════════════════════════════════════
const NightlyTransmission = memo(function NightlyTransmission({ films }: { films: any[] }) {
  const router = useRouter();
  const day = daysSinceEpoch();
  const film = films.length > 0 ? films[day % films.length] : null;
  const txNum = transmissionNum();

  if (!film) return null;

  const backdropUri = film.backdrop_path ? `${TMDB_IMG_W780}${film.backdrop_path}` : null;

  return (
    <TouchableOpacity
      style={st.transmissionWrap}
      activeOpacity={0.85}
      onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); router.push(`/film/${film.id}`); }}
    >
      {/* Corner marks */}
      <View style={[st.corner, st.cornerTL]} />
      <View style={[st.corner, st.cornerTR]} />
      <View style={[st.corner, st.cornerBL]} />
      <View style={[st.corner, st.cornerBR]} />

      {/* Backdrop */}
      {backdropUri && (
        <Image source={{ uri: backdropUri }} style={st.transmissionBg} blurRadius={Platform.OS === 'ios' ? 2 : 4} />
      )}
      <View style={StyleSheet.absoluteFillObject}>
        <LinearGradient colors={['rgba(10,7,3,0.75)', 'rgba(10,7,3,0.9)']} style={StyleSheet.absoluteFillObject} />
      </View>

      <View style={st.transmissionContent}>
        <View style={st.transmissionSignalRow}>
          <Radio size={8} color={colors.bloodReel} strokeWidth={2} />
          <Text style={st.transmissionSignal}>TRANSMISSION INCOMING</Text>
        </View>
        <Text style={st.transmissionLabel}>TONIGHT'S SCREENING — TRANSMISSION №{txNum}</Text>

        <Text style={st.transmissionTitle} numberOfLines={2}>
          {(film.title || '').toUpperCase()}
        </Text>

        <View style={st.transmissionMetaRow}>
          <Text style={st.transmissionMeta}>
            {film.release_date?.slice(0, 4)} · {film.vote_average?.toFixed(1)}
          </Text>
          <Star size={9} color={colors.sepia} strokeWidth={2} fill={colors.sepia} />
        </View>

        <Text style={st.transmissionExcerpt} numberOfLines={3}>
          "{film.overview?.slice(0, 150)}..."
        </Text>

        <View style={st.transmissionFooter}>
          <View style={st.transmissionBullet}>
            <View style={[st.transmissionDot, { backgroundColor: colors.bloodReel }]} />
            <Text style={st.transmissionFooterText}>WATCH INDEPENDENTLY</Text>
          </View>
          <View style={st.transmissionBullet}>
            <View style={[st.transmissionDot, { backgroundColor: colors.sepia }]} />
            <Text style={st.transmissionFooterText}>JOIN AT TRANSMISSION TIME</Text>
          </View>
        </View>
      </View>
    </TouchableOpacity>
  );
});

// ════════════════════════════════════════════════════════════════
//  DAILY FRAME — A cinematic still that changes every day
// ════════════════════════════════════════════════════════════════
const DailyFrame = memo(function DailyFrame({ films }: { films: any[] }) {
  const router = useRouter();
  const day = daysSinceEpoch();
  const withBackdrop = films.filter((f: any) => f.backdrop_path);
  const film = withBackdrop.length > 0 ? withBackdrop[(day + 3) % withBackdrop.length] : null;

  if (!film) return null;

  return (
    <View>
      <SectionHeader title="The Daily Frame" sub="Today's chosen still from the reels." />
      <TouchableOpacity
        style={st.dailyFrameWrap}
        activeOpacity={0.85}
        onPress={() => router.push(`/film/${film.id}`)}
      >
        <Image
          source={{ uri: `${TMDB_IMG_W780}${film.backdrop_path}` }}
          style={st.dailyFrameImg}
        />
        <LinearGradient
          colors={['transparent', 'rgba(10,7,3,0.4)', 'rgba(10,7,3,0.95)']}
          locations={[0, 0.5, 1]}
          style={StyleSheet.absoluteFillObject}
        />
        <View style={st.dailyFrameCaption}>
          <Text style={st.dailyFrameTitle} numberOfLines={1}>{film.title || film.name}</Text>
          <View style={st.dailyFrameMetaRow}>
            <Text style={st.dailyFrameMeta}>{(film.release_date || '')?.slice(0, 4)}</Text>
            <View style={st.dailyFrameViewRow}>
              <Text style={st.dailyFrameMeta}>VIEW THIS FILM</Text>
              <ChevronRight size={10} color={colors.sepia} strokeWidth={2} />
            </View>
          </View>
        </View>
      </TouchableOpacity>
    </View>
  );
});

// ════════════════════════════════════════════════════════════════
//  DOSSIER CARD — Single Auteur essay in list
// ════════════════════════════════════════════════════════════════
const DossierCard = memo(function DossierCard({ dossier, onPress }: { dossier: Dossier; onPress: () => void }) {
  return (
    <TouchableOpacity style={st.dossierCard} onPress={onPress} activeOpacity={0.85}>
      <View style={st.dossierAccentBar} />

      <View style={st.dossierMeta}>
        <View style={st.dmAuthorRow}>
          <Sparkles size={8} color={colors.sepia} strokeWidth={2} />
          <Text style={st.dmAuthor}>BY {dossier.author}</Text>
        </View>
        <Text style={st.dmDate}>FILED {dossier.date}</Text>
      </View>

      <Text style={st.dossierTitle} numberOfLines={2}>{dossier.title}</Text>

      {dossier.excerpt ? (
        <View style={st.dossierExcerptRow}>
          <Text style={st.dossierDropCap}>{dossier.excerpt.charAt(0)}</Text>
          <Text style={st.dossierExcerpt} numberOfLines={4}>{dossier.excerpt.slice(1)}</Text>
        </View>
      ) : null}

      <View style={st.dossierReadMore}>
        <Text style={st.dossierReadMoreText}>READ DOSSIER</Text>
        <ChevronRight size={12} color={colors.sepia} strokeWidth={2} />
      </View>
    </TouchableOpacity>
  );
});

// ════════════════════════════════════════════════════════════════
//  WIRE ITEM — Single news story in telegram format
// ════════════════════════════════════════════════════════════════
const WireItem = memo(function WireItem({ item, isLead, onPress }: { item: any; isLead?: boolean; onPress: () => void }) {
  if (isLead) {
    return (
      <TouchableOpacity style={st.wireLead} onPress={onPress} activeOpacity={0.85}>
        {item.image && (
          <View style={st.wireLeadImgWrap}>
            <Image source={{ uri: item.image }} style={st.wireLeadImg} />
            <LinearGradient
              colors={['transparent', 'rgba(10,7,3,0.4)', 'rgba(10,7,3,0.95)']}
              locations={[0, 0.4, 1]}
              style={StyleSheet.absoluteFillObject}
            />
          </View>
        )}
        <View style={st.wireLeadBody}>
          <Text style={st.wireCategory}>[{item.category || 'WIRE'}]</Text>
          <Text style={st.wireLeadTitle} numberOfLines={3}>{item.title}</Text>
          <Text style={st.wireLeadExcerpt} numberOfLines={3}>{item.excerpt}</Text>
          <Text style={st.wireMeta}>
            {item.date} · {item.time} · BY {(item.author || 'THE ORACLE').toUpperCase()}
          </Text>
        </View>
      </TouchableOpacity>
    );
  }

  return (
    <TouchableOpacity style={st.wireItem} onPress={onPress} activeOpacity={0.85}>
      <View style={st.wireItemInner}>
        <Text style={st.wireCategory}>[{item.category || 'WIRE'}]</Text>
        <Text style={st.wireTitle} numberOfLines={2}>{item.title}</Text>
        <Text style={st.wireExcerpt} numberOfLines={2}>{item.excerpt}</Text>
        <Text style={st.wireMeta}>
          {item.date} · {item.time} · BY {(item.author || 'THE ORACLE').toUpperCase()}
        </Text>
      </View>
    </TouchableOpacity>
  );
});

// ════════════════════════════════════════════════════════════════
//  ARTICLE READER MODAL — Full dossier / wire story
// ════════════════════════════════════════════════════════════════
function ArticleReaderModal({
  article,
  visible,
  onClose,
}: {
  article: any;
  visible: boolean;
  onClose: () => void;
}) {
  const { user } = useAuthStore();
  const [certified, setCertified] = useState(false);
  const [certifyCount, setCertifyCount] = useState(0);
  const [localViews, setLocalViews] = useState(0);
  const router = useRouter();

  useEffect(() => {
    if (!article || !visible) return;
    setCertified(false);
    setCertifyCount(article.certifyCount || 0);
    setLocalViews((article.views || 0) + 1);

    // Increment views + check certify status
    if (article.id && !article.id.startsWith('seed-') && !article.id.startsWith('fb')) {
      supabase.rpc('increment_dossier_views', { dossier_uuid: article.id }).catch(() => {});
      if (user) {
        supabase
          .from('dossier_certifications')
          .select('id')
          .eq('user_id', user.id)
          .eq('dossier_id', article.id)
          .maybeSingle()
          .then(({ data }) => setCertified(!!data));
      }
    }
  }, [article?.id, visible]);

  const handleCertify = async () => {
    if (!user || !article?.id || article.id.startsWith('seed-') || article.id.startsWith('fb')) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    const wasCertified = certified;
    setCertified(!wasCertified);
    setCertifyCount((prev) => wasCertified ? Math.max(0, prev - 1) : prev + 1);

    try {
      const { data, error } = await supabase.rpc('toggle_dossier_certify', { dossier_uuid: article.id });
      if (error) throw error;
      setCertified(!!data);
    } catch {
      setCertified(wasCertified);
      setCertifyCount((prev) => wasCertified ? prev + 1 : Math.max(0, prev - 1));
    }
  };

  const handleShare = () => {
    if (!article) return;
    const text = `"${article.title}" — a dossier on The Dispatch by The ReelHouse Society`;
    // Using RN Share would be better, but this works for now
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  };

  if (!article) return null;

  const content = article.fullContent || article.excerpt || article.body || '';
  const isDossier = !!article.fullContent;

  return (
    <Modal visible={visible} animationType="slide" transparent statusBarTranslucent>
      <View style={st.readerOverlay}>
        <ScrollView
          style={st.readerScroll}
          contentContainerStyle={st.readerScrollContent}
          showsVerticalScrollIndicator={false}
        >
          {/* Close button */}
          <TouchableOpacity style={st.readerClose} onPress={onClose} hitSlop={{ top: 16, bottom: 16, left: 16, right: 16 }}>
            <XIcon size={20} color={colors.sepia} strokeWidth={1.5} />
          </TouchableOpacity>

          {/* Watermark */}
          <Text style={st.readerWatermark}>REELHOUSE DIGITAL DOSSIER</Text>

          {/* Title */}
          <Text style={st.readerTitle}>{article.title}</Text>

          {/* Byline */}
          {article.author && (
            <Text style={st.readerByline}>
              FILED BY <Text style={st.readerBylineAuthor}>
                {article.authorUsername ? `@${article.authorUsername}` : article.author}
              </Text>
              {article.date ? `  ·  ${article.date}` : ''}
            </Text>
          )}

          {/* Engagement stats */}
          {isDossier && (
            <View style={st.readerStats}>
              <View style={st.readerStatRow}>
                <Eye size={10} color={colors.fog} strokeWidth={1.5} />
                <Text style={st.readerStatText}>{localViews} VIEWS</Text>
              </View>
              <View style={st.readerStatRow}>
                <Sparkles size={10} color={certified ? colors.sepia : colors.fog} strokeWidth={1.5} />
                <Text style={[st.readerStatText, certified && st.readerStatCertified]}>
                  {certifyCount} CERTIFIED
                </Text>
              </View>
            </View>
          )}

          {/* Separator */}
          <View style={st.readerSep} />

          {/* Body content */}
          {content.split('\n\n').map((paragraph: string, idx: number) => {
            if (!paragraph.trim()) return null;
            return (
              <Text key={idx} style={st.readerBody}>{paragraph.trim()}</Text>
            );
          })}

          {/* Action bar */}
          {isDossier && (
            <View style={st.readerActions}>
              <TouchableOpacity style={st.readerActionBtn} onPress={handleCertify}>
                <Heart size={14} color={certified ? colors.sepia : colors.fog} strokeWidth={1.5} fill={certified ? colors.sepia : 'transparent'} />
                <Text style={[st.readerActionText, certified && st.readerActionCertified]}>
                  {certified ? 'CERTIFIED' : 'CERTIFY'} ({certifyCount})
                </Text>
              </TouchableOpacity>

              <TouchableOpacity style={st.readerActionBtn} onPress={handleShare}>
                <Share2 size={14} color={colors.fog} strokeWidth={1.5} />
                <Text style={st.readerActionText}>SHARE</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* If it's a wire story with a link */}
          {article.link && (
            <TouchableOpacity
              style={st.wireReadFullBtn}
              onPress={() => { Linking.openURL(article.link); }}
            >
              <View style={st.wireReadFullRow}>
                <ExternalLink size={12} color={colors.sepia} strokeWidth={1.5} />
                <Text style={st.wireReadFullText}>READ FULL ARTICLE</Text>
              </View>
            </TouchableOpacity>
          )}

          {/* End mark */}
          <View style={st.readerEndmarkRow}>
            <View style={st.readerEndmarkLine} />
            <Sparkles size={10} color={colors.sepia} strokeWidth={1.5} />
            <View style={st.readerEndmarkLine} />
          </View>
        </ScrollView>
      </View>
    </Modal>
  );
}

// ════════════════════════════════════════════════════════════════
//  MAIN: THE DISPATCH SCREEN
// ════════════════════════════════════════════════════════════════
export default function DispatchScreen() {
  const insets = useSafeAreaInsets();
  const { isAuthenticated, user } = useAuthStore();
  const { dossiers, loading, fetchDossiers } = useDispatchStore();
  const router = useRouter();

  const NAV_HEIGHT = 44 + 12;
  const topPad = insets.top + NAV_HEIGHT + 8;

  const canWrite = (user as any)?.role === 'auteur';

  const [trending, setTrending] = useState<any[]>([]);
  const [news, setNews] = useState<any[]>([]);
  const [newsLoading, setNewsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedArticle, setSelectedArticle] = useState<any>(null);

  const loadData = useCallback(async () => {
    try {
      const [trendRes] = await Promise.all([
        tmdb.trending('week'),
        fetchDossiers(),
      ]);
      setTrending((trendRes?.results || []).slice(0, 12));
    } catch {}

    // News
    setNewsLoading(true);
    try {
      const items = await tmdb.getNews();
      setNews((items || []).slice(0, 8));
    } catch {}
    setNewsLoading(false);
  }, [fetchDossiers]);

  useEffect(() => {
    loadData();
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

  return (
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

      <ScrollView
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
      >
        {/* ═══════════ THE DOCUMENT ═══════════ */}
        <View style={st.document}>

          {/* ── MASTHEAD ── */}
          <Animated.View entering={FadeIn.duration(800)} style={st.masthead}>
            <View style={st.mastheadPublisherRow}>
              <Sparkles size={7} color={colors.sepia} strokeWidth={2} />
              <Text style={st.mastheadPublisher}>THE REELHOUSE SOCIETY</Text>
              <Sparkles size={7} color={colors.sepia} strokeWidth={2} />
            </View>

            {/* Double rule top */}
            <View style={st.mastheadRuleTop} />

            <Text style={st.mastheadTitle}>THE{'\n'}DISPATCH</Text>

            {/* Double rule bottom */}
            <View style={st.mastheadRuleBottom} />

            {/* Meta line: VOL · EST · DATE */}
            <View style={st.mastheadMetaRow}>
              <Text style={st.mastheadMetaText}>VOL. {volumeNumber()}</Text>
              <View style={st.pulseDot} />
              <Text style={st.mastheadMetaText}>EST. 1924</Text>
              <View style={st.pulseDot} />
              <Text style={st.mastheadMetaText}>{todayStr}</Text>
            </View>

            <Text style={st.mastheadSubtitle}>
              A journal of cinema — for those who see in the dark.
            </Text>
          </Animated.View>

          <OrnamentalDivider />

          {/* ── WRITER BAR ── */}
          <Animated.View entering={FadeInDown.duration(500).delay(200)} style={st.writerBar}>
            <Text style={st.writerBarLogo}>THE DISPATCH</Text>
            {canWrite ? (
              <TouchableOpacity
                style={st.writerBarBtn}
                onPress={() => router.push('/dispatch/compose')}
              >
                <View style={st.writerBarBtnInner}>
                  <Pen size={10} color={colors.parchment} strokeWidth={1.5} />
                  <Text style={st.writerBarBtnText}>FILE DOSSIER</Text>
                </View>
              </TouchableOpacity>
            ) : (
              <Text style={st.writerBarLocked}>UPGRADE TO AUTEUR TO PUBLISH</Text>
            )}
          </Animated.View>

          {/* ── AUTEUR DOSSIERS ── */}
          <Animated.View entering={FadeInDown.duration(600).delay(300)}>
            <SectionHeader
              title="Auteur Dossiers"
              sub="Original cinematic essays filed by our premium members."
            />

            {loading && dossiers.length === 0 ? (
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
            ) : (
              <View style={st.dossierList}>
                {dossiers.map((d) => (
                  <DossierCard
                    key={d.id}
                    dossier={d}
                    onPress={() => {
                      Haptics.selectionAsync();
                      setSelectedArticle(d);
                    }}
                  />
                ))}
              </View>
            )}

            {dossiers.length === 0 && !loading && (
              <View style={st.emptyState}>
                <FileText size={28} color={colors.sepia} strokeWidth={1} />
                <Text style={st.emptyTitle}>The press room awaits its first dossier.</Text>
                <Text style={st.emptySub}>
                  Auteur members can file original essays and cinematic critiques.
                </Text>
              </View>
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
                    onPress={() => { Haptics.selectionAsync(); setSelectedArticle(news[0]); }}
                  />
                )}
                {news.slice(1).map((item) => (
                  <WireItem
                    key={item.id}
                    item={item}
                    onPress={() => { Haptics.selectionAsync(); setSelectedArticle(item); }}
                  />
                ))}
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
                <Text style={st.busterLabel}>FROM THE EDITOR'S DESK</Text>
                <Text style={st.busterQuote}>
                  "I know you're looking for the romantic comedies, but I hid them. We are only projecting German Expressionism tonight until morale improves."
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
        </View>

        {/* Tab bar spacing */}
        <View style={{ height: 120 }} />
      </ScrollView>

      {/* ── FAB — Auteur Write Button ── */}
      {canWrite && (
        <TouchableOpacity
          style={st.fab}
          onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); router.push('/dispatch/compose'); }}
          activeOpacity={0.85}
        >
          <View style={st.fabInner}>
            <Pen size={12} color={colors.ink} strokeWidth={2} />
            <Text style={st.fabText}>FILE DOSSIER</Text>
          </View>
        </TouchableOpacity>
      )}

      {/* ── ARTICLE READER MODAL ── */}
      <ArticleReaderModal
        article={selectedArticle}
        visible={!!selectedArticle}
        onClose={() => setSelectedArticle(null)}
      />
    </View>
  );
}

// ════════════════════════════════════════════════════════════════
//  STYLES — Nitrate Noir Newspaper Aesthetic
// ════════════════════════════════════════════════════════════════
const st = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.ink },
  scrollContent: { paddingBottom: 0 },
  ambientGlow: { position: 'absolute', top: 0, left: 0, right: 0, height: 300 },

  // ── Document ──
  document: {
    backgroundColor: '#110e0c',
    marginHorizontal: 12,
    padding: 24,
    paddingTop: 32,
    borderWidth: 1,
    borderColor: 'rgba(139,105,20,0.15)',
    borderRadius: 4,
    ...effects.shadowSurface,
  },

  // ── Masthead ──
  masthead: { alignItems: 'center', marginBottom: 24 },
  mastheadPublisherRow: {
    flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 12,
  },
  mastheadPublisher: {
    fontFamily: fonts.ui, fontSize: 7, letterSpacing: 5,
    color: colors.sepia, opacity: 0.7,
  },
  mastheadRuleTop: {
    width: '100%', height: 6, marginBottom: 16,
    borderTopWidth: 3, borderTopColor: colors.sepia,
    borderBottomWidth: 1, borderBottomColor: 'rgba(139,105,20,0.3)',
    opacity: 0.6,
  },
  mastheadTitle: {
    fontFamily: fonts.display, fontSize: 42, color: colors.parchment,
    textAlign: 'center', lineHeight: 44, marginBottom: 16,
    letterSpacing: 1,
    ...effects.textGlowSepia,
    textShadowRadius: 30,
  },
  mastheadRuleBottom: {
    width: '100%', height: 6, marginBottom: 12,
    borderTopWidth: 1, borderTopColor: 'rgba(139,105,20,0.3)',
    borderBottomWidth: 3, borderBottomColor: colors.sepia,
    opacity: 0.6,
  },
  mastheadMetaRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    marginBottom: 12, flexWrap: 'wrap', justifyContent: 'center',
  },
  mastheadMetaText: { fontFamily: fonts.ui, fontSize: 8, letterSpacing: 3, color: colors.sepia },
  pulseDot: { width: 4, height: 4, borderRadius: 2, backgroundColor: colors.bloodReel, opacity: 0.8 },
  mastheadSubtitle: {
    fontFamily: fonts.body, fontSize: 13, color: colors.bone,
    opacity: 0.5, fontStyle: 'italic', textAlign: 'center', letterSpacing: 0.5,
  },

  // ── Divider ──
  dividerWrap: { flexDirection: 'row', alignItems: 'center', gap: 8, marginVertical: 28, opacity: 0.5 },
  dividerLine: { flex: 1, height: 1, backgroundColor: colors.sepia },
  dividerDiamond: { width: 6, height: 6, backgroundColor: colors.sepia, transform: [{ rotate: '45deg' }] },

  // ── Section header ──
  sectionHeaderBlock: { alignItems: 'center', marginBottom: 24 },
  shTitle: { fontFamily: fonts.display, fontSize: 24, color: colors.parchment, marginBottom: 6, textAlign: 'center' },
  shSub: { fontFamily: fonts.ui, fontSize: 11, letterSpacing: 1, color: colors.sepia, opacity: 0.7, textAlign: 'center' },

  // ── Writer bar ──
  writerBar: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingVertical: 12, paddingHorizontal: 4,
    borderBottomWidth: 1, borderBottomColor: 'rgba(139,105,20,0.15)',
    marginBottom: 28,
  },
  writerBarLogo: { fontFamily: fonts.display, fontSize: 16, color: colors.parchment, letterSpacing: 1, ...effects.textGlowSepia },
  writerBarBtn: {
    paddingVertical: 6, paddingHorizontal: 12,
    borderWidth: 1, borderColor: colors.sepia, borderRadius: 2,
  },
  writerBarBtnText: { fontFamily: fonts.ui, fontSize: 8, letterSpacing: 2, color: colors.parchment },
  writerBarBtnInner: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  writerBarLocked: { fontFamily: fonts.ui, fontSize: 8, letterSpacing: 1, color: colors.sepia, opacity: 0.6 },

  // ── Dossier Card ──
  dossierCard: {
    padding: 20, paddingLeft: 24,
    backgroundColor: 'rgba(255,255,255,0.015)',
    borderWidth: 1, borderColor: 'rgba(139,105,20,0.18)',
    borderRadius: 2, position: 'relative',
  },
  dossierAccentBar: {
    position: 'absolute', left: 0, top: 0, bottom: 0, width: 3,
    backgroundColor: colors.sepia,
  },
  dossierMeta: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    marginBottom: 12,
  },
  dmAuthorRow: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
  },
  dmAuthor: {
    fontFamily: fonts.ui, fontSize: 8, letterSpacing: 2, color: colors.sepia,
  },
  dmDate: { fontFamily: fonts.body, fontSize: 9, letterSpacing: 1, color: colors.fog, opacity: 0.7 },
  dossierTitle: { fontFamily: fonts.display, fontSize: 20, color: colors.parchment, lineHeight: 24, marginBottom: 10 },
  dossierExcerptRow: { flexDirection: 'row' },
  dossierDropCap: {
    fontFamily: fonts.display, fontSize: 36, color: colors.sepia,
    lineHeight: 36, paddingRight: 6, opacity: 0.9,
  },
  dossierExcerpt: { fontFamily: fonts.body, fontSize: 14, lineHeight: 22, color: colors.bone, opacity: 0.7, flex: 1, paddingTop: 4 },
  dossierReadMore: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 16 },
  dossierReadMoreText: { fontFamily: fonts.uiMedium, fontSize: 10, letterSpacing: 1, color: colors.parchment },

  // ── Nightly Transmission ──
  transmissionWrap: {
    borderWidth: 1, borderColor: 'rgba(162,36,36,0.3)',
    padding: 24, position: 'relative', overflow: 'hidden',
    borderRadius: 2,
  },
  transmissionBg: {
    ...StyleSheet.absoluteFillObject, width: '100%', height: '100%',
    opacity: 0.15,
  },
  transmissionContent: { alignItems: 'center', position: 'relative' },
  transmissionSignalRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 },
  transmissionSignal: { fontFamily: fonts.ui, fontSize: 8, letterSpacing: 4, color: colors.bloodReel, opacity: 0.8 },
  transmissionLabel: { fontFamily: fonts.ui, fontSize: 7, letterSpacing: 3, color: colors.sepia, marginBottom: 16 },
  transmissionTitle: {
    fontFamily: fonts.display, fontSize: 28, color: colors.parchment,
    textAlign: 'center', lineHeight: 32, marginBottom: 8,
    ...effects.textGlowSepia,
  },
  transmissionMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  transmissionMeta: { fontFamily: fonts.ui, fontSize: 9, letterSpacing: 1.5, color: colors.sepia, marginBottom: 12 },
  transmissionExcerpt: {
    fontFamily: fonts.body, fontSize: 13, lineHeight: 20, color: colors.bone,
    opacity: 0.7, fontStyle: 'italic', textAlign: 'center', marginBottom: 16,
    paddingHorizontal: 12,
  },
  transmissionFooter: { flexDirection: 'row', gap: 16, flexWrap: 'wrap', justifyContent: 'center' },
  transmissionBullet: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  transmissionDot: { width: 6, height: 6, borderRadius: 3 },
  transmissionFooterText: { fontFamily: fonts.ui, fontSize: 7, letterSpacing: 1, color: colors.fog },

  // Corners
  corner: { position: 'absolute', width: 16, height: 16 },
  cornerTL: { top: 8, left: 8, borderTopWidth: 2, borderLeftWidth: 2, borderColor: 'rgba(162,36,36,0.5)' },
  cornerTR: { top: 8, right: 8, borderTopWidth: 2, borderRightWidth: 2, borderColor: 'rgba(162,36,36,0.5)' },
  cornerBL: { bottom: 8, left: 8, borderBottomWidth: 2, borderLeftWidth: 2, borderColor: 'rgba(162,36,36,0.5)' },
  cornerBR: { bottom: 8, right: 8, borderBottomWidth: 2, borderRightWidth: 2, borderColor: 'rgba(162,36,36,0.5)' },

  // ── Daily Frame ──
  dailyFrameWrap: {
    width: '100%', aspectRatio: 21 / 9, overflow: 'hidden',
    borderWidth: 1, borderColor: 'rgba(139,105,20,0.2)', borderRadius: 2,
  },
  dailyFrameImg: { width: '100%', height: '100%', resizeMode: 'cover' },
  dailyFrameCaption: { position: 'absolute', bottom: 12, left: 14, right: 14 },
  dailyFrameTitle: { fontFamily: fonts.display, fontSize: 18, color: colors.parchment, lineHeight: 22, marginBottom: 4 },
  dailyFrameMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  dailyFrameViewRow: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  dailyFrameMeta: { fontFamily: fonts.ui, fontSize: 8, letterSpacing: 1.5, color: colors.sepia },

  // ── Wire ──
  wireLead: {
    borderWidth: 1, borderColor: 'rgba(139,105,20,0.15)',
    overflow: 'hidden', marginBottom: 20, borderRadius: 2,
  },
  wireLeadImgWrap: { width: '100%', aspectRatio: 16 / 9, overflow: 'hidden' },
  wireLeadImg: { width: '100%', height: '100%', resizeMode: 'cover' },
  wireLeadBody: { padding: 16 },
  wireLeadTitle: { fontFamily: fonts.display, fontSize: 20, color: colors.parchment, lineHeight: 24, marginBottom: 8 },
  wireLeadExcerpt: { fontFamily: fonts.body, fontSize: 13, lineHeight: 20, color: colors.bone, opacity: 0.7, marginBottom: 10 },
  wireCategory: { fontFamily: fonts.ui, fontSize: 7, letterSpacing: 2.5, color: colors.sepia, marginBottom: 4, opacity: 0.8 },
  wireTitle: { fontFamily: fonts.display, fontSize: 16, color: colors.parchment, lineHeight: 20, marginBottom: 6 },
  wireExcerpt: { fontFamily: fonts.body, fontSize: 12, lineHeight: 18, color: colors.bone, opacity: 0.6, marginBottom: 6 },
  wireMeta: { fontFamily: fonts.body, fontSize: 8, letterSpacing: 1, color: colors.sepia, opacity: 0.5 },
  wireItem: {
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(139,105,20,0.08)',
  },
  wireItemInner: { flex: 1 },
  wireLoader: {
    textAlign: 'center', fontFamily: fonts.ui, fontSize: 10, letterSpacing: 2,
    color: colors.sepia, opacity: 0.5, paddingVertical: 24,
  },

  // ── Buster Note ──
  busterNote: { marginTop: 32 },
  busterRuleTop: { borderTopWidth: 3, borderTopColor: 'rgba(139,105,20,0.2)', borderStyle: 'solid', marginBottom: 20 },
  busterContent: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  busterAvatar: { opacity: 0.8 },
  busterTextWrap: { flex: 1 },
  busterLabel: { fontFamily: fonts.ui, fontSize: 8, letterSpacing: 2.5, color: colors.sepia, marginBottom: 8 },
  busterQuote: {
    fontFamily: fonts.body, fontSize: 13, lineHeight: 20,
    color: colors.bone, fontStyle: 'italic', opacity: 0.7,
  },

  // ── Footer ──
  footer: { alignItems: 'center', marginTop: 24 },
  footerMark: { fontFamily: fonts.ui, fontSize: 9, letterSpacing: 4, color: colors.sepia, opacity: 0.5, marginBottom: 6 },
  footerHeritage: { fontFamily: fonts.ui, fontSize: 7, letterSpacing: 3, color: colors.sepia, opacity: 0.3, marginBottom: 6 },
  footerCopyright: { fontFamily: fonts.body, fontSize: 11, color: colors.bone, opacity: 0.3, textAlign: 'center' },

  // ── Empty ──
  emptyState: { alignItems: 'center', paddingVertical: 32, gap: 12 },
  emptyTitle: { fontFamily: fonts.display, fontSize: 16, color: colors.parchment, opacity: 0.6, textAlign: 'center', marginBottom: 4 },
  emptySub: { fontFamily: fonts.body, fontSize: 12, color: colors.bone, opacity: 0.4, fontStyle: 'italic', textAlign: 'center', lineHeight: 18, maxWidth: 260 },

  // ── Skeleton ──
  skeleton: {
    backgroundColor: 'rgba(14,11,8,0.7)', borderRadius: 2,
    padding: 20, borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(139,105,20,0.06)',
  },
  shimmer: { backgroundColor: 'rgba(139,105,20,0.06)', borderRadius: 2 },
  shimmerSm: { width: '35%', height: 8 },
  shimmerLg: { width: '80%', height: 20, marginTop: 10 },
  shimmerMd: { width: '60%', height: 12, marginTop: 10 },
  skeletonGroup: { gap: 16, marginBottom: 32 },
  dossierList: { gap: 24, marginBottom: 16 },
  wireList: { gap: 0 },

  // ── FAB ──
  fab: {
    position: 'absolute', bottom: 100, right: 20,
    backgroundColor: colors.sepia, borderRadius: 40,
    paddingVertical: 14, paddingHorizontal: 20,
    ...effects.glowSepia,
    shadowRadius: 30,
    elevation: 12,
  },
  fabInner: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
  },
  fabText: {
    fontFamily: fonts.uiBold, fontSize: 10, letterSpacing: 1.5,
    color: colors.ink,
  },

  // ── Article Reader Modal ──
  readerOverlay: {
    flex: 1, backgroundColor: 'rgba(5,3,1,0.96)',
  },
  readerScroll: { flex: 1 },
  readerScrollContent: {
    paddingHorizontal: 24, paddingTop: 60, paddingBottom: 60,
  },
  readerClose: {
    position: 'absolute', top: 16, right: 0, zIndex: 10,
    padding: 8,
  },
  readerWatermark: {
    fontFamily: fonts.ui, fontSize: 8, letterSpacing: 4,
    color: colors.sepia, opacity: 0.4, textAlign: 'center', marginBottom: 28,
  },
  readerTitle: {
    fontFamily: fonts.display, fontSize: 28, color: colors.parchment,
    textAlign: 'center', lineHeight: 32, marginBottom: 16,
  },
  readerByline: {
    fontFamily: fonts.ui, fontSize: 9, letterSpacing: 2,
    color: colors.bone, opacity: 0.6, textAlign: 'center', marginBottom: 12,
  },
  readerBylineAuthor: { color: colors.sepia, fontWeight: '700' },
  readerStats: {
    flexDirection: 'row', justifyContent: 'center', gap: 20,
    paddingTop: 10, borderTopWidth: 1, borderTopColor: 'rgba(139,105,20,0.15)',
    borderStyle: 'dashed',
  },
  readerStatRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  readerStatText: { fontFamily: fonts.ui, fontSize: 7, letterSpacing: 1.5, color: colors.fog },
  readerStatCertified: { color: colors.sepia },
  readerSep: {
    height: 1, backgroundColor: 'rgba(139,105,20,0.2)',
    marginVertical: 24, width: 60, alignSelf: 'center',
  },
  readerBody: {
    fontFamily: fonts.body, fontSize: 15, lineHeight: 26,
    color: colors.bone, marginBottom: 18,
  },
  readerActions: {
    flexDirection: 'row', gap: 16, paddingTop: 16,
    borderTopWidth: 1, borderTopColor: 'rgba(139,105,20,0.1)',
    marginTop: 20,
  },
  readerActionBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 8, paddingHorizontal: 12 },
  readerActionText: { fontFamily: fonts.ui, fontSize: 9, letterSpacing: 1.5, color: colors.fog },
  readerActionCertified: { color: colors.sepia },
  wireReadFullBtn: {
    marginTop: 20, paddingVertical: 14,
    borderWidth: 1, borderColor: 'rgba(139,105,20,0.25)',
    borderRadius: 2, alignItems: 'center',
  },
  wireReadFullRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  wireReadFullText: { fontFamily: fonts.uiMedium, fontSize: 9, letterSpacing: 2, color: colors.sepia },
  readerEndmarkRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    justifyContent: 'center', marginTop: 32,
  },
  readerEndmarkLine: {
    width: 32, height: StyleSheet.hairlineWidth,
    backgroundColor: colors.sepia, opacity: 0.3,
  },
});
