import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TextInput,
  Modal, KeyboardAvoidingView, Platform, Switch, Dimensions,
  RefreshControl, ActivityIndicator,
} from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import Animated, {
  FadeInDown, FadeIn, FadeInUp, SlideInDown, SlideOutDown,
  useSharedValue, useAnimatedStyle, withRepeat, withTiming, Easing, cancelAnimation,
} from 'react-native-reanimated';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Path, Rect, Defs, LinearGradient as SvgLinearGradient, Stop } from 'react-native-svg';
import * as Haptics from 'expo-haptics';
import {
  Search, Plus, Lock, Users, Globe, X, MessageCircle,
  Sparkles, ChevronRight, Film as FilmIcon, Eye,
} from 'lucide-react-native';
import { useLoungeStore, LoungeRoom } from '@/src/stores/lounge';
import { useAuthStore } from '@/src/stores/auth';
import { colors, fonts, effects } from '@/src/theme/theme';
import { tmdb } from '@/src/lib/tmdb';
import PressableScale from '@/src/components/PressableScale';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const { width: SCREEN_W } = Dimensions.get('window');
const JOINED_CARD_W = SCREEN_W * 0.42;

/** Warm sepia-toned blurhash — used as placeholder while images load */
const SEPIA_HASH = 'LGF5]+Yk^6#M@-5c,1J5@[or[Q6.';

const AnimatedView = Animated.createAnimatedComponent(View);

// ════════════════════════════════════════════════════════════
// ORNAMENTAL DIVIDER — Cinematic rules with center motif
// ════════════════════════════════════════════════════════════
function OrnamentalRule() {
  return (
    <View style={s.ornRule}>
      <Svg width="100%" height="12" viewBox="0 0 300 12" preserveAspectRatio="none">
        <Defs>
          <SvgLinearGradient id="g-lounge" x1="0" y1="0" x2="1" y2="0">
            <Stop offset="0" stopColor={colors.sepia} stopOpacity="0" />
            <Stop offset="0.3" stopColor={colors.sepia} stopOpacity="0.4" />
            <Stop offset="0.5" stopColor={colors.sepia} stopOpacity="0.8" />
            <Stop offset="0.7" stopColor={colors.sepia} stopOpacity="0.4" />
            <Stop offset="1" stopColor={colors.sepia} stopOpacity="0" />
          </SvgLinearGradient>
        </Defs>
        <Rect x="0" y="5.5" width="300" height="0.5" fill="url(#g-lounge)" />
        <Path d="M150 0 L156 6 L150 12 L144 6 Z" fill={colors.sepia} opacity="0.8" />
        <Path d="M135 4 L139 6 L135 8 L131 6 Z" fill={colors.sepia} opacity="0.4" />
        <Path d="M165 4 L169 6 L165 8 L161 6 Z" fill={colors.sepia} opacity="0.4" />
      </Svg>
    </View>
  );
}

// ════════════════════════════════════════════════════════════
// BREATHING GLOW — Subtle ambient pulse on the header crest
// ════════════════════════════════════════════════════════════
function CrestGlow() {
  const glow = useSharedValue(0.1);

  useEffect(() => {
    glow.value = withRepeat(
      withTiming(0.9, { duration: 1500, easing: Easing.inOut(Easing.ease) }),
      -1, true
    );
    return () => cancelAnimation(glow);
  }, []);

  const glowStyle = useAnimatedStyle(() => ({
    opacity: glow.value,
  }));

  return (
    <AnimatedView style={[s.crestGlow, glowStyle]}>
      <View style={s.crestGlowInner} />
    </AnimatedView>
  );
}

// ════════════════════════════════════════════════════════════
// LOUNGE GATE — Members-only velvet rope
// ════════════════════════════════════════════════════════════
function LoungeGate() {
  const router = useRouter();
  return (
    <View style={s.gateContainer}>
      <AnimatedView entering={FadeInDown.duration(900).delay(200)} style={s.gateCard}>
        {/* Crest */}
        <View style={s.gateCrestWrap}>
          <CrestGlow />
          <View style={s.gateCrest}>
            <Eye size={28} color={colors.sepia} strokeWidth={1} />
          </View>
        </View>

        <Text style={s.gateTitle} accessibilityRole="header">The Lounge</Text>
        <Text style={s.gateEst}>EST. 1924</Text>
        <OrnamentalRule />

        <Text style={[s.gateSub, { fontFamily: fonts.mono, letterSpacing: 4 }]}>[ CLEARANCE REQUIRED ]</Text>

        <Text style={s.gateDesc}>
          Beyond this door lies The Lounge — intimate cinema
          salons where the devoted gather to discuss, debate,
          and discover. Private screening rooms. Whispered
          critiques. {"\n\n"}A place where cinema lives between the frames,
          and every conversation is a love letter to the art.
        </Text>

        <PressableScale
          style={s.gateCta}
          onPress={() => router.push('/membership')}
          haptic="medium"
          accessibilityRole="button" accessibilityLabel="Become an Archivist to access The Lounge"
        >
          <Sparkles size={11} color={colors.ink} strokeWidth={2} />
          <Text style={s.gateCtaText} numberOfLines={1}>BECOME AN ARCHIVIST</Text>
        </PressableScale>

        <Text style={s.gateFootnote}>
          PRIVATE SCREENING ROOMS / PUBLIC SALONS / CINEMA DISCOURSE
        </Text>
      </AnimatedView>
    </View>
  );
}

// ════════════════════════════════════════════════════════════
// CREATE LOUNGE SHEET
// ════════════════════════════════════════════════════════════
function CreateLoungeSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [isPrivate, setIsPrivate] = useState(false);
  const [creating, setCreating] = useState(false);
  const createLounge = useLoungeStore(s => s.createLounge);

  const handleCreate = async () => {
    if (!name.trim()) return;
    setCreating(true);
    const id = await createLounge(name.trim(), description.trim(), isPrivate);
    setCreating(false);
    if (id) {
      setName('');
      setDescription('');
      setIsPrivate(false);
      onClose();
      router.push(`/lounge/${id}`);
    }
  };

  if (!visible) return null;

  return (
    <Modal transparent visible animationType="fade" onRequestClose={onClose}>
      <KeyboardAvoidingView style={s.sheetKeyboard} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <BlurView intensity={90} tint="dark" style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(5,3,1,0.6)' }]}>
          <PressableScale style={s.sheetBackdrop} onPress={onClose} />
        </BlurView>

        <AnimatedView entering={SlideInDown.duration(350).easing(Easing.out(Easing.cubic))} exiting={SlideOutDown.duration(250)} style={[s.sheet, { paddingBottom: Math.max(insets.bottom + 20, 24) }]}>
          <View style={s.sheetHandle} />

          <View style={s.sheetHeaderWrap}>
            <Text style={s.sheetEyebrow}>[ SUBMIT DESK LEDGER ]</Text>
            <Text style={s.sheetTitle}>Establish Parameter</Text>
          </View>

          <View style={s.field}>
            <Text style={s.fieldLabel}>LOUNGE NAME</Text>
            <TextInput
              style={s.fieldInput}
              placeholder="e.g., The Noir Corner..."
              placeholderTextColor={colors.fog}
              value={name}
              onChangeText={setName}
              maxLength={60}
              selectionColor={colors.sepia}
            />
            <Text style={s.fieldCharCount}>{name.length}/60</Text>
          </View>

          <View style={s.field}>
            <Text style={s.fieldLabel}>DESCRIPTION</Text>
            <TextInput
              style={[s.fieldInput, s.fieldTextarea]}
              placeholder="What kind of cinema lovers belong here?"
              placeholderTextColor={colors.fog}
              value={description}
              onChangeText={setDescription}
              maxLength={300}
              multiline
              selectionColor={colors.sepia}
            />
            <Text style={s.fieldCharCount}>{description.length}/300</Text>
          </View>

          <View style={s.toggleRow}>
            <View style={s.toggleInfo}>
              <View style={s.toggleLabelRow}>
                {isPrivate
                  ? <Lock size={12} color={colors.sepia} strokeWidth={1.5} />
                  : <Globe size={12} color={colors.fog} strokeWidth={1.5} />
                }
                <Text style={s.toggleLabel}>
                  {isPrivate ? 'PRIVATE SCREENING ROOM' : 'PUBLIC SALON'}
                </Text>
              </View>
              <Text style={s.toggleDesc}>
                {isPrivate ? 'Invite-only via code' : 'Anyone with Archivist+ can join'}
              </Text>
            </View>
            <Switch
              value={isPrivate}
              onValueChange={(val) => { Haptics.selectionAsync(); setIsPrivate(val); }}
              trackColor={{ false: colors.ash, true: colors.sepia }}
              thumbColor={colors.parchment}
              ios_backgroundColor={colors.ash}
            />
          </View>

          <View style={s.sheetActions}>
            <PressableScale style={s.sheetBtnGhost} onPress={onClose} disabled={creating} haptic="selection">
              <Text style={s.sheetBtnGhostText} numberOfLines={1}>[ ABORT ]</Text>
            </PressableScale>
            <PressableScale
              style={[s.sheetBtnPrimary, (!name.trim() || creating) && s.sheetBtnDisabled]}
              onPress={handleCreate}
              disabled={!name.trim() || creating}
              haptic="medium"
            >
              {creating
                ? <ActivityIndicator size="small" color={colors.ink} />
                : <Text style={s.sheetBtnPrimaryText} numberOfLines={1}>[ INITIATE ]</Text>
              }
            </PressableScale>
          </View>
        </AnimatedView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ════════════════════════════════════════════════════════════
// JOINED LOUNGE CARD — Premium horizontal poster card
// ════════════════════════════════════════════════════════════
const JoinedLoungeCard = React.memo(({ lounge, index }: { lounge: LoungeRoom; index: number }) => {
  const router = useRouter();
  const pulse = useSharedValue(0.4);

  useEffect(() => {
    pulse.value = withRepeat(
      withTiming(1, { duration: 1200, easing: Easing.inOut(Easing.ease) }),
      -1, true
    );
    return () => cancelAnimation(pulse);
  }, []);

  const pulseStyle = useAnimatedStyle(() => ({ opacity: pulse.value }));

  const coverUrl = lounge.cover_image
    ? tmdb.backdrop(lounge.cover_image, 'w500')
    : null;
  const hasUnread = Boolean(lounge.unread_count && lounge.unread_count > 0);

  return (
    <View>
      <PressableScale
        style={s.joinedCard}
        onPress={() => router.push(`/lounge/${lounge.id}`)}
        haptic="light"
        accessibilityRole="button"
        accessibilityLabel={`Enter screening room ${lounge.name}`}
      >
        {/* Cover or atmospheric placeholder */}
        <View style={s.joinedImgWrap}>
          {coverUrl ? (
            <Image source={{ uri: coverUrl }} style={s.joinedImg} contentFit="cover" cachePolicy="memory-disk" placeholder={{ blurhash: SEPIA_HASH }} transition={300} />
          ) : (
            <LinearGradient
              colors={['rgba(196,150,26,0.06)', 'rgba(11,10,8,0.95)']}
              style={s.joinedImgPlaceholder}
            >
              <FilmIcon size={22} color={colors.sepia} strokeWidth={1} />
            </LinearGradient>
          )}

          {/* Cinematic gradient overlay */}
          <LinearGradient
            colors={['transparent', 'rgba(11,10,8,0.85)']}
            style={s.joinedGradient}
          />

          {/* Unread pulse */}
          {hasUnread && <AnimatedView style={[s.unreadDot, pulseStyle]} />}

          {/* Embedded name overlay */}
          <View style={s.joinedNameOverlay}>
            <Text style={s.joinedNameText} numberOfLines={2}>{lounge.name}</Text>
            <View style={s.joinedMetaRow}>
              <Users size={10} color={colors.fog} strokeWidth={1.5} />
              <Text style={s.joinedMetaText} numberOfLines={1}>
                {lounge.member_count || 0}
              </Text>
              {lounge.is_private && (
                <>
                  <View style={s.joinedMetaLine} />
                  <Lock size={10} color={colors.sepia} strokeWidth={1.5} />
                </>
              )}
            </View>
          </View>
        </View>
      </PressableScale>
    </View>
  );
});

// ════════════════════════════════════════════════════════════
// PUBLIC LOUNGE CARD — Cinematic list entry
// ════════════════════════════════════════════════════════════
const PublicLoungeCard = React.memo(({ lounge, index }: { lounge: LoungeRoom; index: number }) => {
  const router = useRouter();
  const coverUrl = lounge.cover_image
    ? tmdb.backdrop(lounge.cover_image, 'w500')
    : null;

  return (
    <View>
      <PressableScale
        style={s.publicCard}
        onPress={() => router.push(`/lounge/${lounge.id}`)}
        haptic="light"
        accessibilityRole="button"
        accessibilityLabel={`Enter salon ${lounge.name}${lounge.is_private ? ', approval required' : ''}`}
      >
        <View style={s.publicAccentBar} />
        
        {coverUrl && (
          <View style={s.publicImgTop}>
            <Image source={{ uri: coverUrl }} style={s.publicImgContent} contentFit="cover" cachePolicy="memory-disk" placeholder={{ blurhash: SEPIA_HASH }} transition={300} />
            <LinearGradient
              colors={['transparent', 'rgba(255,255,255,0.015)']}
              style={StyleSheet.absoluteFillObject}
            />
          </View>
        )}

        <View style={s.publicBody}>
          <Text style={s.publicName} numberOfLines={2}>{lounge.name}</Text>
          {lounge.is_private && (
            <View style={s.publicPrivateBadge}>
              <Lock size={10} color={colors.sepia} strokeWidth={1.5} />
              <Text style={s.publicPrivateText}>APPROVAL REQUIRED</Text>
            </View>
          )}
          <Text style={s.publicDesc} numberOfLines={3}>
            {lounge.description || 'A cinematic gathering place.'}
          </Text>
          
          <View style={s.publicFooter}>
            <View style={s.publicMetaRow}>
              <Users size={12} color={colors.fog} strokeWidth={1.5} />
              <Text style={s.publicMetaText} numberOfLines={1}>{lounge.member_count || 0} SEATS TAKEN</Text>
            </View>
            <View style={s.publicEnterTag}>
              <Text style={[s.publicEnterText, { flexShrink: 1 }]} numberOfLines={1}>
                {lounge.is_private ? '[ REQUEST INTELLIGENCE ]' : '[ GRANT ACCESS ]'}
              </Text>
              {lounge.is_private 
                ? <Lock size={12} color={colors.sepia} strokeWidth={2} />
                : <ChevronRight size={12} color={colors.sepia} strokeWidth={2} />
              }
            </View>
          </View>
        </View>
      </PressableScale>
    </View>
  );
});

// ════════════════════════════════════════════════════════════
// EMPTY STATE — "The Velvet Seats Await"
// ════════════════════════════════════════════════════════════
function EmptyMyLounges() {
  return (
    <AnimatedView entering={FadeInDown.duration(600).delay(200)} style={s.emptyHero}>
      <View style={s.emptyCrestWrap}>
        <MessageCircle size={32} color={colors.sepia} strokeWidth={1} />
      </View>
      <Text style={s.emptyTitle}>The Velvet Seats Await</Text>
      <OrnamentalRule />
      <Text style={s.emptyDesc}>
        Every great filmmaker started with a conversation.{'\n'}
        Open your own screening room or take a seat{'\n'}
        in a public salon below.
      </Text>
    </AnimatedView>
  );
}

// ════════════════════════════════════════════════════════════
// MAIN LOUNGE SCREEN
// ════════════════════════════════════════════════════════════
export default function LoungeScreen() {
  const user = useAuthStore(s => s.user);
  const isAuthenticated = useAuthStore(s => s.isAuthenticated);
  const { lounges, fetchLounges, loading } = useLoungeStore();

  const [searchQuery, setSearchQuery] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [inviteCode, setInviteCode] = useState('');
  const [joining, setJoining] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const isArchivist = user?.role === 'archivist' || user?.role === 'auteur';
  const isPollingRef = useRef(false);

  useEffect(() => {
    if (isAuthenticated && isArchivist) {
      fetchLounges();
      const interval = setInterval(async () => {
        if (isPollingRef.current) return;
        isPollingRef.current = true;
        await fetchLounges();
        isPollingRef.current = false;
      }, 30000);
      return () => clearInterval(interval);
    }
  }, [isAuthenticated, isArchivist, fetchLounges]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchLounges();
    setRefreshing(false);
  }, []);

  const handleJoinByCode = async () => {
    if (!inviteCode.trim()) return;
    setJoining(true);
    const success = await useLoungeStore.getState().joinLounge(inviteCode.trim());
    setJoining(false);
    if (success) setInviteCode('');
  };

  if (!isAuthenticated || !isArchivist) {
    return <LoungeGate />;
  }

  const query = searchQuery.toLowerCase().trim();
  const filteredLounges = lounges.filter(l =>
    l.name.toLowerCase().includes(query) ||
    (l.description && l.description.toLowerCase().includes(query))
  );
  const myLounges = filteredLounges.filter(l => typeof l.unread_count === 'number');
  const browsableLounges = filteredLounges.filter(l => typeof l.unread_count !== 'number');

  return (
    <View style={s.container}>
      {/* ── Cinematic Header ── */}
      <AnimatedView entering={FadeIn.duration(700)} style={s.header}>
        {/* Crest and title lockup */}
        <View style={s.headerCrestRow}>
          <View style={s.headerCrest}>
            <Eye size={18} color={colors.sepia} strokeWidth={1} />
          </View>
        </View>

        <Text style={s.headerTitle}>The Lounge</Text>
        <Text style={s.headerEst}>EST. 1924</Text>
        <Text style={s.headerSubtitle}>Where cinema lives between the frames.</Text>

        <View style={s.headerOrnRow}>
          <View style={s.headerOrnLine} />
          <Text style={s.headerExclusive}>ARCHIVIST EXCLUSIVE</Text>
          <View style={s.headerOrnLine} />
        </View>

        {/* Search */}
        <View style={s.searchWrap}>
          <Search size={14} color={colors.fog} strokeWidth={1.5} />
          <TextInput
            style={s.searchInput}
            placeholder="[ ENTER SURVEILLANCE PARAMETERS ]"
            placeholderTextColor={colors.fog}
            value={searchQuery}
            onChangeText={setSearchQuery}
            maxLength={120}
            selectionColor={colors.sepia}
          />
          {searchQuery.length > 0 && (
            <PressableScale onPress={() => setSearchQuery('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} haptic="selection">
              <X size={14} color={colors.fog} strokeWidth={1.5} />
            </PressableScale>
          )}
        </View>

        {/* Actions */}
        <View style={s.actionsRow}>
          <PressableScale
            style={s.btnPrimary}
            onPress={() => setShowCreate(true)}
            haptic="medium"
          >
            <Plus size={13} color={colors.ink} strokeWidth={2.5} />
            <Text style={s.btnPrimaryText}>[ ESTABLISH ]</Text>
          </PressableScale>
          <View style={s.inviteWrap}>
            <TextInput
              style={s.inviteInput}
              placeholder="CODE"
              placeholderTextColor={colors.fog}
              maxLength={8}
              autoCapitalize="characters"
              value={inviteCode}
              onChangeText={(t) => setInviteCode(t.toUpperCase())}
              selectionColor={colors.sepia}
            />
            <PressableScale
              style={[s.btnJoin, (!inviteCode.trim() || joining) && s.btnJoinDisabled]}
              onPress={handleJoinByCode}
              disabled={!inviteCode.trim() || joining}
              haptic="medium"
            >
              {joining
                ? <ActivityIndicator size="small" color={colors.parchment} />
                : <Text style={s.btnJoinText} numberOfLines={1}>[ INFILTRATE ]</Text>
              }
            </PressableScale>
          </View>
        </View>
      </AnimatedView>

      {/* ── Body ── */}
      <ScrollView
        style={s.scrollView}
        contentContainerStyle={s.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.sepia} />
        }
      >
        {/* Loading */}
        {loading && lounges.length === 0 && (
          <View style={s.loadingWrap}>
            <ActivityIndicator size="small" color={colors.sepia} />
            <Text style={s.loadingText}>RETRIEVING SALONS</Text>
          </View>
        )}

        {/* My Screening Rooms */}
        {myLounges.length > 0 ? (
          <View style={s.section}>
            <View style={s.sectionTitleRow}>
              <View style={s.sectionTitleLine} />
              <Text style={s.sectionLabel}>YOUR SCREENING ROOMS</Text>
              <View style={s.sectionTitleLine} />
            </View>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={s.joinedStrip}
            >
              {myLounges.map((l, i) => (
                <JoinedLoungeCard key={`my-${l.id}`} lounge={l} index={i} />
              ))}
            </ScrollView>
          </View>
        ) : (
          !loading && !searchQuery && <EmptyMyLounges />
        )}

        {/* Public Salons */}
        <View style={s.section}>
          <View style={s.sectionTitleRow}>
            <View style={s.sectionTitleLine} />
            <Text style={s.sectionLabel}>ALL SALONS</Text>
            <View style={s.sectionTitleLine} />
          </View>
          <Text style={s.sectionSubtext}>Public discourse and private gatherings. Take a seat.</Text>
          <View style={s.publicList}>
            {browsableLounges.length > 0 ? (
              browsableLounges.map((l, i) => (
                <PublicLoungeCard key={`pub-${l.id}`} lounge={l} index={i} />
              ))
            ) : (
              <View style={s.emptyPublic}>
                <Globe size={22} color={colors.fog} strokeWidth={1} />
                <Text style={s.emptyPublicText}>No open salons at this time.</Text>
                <Text style={s.emptyPublicHint}>Be the first to open one.</Text>
              </View>
            )}
          </View>
        </View>
      </ScrollView>

      {/* ── Create Sheet ── */}
      <CreateLoungeSheet visible={showCreate} onClose={() => setShowCreate(false)} />
    </View>
  );
}

// ════════════════════════════════════════════════════════════
// STYLES — Nitrate Noir Lounge Edition
// ════════════════════════════════════════════════════════════
const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.ink },

  // ── Ornamental ──
  ornRule: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginVertical: 14,
  },
  ornLine: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.sepia,
    opacity: 0.3,
  },

  // ── Crest ──
  crestGlow: {
    position: 'absolute',
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: 'rgba(196,150,26,0.08)',
  },
  crestGlowInner: {
    flex: 1,
    borderRadius: 50,
    backgroundColor: 'rgba(196,150,26,0.04)',
  },

  // ── Gate ──
  gateContainer: {
    flex: 1,
    backgroundColor: colors.ink,
    justifyContent: 'center',
    paddingHorizontal: 36,
  },
  gateCard: {
    alignItems: 'center',
  },
  gateCrestWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 28,
  },
  gateCrest: {
    width: 72,
    height: 72,
    borderRadius: 36,
    borderWidth: 1,
    borderColor: 'rgba(196,150,26,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(196,150,26,0.03)',
  },
  gateTitle: {
    fontFamily: fonts.display,
    fontSize: 24,
    color: colors.parchment,
    marginBottom: 6,
  },
  gateEst: {
    fontFamily: fonts.uiMedium,
    fontSize: 8,
    letterSpacing: 6,
    color: colors.sepia,
    marginBottom: 4,
    opacity: 0.7,
  },
  gateSub: {
    fontFamily: fonts.uiMedium,
    fontSize: 8, // to 8
    letterSpacing: 3,
    color: colors.sepia,
    marginBottom: 20,
  },
  gateDesc: {
    fontFamily: fonts.body,
    fontSize: 11,
    color: colors.bone,
    lineHeight: 18,
    textAlign: 'center',
    marginBottom: 32,
    opacity: 0.8,
  },
  gateCta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.sepia,
    paddingVertical: 15,
    paddingHorizontal: 36,
    borderRadius: 2,
    marginBottom: 28,
  },
  gateCtaText: {
    fontFamily: fonts.uiBold,
    fontSize: 9,
    letterSpacing: 2.5,
    color: colors.ink,
  },
  gateFootnote: {
    fontFamily: fonts.uiMedium,
    fontSize: 7,
    letterSpacing: 3,
    color: colors.fog,
    opacity: 0.4,
    textAlign: 'center',
  },

  // ── Header ──
  header: {
    paddingTop: Platform.OS === 'ios' ? 56 : 44,
    paddingHorizontal: 20,
    paddingBottom: 18,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.ash,
    alignItems: 'center',
  },
  headerCrestRow: {
    marginBottom: 10,
  },
  headerCrest: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(196,150,26,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(196,150,26,0.03)',
  },
  headerTitle: {
    fontFamily: fonts.display,
    fontSize: 24,
    color: colors.parchment,
    textAlign: 'center',
    lineHeight: 28,
  },
  headerEst: {
    fontFamily: fonts.uiMedium,
    fontSize: 7,
    letterSpacing: 6,
    color: colors.sepia,
    opacity: 0.6,
    marginTop: 2,
    marginBottom: 4,
    textAlign: 'center',
  },
  headerSubtitle: {
    fontFamily: fonts.bodyItalic,
    fontSize: 10,
    color: colors.bone,
    opacity: 0.6,
    textAlign: 'center',
    marginBottom: 10,
  },
  headerOrnRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 16,
    alignSelf: 'stretch',
  },
  headerOrnLine: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.ash,
  },
  headerExclusive: {
    fontFamily: fonts.uiMedium,
    fontSize: 7,
    letterSpacing: 4,
    color: colors.sepia,
    opacity: 0.6,
  },

  // ── Search ──
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'stretch',
    backgroundColor: 'rgba(5,4,3,0.95)',
    borderRadius: 2,
    paddingHorizontal: 14,
    height: 46,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: 'rgba(139,105,20,0.3)',
    gap: 10,
  },
  searchInput: {
    flex: 1,
    fontFamily: fonts.mono,
    fontWeight: '700',
    fontSize: 10,
    color: colors.parchment,
    letterSpacing: 2,
  },

  // ── Actions ──
  actionsRow: {
    flexDirection: 'row',
    marginTop: 12,
    gap: 8,
    alignSelf: 'stretch',
  },
  btnPrimary: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    backgroundColor: colors.sepia,
    borderRadius: 2,
    borderWidth: 1,
    borderColor: colors.sepia,
    height: 46,
    ...effects.shadowSurface,
  },
  btnPrimaryText: {
    fontFamily: fonts.mono,
    fontWeight: '700',
    fontSize: 10,
    letterSpacing: 2.5,
    color: colors.ink,
  },
  inviteWrap: {
    flexDirection: 'row',
    flex: 1,
    gap: 6,
  },
  inviteInput: {
    flex: 1,
    backgroundColor: 'rgba(5,4,3,0.95)',
    borderRadius: 2,
    height: 46,
    paddingHorizontal: 12,
    fontFamily: fonts.mono,
    fontWeight: '700',
    fontSize: 10,
    color: colors.parchment,
    textAlign: 'center',
    letterSpacing: 6,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: 'rgba(139,105,20,0.3)',
  },
  btnJoin: {
    backgroundColor: colors.ash,
    paddingHorizontal: 16,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 2,
    height: 46,
    ...effects.shadowSurface,
  },
  btnJoinDisabled: { opacity: 0.35 },
  btnJoinText: {
    fontFamily: fonts.mono,
    fontWeight: '700',
    fontSize: 10,
    letterSpacing: 2.5,
    color: colors.parchment,
  },

  // ── Scroll ──
  scrollView: { flex: 1 },
  scrollContent: {
    paddingTop: 28,
    paddingBottom: 120,
  },

  // ── Loading ──
  loadingWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
    gap: 14,
  },
  loadingText: {
    fontFamily: fonts.uiMedium,
    fontSize: 8,
    letterSpacing: 4,
    color: colors.fog,
  },

  // ── Sections ──
  section: {
    marginBottom: 36,
  },
  sectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    gap: 12,
    marginBottom: 6,
  },
  sectionTitleLine: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.ash,
  },
  sectionLabel: {
    fontFamily: fonts.uiMedium,
    fontSize: 7,
    letterSpacing: 3,
    color: colors.fog,
  },
  sectionSubtext: {
    fontFamily: fonts.bodyItalic,
    fontSize: 9,
    color: colors.fog,
    opacity: 0.5,
    paddingHorizontal: 20,
    marginBottom: 16,
    textAlign: 'center',
  },

  // ── Joined Cards ──
  joinedStrip: {
    gap: 16,
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 24,
  },
  joinedCard: {
    width: JOINED_CARD_W,
    borderRadius: 2,
    overflow: 'hidden',
    backgroundColor: colors.soot,
    borderWidth: 1.5,
    borderColor: 'rgba(139,105,20,0.3)',
    ...effects.shadowSurface,
    elevation: 8,
  },
  joinedImgWrap: {
    width: JOINED_CARD_W,
    height: JOINED_CARD_W * 1.35,
    overflow: 'hidden',
    position: 'relative',
  },
  joinedImg: {
    width: '100%',
    height: '100%',
  },
  joinedImgPlaceholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  joinedGradient: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: '75%',
  },
  unreadDot: {
    position: 'absolute',
    top: 10,
    right: 10,
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: colors.bloodReel,
    borderWidth: 2,
    borderColor: colors.ink,
    zIndex: 10,
  },
  joinedNameOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 12,
    paddingBottom: 14,
    paddingTop: 4,
  },
  joinedNameText: {
    fontFamily: fonts.mono,
    fontWeight: '700',
    letterSpacing: 1,
    fontSize: 14,
    color: colors.parchment,
    marginBottom: 8,
    lineHeight: 18,
  },
  joinedMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  joinedMetaText: {
    fontFamily: fonts.mono,
    fontWeight: '700',
    fontSize: 9,
    letterSpacing: 2,
    color: colors.fog,
  },
  joinedMetaLine: {
    height: 10,
    width: 1.5,
    backgroundColor: colors.ash,
  },

  // ── Public Cards ──
  publicList: {
    paddingHorizontal: 20,
    gap: 24,
  },
  publicCard: {
    padding: 24, paddingLeft: 28,
    backgroundColor: 'rgba(12,9,7,0.85)',
    borderWidth: 1.5, borderColor: 'rgba(139,105,20,0.3)', borderStyle: 'dashed',
    borderRadius: 4, position: 'relative',
    overflow: 'hidden',
    ...effects.shadowSurface,
  },
  publicAccentBar: {
    position: 'absolute', left: 0, top: 0, bottom: 0, width: 4,
    backgroundColor: colors.sepia, zIndex: 2,
  },
  publicImgTop: {
    width: '100%',
    height: 120,
    marginBottom: 20,
    borderRadius: 2,
    overflow: 'hidden',
    borderColor: 'rgba(139,105,20,0.2)',
    borderWidth: 1.5,
  },
  publicImgContent: { width: '100%', height: '100%' },
  publicBody: { flex: 1 },
  publicName: {
    fontFamily: fonts.display,
    fontSize: 22,
    color: colors.parchment,
    marginBottom: 10,
    lineHeight: 26,
  },
  publicDesc: {
    fontFamily: fonts.mono,
    fontSize: 11,
    color: colors.bone,
    lineHeight: 20,
    marginBottom: 24,
    opacity: 0.8,
  },
  publicPrivateBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 16,
    paddingVertical: 6,
    paddingHorizontal: 10,
    backgroundColor: 'rgba(196,150,26,0.04)',
    borderRadius: 2,
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderColor: 'rgba(196,150,26,0.3)',
    borderStyle: 'dashed',
  },
  publicPrivateText: {
    fontFamily: fonts.mono,
    fontWeight: '700',
    fontSize: 8,
    letterSpacing: 2.5,
    color: colors.sepia,
  },
  publicFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderTopColor: 'rgba(139,105,20,0.15)',
    paddingTop: 16,
    marginTop: 8,
  },
  publicMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  publicMetaText: {
    fontFamily: fonts.mono,
    fontWeight: '700',
    fontSize: 9,
    letterSpacing: 2.5,
    color: colors.fog,
  },
  publicEnterTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  publicEnterText: {
    fontFamily: fonts.mono,
    fontWeight: '700',
    fontSize: 9,
    letterSpacing: 2.5,
    color: colors.sepia,
  },

  // ── Empty States ──
  emptyHero: {
    alignItems: 'center',
    paddingHorizontal: 44,
    paddingVertical: 52,
    marginBottom: 8,
  },
  emptyCrestWrap: {
    width: 64,
    height: 64,
    borderRadius: 32,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(196,150,26,0.2)',
    backgroundColor: 'rgba(196,150,26,0.03)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 18,
  },
  emptyTitle: {
    fontFamily: fonts.display,
    fontSize: 15,
    color: colors.parchment,
    textAlign: 'center',
  },
  emptyDesc: {
    fontFamily: fonts.body,
    fontSize: 10,
    color: colors.fog,
    lineHeight: 16,
    textAlign: 'center',
    opacity: 0.7,
  },
  emptyPublic: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 44,
    paddingHorizontal: 24,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.ash,
    borderRadius: 4,
    gap: 8,
  },
  emptyPublicText: {
    fontFamily: fonts.bodyItalic,
    fontSize: 10,
    color: colors.fog,
  },
  emptyPublicHint: {
    fontFamily: fonts.ui,
    fontSize: 9,
    color: colors.fog,
    opacity: 0.5,
    letterSpacing: 1,
  },

  // ── Create Sheet ──
  sheetKeyboard: { flex: 1 },
  sheetBackdrop: { flex: 1 },
  sheet: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(7,5,4,0.98)',
    borderTopLeftRadius: 4,
    borderTopRightRadius: 4,
    padding: 24,
    borderWidth: 1.5,
    borderBottomWidth: 0,
    borderColor: 'rgba(139,105,20,0.3)',
    ...effects.shadowSurface,
    elevation: 20,
  },
  sheetHandle: {
    width: 48,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(139,105,20,0.2)',
    alignSelf: 'center',
    marginBottom: 24,
  },
  sheetHeaderWrap: { marginBottom: 28 },
  sheetEyebrow: {
    fontFamily: fonts.mono,
    fontWeight: '700',
    fontSize: 8,
    letterSpacing: 4,
    color: colors.fog,
    marginBottom: 8,
  },
  sheetTitle: {
    fontFamily: fonts.display,
    fontSize: 24,
    color: colors.parchment,
    letterSpacing: 1,
  },
  field: { marginBottom: 22 },
  fieldLabel: {
    fontFamily: fonts.mono,
    fontWeight: '700',
    fontSize: 9,
    letterSpacing: 3,
    color: colors.sepia,
    marginBottom: 8,
  },
  fieldInput: {
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: 'rgba(139,105,20,0.3)',
    backgroundColor: 'rgba(255,255,255,0.02)',
    paddingHorizontal: 16,
    paddingVertical: 16,
    fontFamily: fonts.mono,
    fontWeight: '700',
    fontSize: 14,
    color: colors.parchment,
    borderRadius: 2,
  },
  fieldTextarea: {
    height: 80,
    textAlignVertical: 'top',
  },
  fieldCharCount: {
    fontFamily: fonts.ui,
    fontSize: 8,
    color: colors.fog,
    opacity: 0.3,
    textAlign: 'right',
    marginTop: 4,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 28,
  },
  toggleInfo: { flex: 1, marginRight: 16 },
  toggleLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  toggleLabel: {
    fontFamily: fonts.uiMedium,
    fontSize: 10,
    letterSpacing: 1,
    color: colors.parchment,
  },
  toggleDesc: {
    fontFamily: fonts.bodyItalic,
    fontSize: 11,
    color: colors.fog,
  },
  sheetActions: {
    flexDirection: 'row',
    gap: 12,
  },
  sheetBtnGhost: {
    flex: 1,
    height: 48,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 2,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: 'rgba(139,105,20,0.3)',
  },
  sheetBtnGhostText: {
    fontFamily: fonts.mono,
    fontWeight: '700',
    fontSize: 10,
    letterSpacing: 3,
    color: colors.parchment,
  },
  sheetBtnPrimary: {
    flex: 1,
    height: 48,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 2,
    backgroundColor: colors.sepia,
    ...effects.shadowSurface,
  },
  sheetBtnPrimaryText: {
    fontFamily: fonts.mono,
    fontWeight: '700',
    fontSize: 10,
    letterSpacing: 3,
    color: colors.ink,
  },
  sheetBtnDisabled: { opacity: 0.35 },
});
