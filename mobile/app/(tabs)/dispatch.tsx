/**
 * THE DISPATCH — "The Gazette of 1924"
 * A journal of cinema — for those who see in the dark.
 */
import { useEffect, useCallback, useState, useRef, memo } from 'react';
import {
  View, Text, StyleSheet, ScrollView, RefreshControl,
  Platform, Dimensions, Modal, Linking, ActivityIndicator, Share,
} from 'react-native';
import { Image } from 'expo-image';
import Animated, {
  FadeIn, FadeInDown,
  useSharedValue, useAnimatedStyle, withRepeat, withTiming, Easing, cancelAnimation,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import {
  Eye, Pen, Heart, Share2, ChevronRight, X as XIcon,
  Radio, Star, Sparkles, ExternalLink, FileText,
} from 'lucide-react-native';
import Svg, { Path, Rect, Defs, LinearGradient as SvgLinearGradient, Stop } from 'react-native-svg';

import { useAuthStore } from '@/src/stores/auth';
import { useDispatchStore, Dossier } from '@/src/stores/content';
import { tmdb } from '@/src/lib/tmdb';
import { supabase } from '@/src/lib/supabase';
import { colors, fonts, effects, SEPIA_HASH } from '@/src/theme/theme';
import Buster from '@/src/components/Buster';
import PressableScale from '@/src/components/PressableScale';

const TMDB_IMG_W780 = 'https://image.tmdb.org/t/p/w780';
const TMDB_IMG_W500 = 'https://image.tmdb.org/t/p/w500';
const { width: SCREEN_W } = Dimensions.get('window');



interface DispatchFilm {
  id: number;
  title?: string;
  name?: string;
  backdrop_path?: string | null;
  poster_path?: string | null;
  release_date?: string;
  vote_average?: number;
  overview?: string;
}

interface WireStory {
  id: string;
  title: string;
  excerpt: string;
  category?: string;
  date?: string;
  time?: string;
  author?: string;
  image?: string;
  link?: string;
  body?: string;
  fullContent?: string;
  views?: number;
  certifyCount?: number;
  authorUsername?: string;
}

// ── Volume / Transmission number helpers ──
const EPOCH = new Date('2026-03-12T00:00:00Z').getTime();
const daysSinceEpoch = () => Math.floor(Date.now() / (24 * 60 * 60 * 1000));
const volumeNumber = () => String(Math.floor((Date.now() - EPOCH) / (7 * 24 * 60 * 60 * 1000)) + 1).padStart(3, '0');
const transmissionNum = () => String(Math.floor((Date.now() - EPOCH) / (24 * 60 * 60 * 1000)) + 1).padStart(3, '0');

// ════════════════════════════════════════════════════════════════
//  ORNAMENTAL DIVIDER — SVG Deco Filigree
// ════════════════════════════════════════════════════════════════
function OrnamentalDivider() {
  return (
    <View style={st.dividerWrap}>
      <Svg width="100%" height="12" viewBox="0 0 300 12" preserveAspectRatio="none">
        <Defs>
          <SvgLinearGradient id="g" x1="0" y1="0" x2="1" y2="0">
            <Stop offset="0" stopColor={colors.sepia} stopOpacity="0" />
            <Stop offset="0.3" stopColor={colors.sepia} stopOpacity="0.4" />
            <Stop offset="0.5" stopColor={colors.sepia} stopOpacity="0.8" />
            <Stop offset="0.7" stopColor={colors.sepia} stopOpacity="0.4" />
            <Stop offset="1" stopColor={colors.sepia} stopOpacity="0" />
          </SvgLinearGradient>
        </Defs>
        <Rect x="0" y="5.5" width="300" height="0.5" fill="url(#g)" />
        <Path d="M150 0 L156 6 L150 12 L144 6 Z" fill={colors.sepia} opacity="0.8" />
        <Path d="M135 4 L139 6 L135 8 L131 6 Z" fill={colors.sepia} opacity="0.4" />
        <Path d="M165 4 L169 6 L165 8 L161 6 Z" fill={colors.sepia} opacity="0.4" />
      </Svg>
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
//  NIGHTLY TRANSMISSION — Dynamic trending film pick (Magazine Cover)
// ════════════════════════════════════════════════════════════════
const NightlyTransmission = memo(function NightlyTransmission({ films }: { films: DispatchFilm[] }) {
  const router = useRouter();
  const day = daysSinceEpoch();
  const film = films.length > 0 ? films[day % films.length] : null;
  const txNum = transmissionNum();

  const scale = useSharedValue(1);
  const blink = useSharedValue(0.2);

  useEffect(() => {
    // 30-second continuous breathe
    scale.value = withRepeat(
      withTiming(1.08, { duration: 30000, easing: Easing.inOut(Easing.sin) }),
      -1,
      true
    );
    blink.value = withRepeat(
      withTiming(1, { duration: 800, easing: Easing.inOut(Easing.ease) }),
      -1,
      true
    );
    return () => {
      cancelAnimation(scale);
      cancelAnimation(blink);
    };
  }, []);

  const animatedImgStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));
  const animatedBlinkStyle = useAnimatedStyle(() => ({ opacity: blink.value }));

  if (!film) return null;

  const backdropUri = film.backdrop_path ? `${TMDB_IMG_W780}${film.backdrop_path}` : null;

  return (
    <PressableScale
      style={st.transmissionWrap}
      onPress={() => router.push(`/film/${film.id}`)}
      pressedScale={0.97}
      haptic="medium"
      accessibilityRole="button"
      accessibilityLabel={`Nightly transmission: ${film.title}`}
    >
      <View style={st.transmissionImageContainer}>
        {backdropUri && (
          <Animated.View style={[StyleSheet.absoluteFillObject, animatedImgStyle]}>
            <Image 
              source={{ uri: backdropUri }} 
              style={StyleSheet.absoluteFillObject} 
              cachePolicy="memory-disk" 
              placeholder={{ blurhash: SEPIA_HASH }} 
              transition={800} 
            />
          </Animated.View>
        )}
        <LinearGradient 
          colors={['transparent', 'rgba(10,7,3,0.5)', 'rgba(10,7,3,0.95)', colors.ink]} 
          locations={[0, 0.4, 0.8, 1]}
          style={StyleSheet.absoluteFillObject} 
        />
        {/* Subtle noise grain could go here but Native performance dictates avoiding massive overlapping arrays. */}
      </View>

      <View style={st.transmissionContent}>
        <View style={st.transmissionSignalRow}>
          <Animated.View style={animatedBlinkStyle}>
            <Radio size={12} color={colors.bloodReel} strokeWidth={2.5} />
          </Animated.View>
          <Text style={st.transmissionSignal}>[ TRANSMISSION LIVE ]</Text>
        </View>
        
        <Text style={st.transmissionTitle} numberOfLines={2}>
          {(film.title ?? '').toUpperCase()}
        </Text>

        <View style={st.transmissionMetaRow}>
          <Text style={st.transmissionMeta} numberOfLines={1}>VOL. {volumeNumber()} · № {txNum}</Text>
          <Star size={7} color={colors.sepia} strokeWidth={2} fill={colors.sepia} />
          <Text style={st.transmissionMeta} numberOfLines={1}>{(film.release_date || '').slice(0, 4)}</Text>
        </View>

        <Text style={st.transmissionExcerpt} numberOfLines={4}>
          "{film.overview}"
        </Text>

        <View style={st.transmissionFooter}>
          <View style={st.transmissionBullet}>
            <Text style={st.transmissionFooterText} numberOfLines={1}>[ INITIATE VIEWING SEQUENCE ]</Text>
          </View>
        </View>
      </View>
    </PressableScale>
  );
});

// ════════════════════════════════════════════════════════════════
//  DAILY FRAME — A cinematic still that changes every day
// ════════════════════════════════════════════════════════════════
const DailyFrame = memo(function DailyFrame({ films }: { films: DispatchFilm[] }) {
  const router = useRouter();
  const day = daysSinceEpoch();
  const withBackdrop = films.filter((f: DispatchFilm) => f.backdrop_path);
  const film = withBackdrop.length > 0 ? withBackdrop[(day + 3) % withBackdrop.length] : null;

  if (!film) return null;

  return (
    <View>
      <SectionHeader title="The Daily Frame" sub="Today's chosen still from the reels." />
      <PressableScale
        style={st.dailyFrameWrap}
        onPress={() => router.push(`/film/${film.id}`)}
        pressedScale={0.98}
        haptic
        accessibilityRole="button"
        accessibilityLabel={`Daily frame: ${film.title ?? film.name}`}
      >
        <Image
          source={{ uri: `${TMDB_IMG_W780}${film.backdrop_path}` }}
          style={st.dailyFrameImg}
          cachePolicy="memory-disk"
          placeholder={{ blurhash: SEPIA_HASH }}
          transition={200}
        />
        <LinearGradient
          colors={['transparent', 'rgba(10,7,3,0.4)', 'rgba(10,7,3,0.95)']}
          locations={[0, 0.5, 1]}
          style={StyleSheet.absoluteFillObject}
        />
        <View style={st.dailyFrameCaption}>
          <Text style={st.dailyFrameTitle} numberOfLines={1}>{film.title ?? film.name}</Text>
          <View style={st.dailyFrameMetaRow}>
            <Text style={st.dailyFrameMeta} numberOfLines={1}>{(film.release_date ?? '')?.slice(0, 4)}</Text>
            <View style={st.dailyFrameViewRow}>
              <Text style={st.dailyFrameMeta} numberOfLines={1}>VIEW THIS FILM</Text>
              <ChevronRight size={10} color={colors.sepia} strokeWidth={2} />
            </View>
          </View>
        </View>
      </PressableScale>
    </View>
  );
});

// ════════════════════════════════════════════════════════════════
//  DOSSIER CARD — Single Auteur essay in list
// ════════════════════════════════════════════════════════════════
const DossierCard = memo(function DossierCard({ dossier, index, onPress }: { dossier: Dossier; index: number; onPress: () => void }) {
  const isFeature = index === 0;

  return (
    <PressableScale style={[st.dossierCard, isFeature && st.dossierCardFeature]} onPress={onPress} pressedScale={isFeature ? 0.98 : 0.96} haptic accessibilityRole="button" accessibilityLabel={`Dossier: ${dossier.title} by ${dossier.author}`}>
      <View style={st.dossierAccentBar} />

      <View style={st.dossierMeta}>
        <View style={st.dmAuthorRow}>
          <Sparkles size={isFeature ? 10 : 8} color={colors.sepia} strokeWidth={2} />
          <Text style={[st.dmAuthor, isFeature && { fontSize: 10, opacity: 1 }]} numberOfLines={1}>BY {dossier.author}</Text>
        </View>
        <Text style={st.dmDate} numberOfLines={1}>FILED {dossier.date}</Text>
      </View>

      <Text style={[st.dossierTitle, isFeature && st.dossierTitleFeature]} numberOfLines={isFeature ? 3 : 2}>{dossier.title}</Text>

      {dossier.excerpt && isFeature ? (
        <View style={st.dossierExcerptRow}>
          <Text style={st.dossierDropCap}>{dossier.excerpt.charAt(0)}</Text>
          <Text style={st.dossierExcerpt} numberOfLines={4}>{dossier.excerpt.slice(1)}</Text>
        </View>
      ) : null}

      <View style={st.dossierReadMore}>
        <Text style={st.dossierReadMoreText} numberOfLines={1}>{isFeature ? '[ INITIATE FULL VIEW ]' : '[ INITIATE VIEW ]'}</Text>
        <ChevronRight size={12} color={colors.sepia} strokeWidth={2} />
      </View>
    </PressableScale>
  );
});

// ════════════════════════════════════════════════════════════════
//  WIRE ITEM — Single news story in telegram format
// ════════════════════════════════════════════════════════════════
const WireItem = memo(function WireItem({ item, isLead, onPress }: { item: WireStory; isLead?: boolean; onPress: () => void }) {
  if (isLead) {
    return (
      <PressableScale style={st.wireLead} onPress={onPress} pressedScale={0.98} haptic accessibilityRole="button" accessibilityLabel={`Wire article: ${item.title}`}>
        {item.image && (
          <View style={st.wireLeadImgWrap}>
            <Image source={{ uri: item.image }} style={st.wireLeadImg} cachePolicy="memory-disk" placeholder={{ blurhash: SEPIA_HASH }} transition={150} />
            <LinearGradient
              colors={['transparent', 'rgba(10,7,3,0.4)', 'rgba(10,7,3,0.95)']}
              locations={[0, 0.4, 1]}
              style={StyleSheet.absoluteFillObject}
            />
          </View>
        )}
        <View style={st.wireLeadBody}>
          <Text style={st.wireCategory} numberOfLines={1}>[{item.category ?? 'WIRE'}]</Text>
          <Text style={st.wireLeadTitle} numberOfLines={3}>{item.title}</Text>
          <Text style={st.wireLeadExcerpt} numberOfLines={3}>{item.excerpt}</Text>
          <Text style={st.wireMeta} numberOfLines={1}>
            {item.date} · {item.time} · BY {(item.author ?? 'THE ORACLE').toUpperCase()}
          </Text>
        </View>
      </PressableScale>
    );
  }

  return (
    <PressableScale style={st.wireItem} onPress={onPress} pressedScale={0.98} haptic accessibilityRole="button" accessibilityLabel={`Wire article: ${item.title}`}>
      <View style={st.wireItemInner}>
        <Text style={st.wireCategory} numberOfLines={1}>[{item.category ?? 'WIRE'}]</Text>
        <Text style={st.wireTitle} numberOfLines={2}>{item.title}</Text>
        <Text style={st.wireExcerpt} numberOfLines={2}>{item.excerpt}</Text>
        <Text style={st.wireMeta} numberOfLines={1}>
          {item.date} · {item.time} · BY {(item.author ?? 'THE ORACLE').toUpperCase()}
        </Text>
      </View>
    </PressableScale>
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
  article: Dossier | WireStory | null;
  visible: boolean;
  onClose: () => void;
}) {
  const { user } = useAuthStore();
  const insets = useSafeAreaInsets();
  const [certified, setCertified] = useState(false);
  const [certifyCount, setCertifyCount] = useState(0);
  const [localViews, setLocalViews] = useState(0);
  const router = useRouter();

  useEffect(() => {
    if (!article || !visible) return;
    setCertified(false);
    setCertifyCount(article.certifyCount ?? 0);
    setLocalViews((article.views ?? 0) + 1);

    // Increment views + check certify status
    if (article.id && !article.id.startsWith('seed-') && !article.id.startsWith('fb')) {
      supabase.rpc('increment_dossier_views', { dossier_uuid: article.id }).then(({ error }) => {
        // Silent error
      });
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

  const handleShare = async () => {
    if (!article) return;
    const text = `"${article.title}" — a dossier on The Dispatch by The ReelHouse Society`;
    try {
      const result = await Share.share({ message: text });
      if (result.action === Share.sharedAction) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
    } catch {}
  };

  if (!article) return null;

  const content = article.fullContent ?? article.excerpt ?? article.body ?? '';
  const isDossier = 'authorId' in article;

  return (
    <Modal visible={visible} animationType="fade" transparent statusBarTranslucent>
      <View style={st.readerOverlay}>
        {/* Close button - AT ABSOLUTE ROOT TO PREVENT SCROLLAWAY ENTRAPMENT */}
        <PressableScale style={[st.readerClose, { top: insets.top + 16 }]} onPress={onClose} hitSlop={{ top: 16, bottom: 16, left: 16, right: 16 }} accessibilityRole="button" accessibilityLabel="Close article" haptic="medium">
          <XIcon size={20} color={colors.sepia} strokeWidth={1.5} />
        </PressableScale>

        <ScrollView
          style={st.readerScroll}
          contentContainerStyle={[st.readerScrollContent, { paddingTop: insets.top + 20, paddingBottom: insets.bottom + 60 }]}
          showsVerticalScrollIndicator={false}
        >

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
              <PressableScale style={st.readerActionBtn} onPress={handleCertify} pressedScale={0.95} haptic>
                <Heart size={14} color={certified ? colors.sepia : colors.fog} strokeWidth={1.5} fill={certified ? colors.sepia : 'transparent'} />
                <Text style={[st.readerActionText, certified && st.readerActionCertified]} numberOfLines={1}>
                  {certified ? 'CERTIFIED' : 'CERTIFY'} ({certifyCount})
                </Text>
              </PressableScale>

              <PressableScale style={st.readerActionBtn} onPress={handleShare} pressedScale={0.95} haptic>
                <Share2 size={14} color={colors.fog} strokeWidth={1.5} />
                <Text style={st.readerActionText} numberOfLines={1}>SHARE</Text>
              </PressableScale>
            </View>
          )}

          {/* If it's a wire story with a link */}
          {article.link && (
            <PressableScale
              style={st.wireReadFullBtn}
              onPress={() => { Linking.openURL(article.link); }}
              pressedScale={0.97}
            >
              <View style={st.wireReadFullRow}>
                <ExternalLink size={12} color={colors.sepia} strokeWidth={1.5} />
                <Text style={st.wireReadFullText} numberOfLines={1}>READ FULL ARTICLE</Text>
              </View>
            </PressableScale>
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

  const isFirstNewsRef = useRef(true);

  const loadData = useCallback(async () => {
    try {
      const [trendRes] = await Promise.all([
        tmdb.trending('week'),
        fetchDossiers(),
      ]);
      setTrending((trendRes?.results ?? []).slice(0, 12));
    } catch {}

    // News — SWR pattern: only show loading skeleton on first load
    if (isFirstNewsRef.current) setNewsLoading(true);
    try {
      const items = await tmdb.getNews();
      setNews((items ?? []).slice(0, 8));
    } catch {}
    if (isFirstNewsRef.current) {
      setNewsLoading(false);
      isFirstNewsRef.current = false;
    }
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
                  onPress={() => router.push('/dispatch/compose')}
                  haptic
                >
                  <View style={st.writerBarBtnInner}>
                    <Pen size={10} color={colors.parchment} strokeWidth={1.5} />
                    <Text style={st.writerBarBtnText} numberOfLines={1}>FILE NEW DOSSIER</Text>
                  </View>
                </PressableScale>
              </View>
            )}

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
                {dossiers.map((d, index) => (
                  <DossierCard
                    key={d.id}
                    dossier={d}
                    index={index}
                    onPress={() => {
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
                    onPress={() => { setSelectedArticle(news[0]); }}
                  />
                )}
                {news.slice(1).map((item) => (
                  <WireItem
                    key={item.id}
                    item={item}
                    onPress={() => { setSelectedArticle(item); }}
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
        <View style={st.tabBarSpacer} />
      </ScrollView>



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
  ambientGlow: { position: 'absolute', top: 0, left: 0, right: 0, height: 400 },

  // ── Document ──
  document: {
    backgroundColor: 'rgba(8,6,4,0.98)',
    marginHorizontal: 12,
    padding: 24,
    paddingTop: 32,
    borderWidth: 1.5,
    borderColor: 'rgba(139,105,20,0.2)',
    borderRadius: 4,
    ...effects.shadowSurface,
    elevation: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.8,
    shadowRadius: 15,
  },

  // ── Masthead ──
  masthead: { alignItems: 'center', marginBottom: 24 },
  mastheadPublisherRow: {
    flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 12,
  },
  mastheadPublisher: {
    fontFamily: fonts.ui, fontSize: 7, letterSpacing: 5,
    color: colors.sepia, opacity: 0.8,
  },
  mastheadRuleTop: {
    width: '100%', height: 6, marginBottom: 16,
    borderTopWidth: 3, borderTopColor: colors.sepia,
    borderBottomWidth: 1, borderBottomColor: 'rgba(139,105,20,0.3)',
    opacity: 0.6,
  },
  mastheadTitle: {
    fontFamily: fonts.mono, fontSize: 36, color: '#F2ECD8',
    textAlign: 'center', lineHeight: 36, marginBottom: 16,
    letterSpacing: 6, fontWeight: '700',
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
  mastheadMetaText: { fontFamily: fonts.mono, fontSize: 9, letterSpacing: 3, color: colors.sepia, fontWeight: '700' },
  pulseDot: { width: 4, height: 4, borderRadius: 2, backgroundColor: colors.bloodReel, opacity: 0.8 },
  mastheadSubtitle: {
    fontFamily: fonts.body, fontSize: 11, color: colors.bone,
    opacity: 0.6, fontStyle: 'italic', textAlign: 'center', letterSpacing: 0.5,
  },

  // ── Divider ──
  dividerWrap: { flexDirection: 'row', alignItems: 'center', gap: 8, marginVertical: 28, opacity: 0.5 },
  dividerLine: { flex: 1, height: 1, backgroundColor: colors.sepia },
  dividerDiamond: { width: 6, height: 6, backgroundColor: colors.sepia, transform: [{ rotate: '45deg' }] },

  // ── Section header ──
  sectionHeaderBlock: { alignItems: 'center', marginBottom: 24 },
  shTitle: { fontFamily: fonts.display, fontSize: 20, color: colors.parchment, marginBottom: 6, textAlign: 'center' },
  shSub: { fontFamily: fonts.ui, fontSize: 11, letterSpacing: 1, color: colors.sepia, opacity: 0.8, textAlign: 'center' },

  // ── Writer bar ──
  writerBar: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingVertical: 12, paddingHorizontal: 4,
    borderBottomWidth: 1, borderBottomColor: 'rgba(139,105,20,0.15)',
    marginBottom: 28,
  },
  writerBarWrap: { alignItems: 'center', marginBottom: 24, marginTop: -4 },
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
    backgroundColor: 'rgba(8,6,4,0.98)',
    borderWidth: 1.5, borderColor: 'rgba(139,105,20,0.2)', borderStyle: 'dashed',
    borderRadius: 4, position: 'relative',
    ...effects.shadowSurface,
  },
  dossierAccentBar: {
    position: 'absolute', left: 0, top: 0, bottom: 0, width: 4,
    backgroundColor: colors.sepia,
    borderTopLeftRadius: 4, borderBottomLeftRadius: 4,
  },
  dossierMeta: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start',
    marginBottom: 12,
    flexWrap: 'wrap',
    gap: 4,
  },
  dmAuthorRow: {
    flexDirection: 'row', alignItems: 'center', gap: 5, flexShrink: 1,
  },
  dmAuthor: {
    fontFamily: fonts.mono, fontSize: 9, letterSpacing: 2, color: colors.sepia, flexShrink: 1, fontWeight: '700',
  },
  dmDate: { fontFamily: fonts.mono, fontSize: 9, letterSpacing: 1, color: colors.fog, opacity: 0.7, flexShrink: 0 },
  dossierTitle: { fontFamily: fonts.display, fontSize: 20, color: colors.parchment, lineHeight: 24, marginBottom: 10 },
  dossierCardFeature: {
    paddingVertical: 24, paddingRight: 24, paddingLeft: 28,
    backgroundColor: 'rgba(196,150,26,0.03)',
  },
  dossierTitleFeature: {
    fontSize: 26, lineHeight: 30, ...effects.textGlowSepia,
  },
  dossierExcerptRow: { flexDirection: 'row' },
  dossierDropCap: {
    fontFamily: fonts.mono, fontSize: 36, color: colors.sepia,
    lineHeight: 36, paddingRight: 8, opacity: 0.9, fontWeight: '700',
  },
  dossierExcerpt: { fontFamily: fonts.mono, fontSize: 13, lineHeight: 22, color: colors.bone, opacity: 0.8, flex: 1, paddingTop: 2 },
  dossierReadMore: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 16 },
  dossierReadMoreText: { fontFamily: fonts.mono, fontSize: 9, letterSpacing: 2, color: colors.sepia, fontWeight: '700' },

  // ── Nightly Transmission ──
  transmissionWrap: {
    borderWidth: 2, borderColor: 'rgba(139,105,20,0.2)',
    padding: 24, position: 'relative', overflow: 'hidden',
    borderRadius: 6, ...effects.shadowSurface,
    backgroundColor: 'rgba(8,6,4,0.98)',
  },
  transmissionBg: {
    ...StyleSheet.absoluteFillObject, width: '100%', height: '100%',
    opacity: 0.15,
  },
  transmissionImageContainer: {
    ...StyleSheet.absoluteFillObject,
    overflow: 'hidden',
  },
  transmissionContent: { alignItems: 'center', position: 'relative' },
  transmissionSignalRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 },
  transmissionSignal: { fontFamily: fonts.ui, fontSize: 8, letterSpacing: 4, color: colors.bloodReel, opacity: 0.8 },
  transmissionLabel: { fontFamily: fonts.ui, fontSize: 7, letterSpacing: 3, color: colors.sepia, marginBottom: 16 },
  transmissionTitle: {
    fontFamily: fonts.display, fontSize: 24, color: colors.parchment,
    textAlign: 'center', lineHeight: 28, marginBottom: 8,
    ...effects.textGlowSepia,
  },
  transmissionMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  transmissionMeta: { fontFamily: fonts.ui, fontSize: 8, letterSpacing: 1.5, color: colors.sepia, marginBottom: 12 },
  transmissionExcerpt: {
    fontFamily: fonts.body, fontSize: 11, lineHeight: 18, color: colors.bone,
    opacity: 0.7, fontStyle: 'italic', textAlign: 'center', marginBottom: 16,
    paddingHorizontal: 12,
  },
  transmissionFooter: { flexDirection: 'row', gap: 16, flexWrap: 'wrap', justifyContent: 'center' },
  transmissionBullet: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  transmissionDot: { width: 6, height: 6, borderRadius: 3 },
  transmissionDotBlood: { backgroundColor: colors.bloodReel },
  transmissionDotSepia: { backgroundColor: colors.sepia },
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
  dailyFrameImg: { width: '100%', height: '100%', contentFit: 'cover' },
  dailyFrameCaption: { position: 'absolute', bottom: 12, left: 14, right: 14 },
  dailyFrameTitle: { fontFamily: fonts.display, fontSize: 18, color: colors.parchment, lineHeight: 22, marginBottom: 4 },
  dailyFrameMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  dailyFrameViewRow: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  dailyFrameMeta: { fontFamily: fonts.ui, fontSize: 8, letterSpacing: 1.5, color: colors.sepia },

  // ── Wire ──
  wireLead: {
    borderWidth: 1, borderColor: 'rgba(139,105,20,0.2)',
    overflow: 'hidden', marginBottom: 20, borderRadius: 2,
  },
  wireLeadImgWrap: { width: '100%', aspectRatio: 16 / 9, overflow: 'hidden' },
  wireLeadImg: { width: '100%', height: '100%', contentFit: 'cover' },
  wireLeadBody: { padding: 16 },
  wireLeadTitle: { fontFamily: fonts.display, fontSize: 20, color: colors.parchment, lineHeight: 24, marginBottom: 8 },
  wireLeadExcerpt: { fontFamily: fonts.body, fontSize: 13, lineHeight: 20, color: colors.bone, opacity: 0.7, marginBottom: 10 },
  wireCategory: { fontFamily: fonts.mono, fontWeight: '700', fontSize: 8, letterSpacing: 2.5, color: colors.sepia, marginBottom: 6, opacity: 0.9 },
  wireTitle: { fontFamily: fonts.display, fontSize: 15, color: colors.parchment, lineHeight: 18, marginBottom: 6 },
  wireExcerpt: { fontFamily: fonts.mono, fontSize: 11, lineHeight: 18, color: colors.bone, opacity: 0.7, marginBottom: 8 },
  wireMeta: { fontFamily: fonts.mono, fontSize: 8, letterSpacing: 1.5, color: colors.sepia, opacity: 0.8 },
  wireItem: {
    paddingVertical: 18,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(139,105,20,0.2)',
    borderStyle: 'dashed',
  },
  wireItemInner: { flex: 1 },
  wireLoader: {
    textAlign: 'center', fontFamily: fonts.mono, fontSize: 10, letterSpacing: 2,
    color: colors.sepia, opacity: 0.6, paddingVertical: 24, fontWeight: '700'
  },

  // ── Buster Note ──
  busterNote: { 
    marginTop: 32,
    borderWidth: 1.5,
    borderColor: 'rgba(139,105,20,0.2)',
    borderStyle: 'dashed',
    padding: 20,
    backgroundColor: 'rgba(8,6,4,0.98)',
    ...effects.shadowSurface,
  },
  busterRuleTop: { borderTopWidth: 3, borderTopColor: 'rgba(139,105,20,0.2)', borderStyle: 'solid', marginBottom: 20 },
  busterContent: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  busterAvatar: { opacity: 0.8 },
  busterTextWrap: { flex: 1 },
  busterLabel: { fontFamily: fonts.mono, fontWeight: '700', fontSize: 9, letterSpacing: 2.5, color: colors.sepia, marginBottom: 8 },
  busterQuote: {
    fontFamily: fonts.mono, fontSize: 12, lineHeight: 20,
    color: colors.bone, fontStyle: 'italic', opacity: 0.8,
  },

  // ── Footer ──
  footer: { alignItems: 'center', marginTop: 32 },
  footerMark: { fontFamily: fonts.mono, fontWeight: '700', fontSize: 10, letterSpacing: 4, color: colors.sepia, opacity: 0.6, marginBottom: 6 },
  footerHeritage: { fontFamily: fonts.mono, fontSize: 8, letterSpacing: 3, color: colors.sepia, opacity: 0.5, marginBottom: 8 },
  footerCopyright: { fontFamily: fonts.mono, fontSize: 10, color: colors.bone, opacity: 0.4, textAlign: 'center' },

  // ── Empty ──
  emptyState: { alignItems: 'center', paddingVertical: 32, gap: 12 },
  emptyTitle: { fontFamily: fonts.display, fontSize: 16, color: colors.parchment, opacity: 0.6, textAlign: 'center', marginBottom: 4 },
  emptySub: { fontFamily: fonts.mono, fontSize: 12, color: colors.bone, opacity: 0.5, fontStyle: 'italic', textAlign: 'center', lineHeight: 18, maxWidth: 260 },

  // ── Skeleton ──
  skeleton: {
    backgroundColor: 'rgba(8,6,4,0.98)', borderRadius: 2,
    padding: 20, borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(139,105,20,0.2)',
  },
  shimmer: { backgroundColor: 'rgba(139,105,20,0.06)', borderRadius: 2 },
  shimmerSm: { width: '35%', height: 8 },
  shimmerLg: { width: '80%', height: 20, marginTop: 10 },
  shimmerMd: { width: '60%', height: 12, marginTop: 10 },
  skeletonGroup: { gap: 16, marginBottom: 32 },
  dossierList: { gap: 24, marginBottom: 16 },
  wireList: { gap: 0 },

  // ── Article Reader Modal ──
  readerOverlay: {
    flex: 1, backgroundColor: 'rgba(8,6,4,0.98)',
  },
  readerScroll: { flex: 1 },
  readerScrollContent: {
    paddingHorizontal: 24, paddingBottom: 60,
  },
  readerClose: {
    position: 'absolute', top: 16, right: 20, zIndex: 10,
    padding: 8,
  },
  readerWatermark: {
    fontFamily: fonts.mono, fontWeight: '700', fontSize: 10, letterSpacing: 4,
    color: colors.sepia, opacity: 0.6, textAlign: 'center', marginBottom: 28,
  },
  readerTitle: {
    fontFamily: fonts.display, fontSize: 30, color: colors.parchment,
    textAlign: 'center', lineHeight: 34, marginBottom: 16, ...effects.textGlowSepia,
  },
  readerByline: {
    fontFamily: fonts.mono, fontSize: 10, letterSpacing: 2,
    color: colors.bone, opacity: 0.7, textAlign: 'center', marginBottom: 16,
  },
  readerBylineAuthor: { color: colors.sepia, fontWeight: '700' },
  readerStats: {
    flexDirection: 'row', justifyContent: 'center', gap: 20,
    paddingTop: 12, borderTopWidth: 2, borderTopColor: 'rgba(139,105,20,0.2)',
    borderStyle: 'dashed',
  },
  readerStatRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  readerStatText: { fontFamily: fonts.mono, fontSize: 9, letterSpacing: 1.5, color: colors.fog, fontWeight: '700' },
  readerStatCertified: { color: colors.sepia },
  readerSep: {
    height: 2, backgroundColor: 'rgba(139,105,20,0.3)',
    marginVertical: 28, width: 80, alignSelf: 'center',
  },
  readerBody: {
    fontFamily: fonts.mono, fontSize: 14, lineHeight: 28,
    color: '#D1CBB8', marginBottom: 24, letterSpacing: 0.2, fontWeight: '500',
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
  tabBarSpacer: { height: 120 },
});
