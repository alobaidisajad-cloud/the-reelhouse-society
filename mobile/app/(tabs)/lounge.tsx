import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput,
  Modal, KeyboardAvoidingView, Platform, Image, Switch, Dimensions,
  RefreshControl, ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import Animated, {
  FadeInDown, FadeIn, FadeInUp, SlideInDown, SlideOutDown,
  useSharedValue, useAnimatedStyle, withRepeat, withTiming, Easing,
} from 'react-native-reanimated';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import {
  Search, Plus, Lock, Users, Globe, X, MessageCircle,
  Sparkles, ChevronRight, Film as FilmIcon, Eye,
} from 'lucide-react-native';
import { useLoungeStore, LoungeRoom } from '@/src/stores/lounge';
import { useAuthStore } from '@/src/stores/auth';
import { colors, fonts } from '@/src/theme/theme';
import { tmdb } from '@/src/lib/tmdb';

const { width: SCREEN_W } = Dimensions.get('window');
const JOINED_CARD_W = SCREEN_W * 0.42;

const AnimatedView = Animated.createAnimatedComponent(View);

// ════════════════════════════════════════════════════════════
// ORNAMENTAL DIVIDER — Cinematic rules with center motif
// ════════════════════════════════════════════════════════════
function OrnamentalRule() {
  return (
    <View style={s.ornRule}>
      <View style={s.ornLine} />
      <Sparkles size={8} color={colors.sepia} strokeWidth={1.5} />
      <View style={s.ornLine} />
    </View>
  );
}

// ════════════════════════════════════════════════════════════
// BREATHING GLOW — Subtle ambient pulse on the header crest
// ════════════════════════════════════════════════════════════
function CrestGlow() {
  const glow = useSharedValue(0.3);

  useEffect(() => {
    glow.value = withRepeat(
      withTiming(0.8, { duration: 3000, easing: Easing.inOut(Easing.ease) }),
      -1, true
    );
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

        <Text style={s.gateTitle}>The Lounge</Text>
        <Text style={s.gateEst}>EST. 1924</Text>
        <OrnamentalRule />

        <Text style={s.gateSub}>ARCHIVIST MEMBERS ONLY</Text>

        <Text style={s.gateDesc}>
          Beyond this door lies The Lounge — intimate cinema
          salons where the devoted gather to discuss, debate,
          and discover. Private screening rooms. Whispered
          critiques. A place where cinema lives between the frames,
          and every conversation is a love letter to the art.
        </Text>

        <TouchableOpacity
          style={s.gateCta}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            router.push('/settings');
          }}
          activeOpacity={0.8}
        >
          <Sparkles size={11} color={colors.ink} strokeWidth={2} />
          <Text style={s.gateCtaText}>BECOME AN ARCHIVIST</Text>
        </TouchableOpacity>

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
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [isPrivate, setIsPrivate] = useState(false);
  const [creating, setCreating] = useState(false);
  const createLounge = useLoungeStore(s => s.createLounge);

  const handleCreate = async () => {
    if (!name.trim()) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
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
        <BlurView intensity={40} tint="dark" style={StyleSheet.absoluteFill}>
          <TouchableOpacity activeOpacity={1} style={s.sheetBackdrop} onPress={onClose} />
        </BlurView>

        <AnimatedView entering={SlideInDown.springify().damping(24)} exiting={SlideOutDown} style={s.sheet}>
          <View style={s.sheetHandle} />

          <View style={s.sheetHeaderWrap}>
            <Text style={s.sheetEyebrow}>CURATE YOUR CINEMA CIRCLE</Text>
            <Text style={s.sheetTitle}>Open a Lounge</Text>
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
              onValueChange={setIsPrivate}
              trackColor={{ false: colors.ash, true: colors.sepia }}
              thumbColor={colors.parchment}
              ios_backgroundColor={colors.ash}
            />
          </View>

          <View style={s.sheetActions}>
            <TouchableOpacity style={s.sheetBtnGhost} onPress={onClose} disabled={creating} activeOpacity={0.7}>
              <Text style={s.sheetBtnGhostText}>CANCEL</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[s.sheetBtnPrimary, (!name.trim() || creating) && s.sheetBtnDisabled]}
              onPress={handleCreate}
              disabled={!name.trim() || creating}
              activeOpacity={0.8}
            >
              {creating
                ? <ActivityIndicator size="small" color={colors.ink} />
                : <Text style={s.sheetBtnPrimaryText}>OPEN LOUNGE</Text>
              }
            </TouchableOpacity>
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
  const coverUrl = (lounge as any).cover_image
    ? tmdb.backdrop((lounge as any).cover_image, 'w500')
    : null;
  const hasUnread = Boolean(lounge.unread_count && lounge.unread_count > 0);

  return (
    <AnimatedView entering={FadeInUp.duration(400).delay(index * 80)}>
      <TouchableOpacity
        style={s.joinedCard}
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          router.push(`/lounge/${lounge.id}`);
        }}
        activeOpacity={0.75}
      >
        {/* Cover or atmospheric placeholder */}
        <View style={s.joinedImgWrap}>
          {coverUrl ? (
            <Image source={{ uri: coverUrl }} style={s.joinedImg} resizeMode="cover" />
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
          {hasUnread && <View style={s.unreadDot} />}

          {/* Embedded name overlay */}
          <View style={s.joinedNameOverlay}>
            <Text style={s.joinedNameText} numberOfLines={1}>{lounge.name}</Text>
            <View style={s.joinedMetaRow}>
              <Users size={8} color={colors.fog} strokeWidth={1.5} />
              <Text style={s.joinedMetaText}>
                {lounge.member_count || 0}
              </Text>
              {lounge.is_private && (
                <Lock size={8} color={colors.sepia} strokeWidth={1.5} />
              )}
            </View>
          </View>
        </View>
      </TouchableOpacity>
    </AnimatedView>
  );
});

// ════════════════════════════════════════════════════════════
// PUBLIC LOUNGE CARD — Cinematic list entry
// ════════════════════════════════════════════════════════════
const PublicLoungeCard = React.memo(({ lounge, index }: { lounge: LoungeRoom; index: number }) => {
  const router = useRouter();
  const coverUrl = (lounge as any).cover_image
    ? tmdb.backdrop((lounge as any).cover_image, 'w500')
    : null;

  return (
    <AnimatedView entering={FadeInUp.duration(350).delay(index * 60)}>
      <TouchableOpacity
        style={s.publicCard}
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          router.push(`/lounge/${lounge.id}`);
        }}
        activeOpacity={0.75}
      >
        <View style={s.publicLeft}>
          <Text style={s.publicName} numberOfLines={1}>{lounge.name}</Text>
          <Text style={s.publicDesc} numberOfLines={2}>
            {lounge.description || 'A cinematic gathering place.'}
          </Text>
          <View style={s.publicFooter}>
            <View style={s.publicMetaRow}>
              <Users size={10} color={colors.fog} strokeWidth={1.5} />
              <Text style={s.publicMetaText}>{lounge.member_count || 0} Members</Text>
            </View>
            <View style={s.publicEnterTag}>
              <Text style={s.publicEnterText}>ENTER</Text>
              <ChevronRight size={10} color={colors.sepia} strokeWidth={2} />
            </View>
          </View>
        </View>
        {coverUrl ? (
          <View style={s.publicRight}>
            <Image source={{ uri: coverUrl }} style={s.publicImg} resizeMode="cover" />
            <LinearGradient
              colors={['rgba(11,10,8,0.5)', 'transparent']}
              start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }}
              style={s.publicImgFade}
            />
          </View>
        ) : (
          <View style={s.publicRightEmpty}>
            <FilmIcon size={16} color={colors.sepia} strokeWidth={1} />
          </View>
        )}
      </TouchableOpacity>
    </AnimatedView>
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

  useEffect(() => {
    if (isAuthenticated && isArchivist) {
      fetchLounges();
      const interval = setInterval(fetchLounges, 30000);
      return () => clearInterval(interval);
    }
  }, [isAuthenticated, isArchivist]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchLounges();
    setRefreshing(false);
  }, []);

  const handleJoinByCode = async () => {
    if (!inviteCode.trim()) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
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
  const publicLounges = filteredLounges.filter(l => typeof l.unread_count !== 'number' && !l.is_private);

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
            placeholder="Search screening rooms..."
            placeholderTextColor={colors.fog}
            value={searchQuery}
            onChangeText={setSearchQuery}
            selectionColor={colors.sepia}
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <X size={14} color={colors.fog} strokeWidth={1.5} />
            </TouchableOpacity>
          )}
        </View>

        {/* Actions */}
        <View style={s.actionsRow}>
          <TouchableOpacity
            style={s.btnPrimary}
            onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setShowCreate(true); }}
            activeOpacity={0.8}
          >
            <Plus size={13} color={colors.ink} strokeWidth={2.5} />
            <Text style={s.btnPrimaryText}>OPEN ROOM</Text>
          </TouchableOpacity>
          <View style={s.inviteWrap}>
            <TextInput
              style={s.inviteInput}
              placeholder="CODE"
              placeholderTextColor={colors.fog}
              maxLength={8}
              autoCapitalize="characters"
              value={inviteCode}
              onChangeText={setInviteCode}
              selectionColor={colors.sepia}
            />
            <TouchableOpacity
              style={[s.btnJoin, (!inviteCode.trim() || joining) && s.btnJoinDisabled]}
              onPress={handleJoinByCode}
              disabled={!inviteCode.trim() || joining}
              activeOpacity={0.7}
            >
              {joining
                ? <ActivityIndicator size="small" color={colors.parchment} />
                : <Text style={s.btnJoinText}>JOIN</Text>
              }
            </TouchableOpacity>
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
            <Text style={s.sectionLabel}>OPEN SALONS</Text>
            <View style={s.sectionTitleLine} />
          </View>
          <Text style={s.sectionSubtext}>Public discourse. Take a seat.</Text>
          <View style={s.publicList}>
            {publicLounges.length > 0 ? (
              publicLounges.map((l, i) => (
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
    fontSize: 28,
    color: colors.parchment,
    marginBottom: 6,
  },
  gateEst: {
    fontFamily: fonts.uiMedium,
    fontSize: 9,
    letterSpacing: 6,
    color: colors.sepia,
    marginBottom: 4,
    opacity: 0.6,
  },
  gateSub: {
    fontFamily: fonts.uiMedium,
    fontSize: 9,
    letterSpacing: 3,
    color: colors.sepia,
    marginBottom: 20,
  },
  gateDesc: {
    fontFamily: fonts.body,
    fontSize: 12.5,
    color: colors.bone,
    lineHeight: 22,
    textAlign: 'center',
    marginBottom: 32,
    opacity: 0.7,
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
    fontSize: 10,
    letterSpacing: 2.5,
    color: colors.ink,
  },
  gateFootnote: {
    fontFamily: fonts.uiMedium,
    fontSize: 7,
    letterSpacing: 3,
    color: colors.fog,
    opacity: 0.3,
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
    fontSize: 28,
    color: colors.parchment,
    textAlign: 'center',
    lineHeight: 32,
  },
  headerEst: {
    fontFamily: fonts.uiMedium,
    fontSize: 8,
    letterSpacing: 6,
    color: colors.sepia,
    opacity: 0.5,
    marginTop: 2,
    marginBottom: 4,
    textAlign: 'center',
  },
  headerSubtitle: {
    fontFamily: fonts.bodyItalic,
    fontSize: 11.5,
    color: colors.bone,
    opacity: 0.5,
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
    opacity: 0.5,
  },

  // ── Search ──
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'stretch',
    backgroundColor: 'rgba(14,13,10,0.6)',
    borderRadius: 2,
    paddingHorizontal: 14,
    height: 40,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.ash,
    gap: 10,
  },
  searchInput: {
    flex: 1,
    fontFamily: fonts.ui,
    fontSize: 12,
    color: colors.parchment,
    letterSpacing: 0.5,
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
    height: 40,
  },
  btnPrimaryText: {
    fontFamily: fonts.uiBold,
    fontSize: 9,
    letterSpacing: 2,
    color: colors.ink,
  },
  inviteWrap: {
    flexDirection: 'row',
    flex: 1,
    gap: 6,
  },
  inviteInput: {
    flex: 1,
    backgroundColor: 'rgba(14,13,10,0.6)',
    borderRadius: 2,
    height: 40,
    paddingHorizontal: 12,
    fontFamily: fonts.uiMedium,
    fontSize: 11,
    color: colors.parchment,
    textAlign: 'center',
    letterSpacing: 4,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.ash,
  },
  btnJoin: {
    backgroundColor: colors.ash,
    paddingHorizontal: 16,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 2,
    height: 40,
  },
  btnJoinDisabled: { opacity: 0.35 },
  btnJoinText: {
    fontFamily: fonts.uiBold,
    fontSize: 9,
    letterSpacing: 2,
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
    fontSize: 8,
    letterSpacing: 3,
    color: colors.fog,
  },
  sectionSubtext: {
    fontFamily: fonts.bodyItalic,
    fontSize: 11,
    color: colors.fog,
    opacity: 0.4,
    paddingHorizontal: 20,
    marginBottom: 16,
    textAlign: 'center',
  },

  // ── Joined Cards ──
  joinedStrip: {
    gap: 14,
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 4,
  },
  joinedCard: {
    width: JOINED_CARD_W,
    borderRadius: 4,
    overflow: 'hidden',
    backgroundColor: colors.soot,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.ash,
  },
  joinedImgWrap: {
    width: JOINED_CARD_W,
    height: JOINED_CARD_W * 1.25,
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
    height: '55%',
  },
  unreadDot: {
    position: 'absolute',
    top: 10,
    right: 10,
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.sepia,
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
    paddingBottom: 12,
    paddingTop: 4,
  },
  joinedNameText: {
    fontFamily: fonts.sub,
    fontSize: 13,
    color: colors.parchment,
    marginBottom: 4,
  },
  joinedMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  joinedMetaText: {
    fontFamily: fonts.ui,
    fontSize: 9,
    letterSpacing: 0.5,
    color: colors.fog,
  },

  // ── Public Cards ──
  publicList: {
    paddingHorizontal: 20,
    gap: 10,
  },
  publicCard: {
    flexDirection: 'row',
    backgroundColor: colors.soot,
    borderRadius: 4,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.ash,
    overflow: 'hidden',
    minHeight: 96,
  },
  publicLeft: {
    flex: 1,
    paddingVertical: 14,
    paddingHorizontal: 16,
    justifyContent: 'center',
  },
  publicName: {
    fontFamily: fonts.sub,
    fontSize: 15,
    color: colors.parchment,
    marginBottom: 4,
  },
  publicDesc: {
    fontFamily: fonts.body,
    fontSize: 11.5,
    color: colors.bone,
    lineHeight: 17,
    marginBottom: 12,
    opacity: 0.6,
  },
  publicFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  publicMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  publicMetaText: {
    fontFamily: fonts.ui,
    fontSize: 9,
    letterSpacing: 0.5,
    color: colors.fog,
  },
  publicEnterTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  publicEnterText: {
    fontFamily: fonts.uiMedium,
    fontSize: 8,
    letterSpacing: 2,
    color: colors.sepia,
  },
  publicRight: {
    width: 88,
    backgroundColor: colors.ash,
    position: 'relative',
  },
  publicRightEmpty: {
    width: 88,
    backgroundColor: 'rgba(196,150,26,0.03)',
    alignItems: 'center',
    justifyContent: 'center',
    borderLeftWidth: StyleSheet.hairlineWidth,
    borderLeftColor: colors.ash,
  },
  publicImg: {
    width: '100%',
    height: '100%',
  },
  publicImgFade: {
    ...StyleSheet.absoluteFillObject,
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
    fontSize: 17,
    color: colors.parchment,
    textAlign: 'center',
  },
  emptyDesc: {
    fontFamily: fonts.body,
    fontSize: 11.5,
    color: colors.fog,
    lineHeight: 20,
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
    fontSize: 12,
    color: colors.fog,
  },
  emptyPublicHint: {
    fontFamily: fonts.ui,
    fontSize: 9,
    color: colors.fog,
    opacity: 0.4,
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
    backgroundColor: colors.soot,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: 24,
    paddingBottom: Platform.OS === 'ios' ? 44 : 28,
    borderWidth: 1,
    borderBottomWidth: 0,
    borderColor: 'rgba(196,150,26,0.12)',
  },
  sheetHandle: {
    width: 36,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: 'rgba(255,255,255,0.06)',
    alignSelf: 'center',
    marginBottom: 24,
  },
  sheetHeaderWrap: { marginBottom: 24 },
  sheetEyebrow: {
    fontFamily: fonts.uiMedium,
    fontSize: 7,
    letterSpacing: 3,
    color: colors.fog,
    marginBottom: 8,
    opacity: 0.6,
  },
  sheetTitle: {
    fontFamily: fonts.display,
    fontSize: 24,
    color: colors.parchment,
  },
  field: { marginBottom: 18 },
  fieldLabel: {
    fontFamily: fonts.uiMedium,
    fontSize: 8,
    letterSpacing: 2,
    color: colors.fog,
    marginBottom: 8,
  },
  fieldInput: {
    backgroundColor: colors.ink,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.ash,
    borderRadius: 2,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontFamily: fonts.body,
    fontSize: 13,
    color: colors.bone,
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
    height: 46,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 2,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.ash,
  },
  sheetBtnGhostText: {
    fontFamily: fonts.uiMedium,
    fontSize: 9,
    letterSpacing: 2,
    color: colors.parchment,
  },
  sheetBtnPrimary: {
    flex: 1,
    height: 46,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 2,
    backgroundColor: colors.sepia,
  },
  sheetBtnPrimaryText: {
    fontFamily: fonts.uiBold,
    fontSize: 9,
    letterSpacing: 2,
    color: colors.ink,
  },
  sheetBtnDisabled: { opacity: 0.35 },
});
