import Buster from '@/src/components/Buster';
import { ActionSheet } from '@/src/components/lounge/ActionSheet';
import { AtTheDoorPanel } from '@/src/components/lounge/AtTheDoorPanel';
import { LoungeSettingsPanel } from '@/src/components/lounge/LoungeSettingsPanel';
import { REACTION_META } from '@/src/components/lounge/reactions';
import { MasterLogo } from '@/src/components/MasterLogo';
import ReportSheet from '@/src/components/moderation/ReportSheet';
import PressableScale from '@/src/components/PressableScale';
import { useOfflineAware } from '@/src/hooks/useOfflineAware';
import { supabase } from '@/src/lib/supabase';
import { tmdb } from '@/src/lib/tmdb';
import { useAuthStore } from '@/src/stores/auth';
import { useBlockStore } from '@/src/stores/blockStore';
import { LoungeMessage, LoungeRoom, ReactionSummary, useLoungeStore } from '@/src/stores/lounge';
import { colors, fonts } from '@/src/theme/theme';
import { LoungeMember, LoungeMemberStatus } from '@/src/types/social.types';
import TactileEngine from '@/src/utils/TactileEngine';
import { safeOpenURL } from '@/src/utils/linking';
import { MAX_LENGTHS } from '@/src/utils/sanitizeInput';
import { FlashList } from '@shopify/flash-list';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
    AlertTriangle,
    ArrowLeft,
    Clock,
    DoorOpen,
    Hourglass,
    Lock,
    MinusCircle,
    Send,
    Settings,
    Sparkles,
    VolumeX,
    WifiOff,
    X,
} from 'lucide-react-native';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
    ActivityIndicator,
    AppState,
    Platform,
    StyleSheet,
    Text,
    TextInput,
    View,
} from 'react-native';
import Animated, { FadeIn, FadeInDown, FadeOut, SlideInDown, useAnimatedKeyboard, useAnimatedStyle } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const AnimatedView = Animated.createAnimatedComponent(View);

// ════════════════════════════════════════════════════════════
// LINKIFY — auto-detect URLs → safe, tappable sepia links
// ════════════════════════════════════════════════════════════
const URL_RE = /(https?:\/\/[^\s]+)/g;
function renderBody(content: string) {
  const parts = content.split(URL_RE);
  if (parts.length === 1) return content;
  return parts.map((part, i) => {
    if (i % 2 === 1) {
      // Trim trailing sentence punctuation so it isn't swallowed into the URL.
      const trimmed = part.replace(/[.,;:!?)\]]+$/, '');
      const tail = part.slice(trimmed.length);
      return (
        <Text key={i}>
          <Text style={s.link} onPress={() => safeOpenURL(trimmed)}>{trimmed}</Text>
          {tail}
        </Text>
      );
    }
    return part;
  });
}

// ════════════════════════════════════════════════════════════
// SHARED CONTENT CARD — the clipping (film / record / stack / dossier)
// Every clipping is a door: tap opens the thing itself.
// ════════════════════════════════════════════════════════════
const SHARE_LABELS: Record<string, string> = {
  film_share: 'FILM',
  log_share: 'LOG',
  list_share: 'STACK',
  dossier_share: 'DOSSIER',
};

const SharedCard = React.memo(({ msg, onOpen, onLongPress }: {
  msg: LoungeMessage;
  onOpen: (msg: LoungeMessage) => void;
  onLongPress: (msg: LoungeMessage) => void;
}) => {
  const meta = (msg.metadata ?? {}) as Record<string, unknown>;
  // Stack shares carry their title in metadata, not the film_title column.
  const title = msg.film_title || (typeof meta.title === 'string' ? meta.title : null);
  if (!title && !msg.film_id) return null;

  const typeLabel = SHARE_LABELS[msg.type] ?? msg.type.toUpperCase().replace('_SHARE', '');
  const posterUrl = msg.film_poster ? tmdb.poster(msg.film_poster, 'w342') : null;

  // One quiet attribution line, when the payload carries one.
  const byline =
    msg.type === 'dossier_share' && typeof meta.author_username === 'string'
      ? `BY @${meta.author_username.toUpperCase()}`
      : msg.type === 'log_share' && typeof meta.owner_username === 'string'
      ? `FILED BY @${meta.owner_username.toUpperCase()}`
      : msg.type === 'list_share' && typeof meta.curator === 'string'
      ? `${typeof meta.filmCount === 'number' ? `${meta.filmCount} REELS · ` : ''}@${meta.curator.toUpperCase()}`
      : null;

  return (
    <PressableScale
      style={s.sharedCard}
      onPress={() => onOpen(msg)}
      onLongPress={() => onLongPress(msg)}
      haptic="selection"
      pressedScale={0.98}
      accessibilityRole="button"
      accessibilityLabel={`Open shared ${typeLabel.toLowerCase()}${title ? `: ${title}` : ''}`}
    >
      {posterUrl ? (
        <Image source={{ uri: posterUrl }} style={s.sharedPoster} contentFit="cover" cachePolicy="memory-disk" transition={150} />
      ) : msg.type === 'dossier_share' ? (
        <View style={s.sharedGlyphSlot}>
          <Text style={s.sharedGlyph}>§</Text>
        </View>
      ) : null}
      <View style={s.sharedInfo}>
        <View style={s.sharedTypeBadge}>
          <Sparkles size={7} color={colors.sepia} strokeWidth={2} />
          <Text style={s.sharedTypeText} numberOfLines={1}>{typeLabel}</Text>
        </View>
        <Text style={s.sharedTitle} numberOfLines={2}>{title}</Text>
        {byline ? <Text style={s.sharedByline} numberOfLines={1}>{byline}</Text> : null}
      </View>
    </PressableScale>
  );
});
SharedCard.displayName = 'SharedCard';

// ════════════════════════════════════════════════════════════
// REACTION CHIPS — compact row beneath a dispatch
// ════════════════════════════════════════════════════════════
const ReactionChips = React.memo(({ reactions, onToggle }: {
  reactions: ReactionSummary[]; onToggle: (reaction: string) => void;
}) => {
  if (!reactions.length) return null;
  return (
    <View style={s.reactionRow}>
      {reactions.map(r => {
        const meta = REACTION_META[r.reaction as keyof typeof REACTION_META];
        const Icon = meta?.Icon;
        const tint = meta?.tint ?? colors.fog;
        return (
          <PressableScale
            key={r.reaction}
            style={[s.reactionChip, r.mine && s.reactionChipMine]}
            onPress={() => onToggle(r.reaction)}
            haptic="selection"
            accessibilityRole="button"
            accessibilityLabel={`${meta?.label ?? r.reaction}, ${r.count}`}
          >
            {Icon && <Icon size={11} color={r.mine ? colors.flicker : tint} strokeWidth={2} />}
            <Text style={[s.reactionChipCount, r.mine && s.reactionChipCountMine]}>{r.count}</Text>
          </PressableScale>
        );
      })}
    </View>
  );
});
ReactionChips.displayName = 'ReactionChips';

// ════════════════════════════════════════════════════════════
// DISPATCH — one transcript entry (Editorial Salon, bubble-less)
// ════════════════════════════════════════════════════════════
const Dispatch = React.memo(({ msg, isSelf, showAuthor, showDate, onLongPress, onOpenShare, onReactToggle, onRetry }: {
  msg: LoungeMessage; isSelf: boolean; showAuthor: boolean; showDate: boolean;
  onLongPress: (msg: LoungeMessage) => void;
  onOpenShare: (msg: LoungeMessage) => void;
  onReactToggle: (messageId: string, reaction: string) => void;
  onRetry: (messageId: string) => void;
}) => {
  const isWithdrawn = !!msg.deleted_at;
  const isSending = msg.status === 'sending';
  const isFailed = msg.status === 'failed';

  return (
    <View>
      {showDate && (
        <View style={s.dateDivider}>
          <View style={s.dateLine} />
          <View style={s.dateSprocket} />
          <Text style={s.dateText}>{formatDay(msg.created_at)}</Text>
          <View style={s.dateSprocket} />
          <View style={s.dateLine} />
        </View>
      )}

      <View style={[s.row, isSending && s.rowSending]}>
        {showAuthor && (
          <View style={s.authorRow}>
            {!isSelf && (
              <View style={s.authorAvatar}>
                {msg.avatar_url
                  ? <Image source={{ uri: msg.avatar_url }} style={s.authorAvatarImg} contentFit="cover" cachePolicy="memory-disk" transition={150} />
                  : <Text style={s.authorAvatarLetter}>{msg.username?.[0]?.toUpperCase()}</Text>}
              </View>
            )}
            <Text style={[s.authorName, isSelf && s.authorNameSelf]} numberOfLines={1}>
              {isSelf ? 'You' : msg.username}
            </Text>
            <Text style={s.authorTime}>
              {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </Text>
          </View>
        )}

        <View style={[s.contentCol, isSelf && s.contentColSelf]}>
          {isWithdrawn ? (
            <View style={s.tombstone}>
              <MinusCircle size={13} color={colors.fog} strokeWidth={1.5} />
              <Text style={s.tombstoneText}>dispatch withdrawn</Text>
            </View>
          ) : (
            <PressableScale onLongPress={() => onLongPress(msg)} haptic="medium" disabled={isSending || isFailed}>
              {Boolean(msg.reply_to_content) && (
                <View style={s.replyQuote}>
                  <Text style={s.replyQuoteAuthor} numberOfLines={1}>{msg.reply_to_username || 'Unknown'}</Text>
                  <Text style={s.replyQuoteContent} numberOfLines={2}>{msg.reply_to_content}</Text>
                </View>
              )}
              {Boolean(msg.content) && <Text style={s.bodyText}>{renderBody(msg.content)}</Text>}
              {msg.type !== 'text' && <SharedCard msg={msg} onOpen={onOpenShare} onLongPress={onLongPress} />}
            </PressableScale>
          )}

          {isSending && (
            <View style={s.stateLine}>
              <Clock size={11} color={colors.fog} strokeWidth={1.5} />
              <Text style={s.stateLineText}>sending…</Text>
            </View>
          )}
          {isFailed && (
            <PressableScale style={s.stateLine} onPress={() => onRetry(msg.id)} haptic="medium" accessibilityRole="button" accessibilityLabel="Retry sending">
              <AlertTriangle size={11} color={REACTION_META.panned.tint} strokeWidth={1.5} />
              <Text style={[s.stateLineText, s.stateLineFail]}>Failed · tap to retry</Text>
            </PressableScale>
          )}

          {!isWithdrawn && !!msg.reactions?.length && (
            <ReactionChips reactions={msg.reactions} onToggle={(r) => onReactToggle(msg.id, r)} />
          )}
        </View>
      </View>
    </View>
  );
});
Dispatch.displayName = 'Dispatch';

function formatDay(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const yesterday = new Date(); yesterday.setDate(today.getDate() - 1);
  const sameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString();
  if (sameDay(d, today)) return 'TODAY';
  if (sameDay(d, yesterday)) return 'YESTERDAY';
  return d.toLocaleDateString([], { month: 'long', day: 'numeric' }).toUpperCase();
}

// ════════════════════════════════════════════════════════════
// MAIN SALON SCREEN
// ════════════════════════════════════════════════════════════
export default function LoungeRoomScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const user = useAuthStore(s => s.user);
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { isOffline } = useOfflineAware();

  const keyboard = useAnimatedKeyboard();
  // iOS only: Android's window resize already lifts the chat composer.
  const animatedContainerStyle = useAnimatedStyle(() => ({ paddingBottom: Platform.OS === 'ios' ? keyboard.height.value : 0 }));

  const {
    lounges, currentMessages, fetchMessages, sendMessage,
    subscribeToLounge, sending, markRead,
    withdrawMessage, retryMessage, toggleReaction,
    requestMembership, joinPublicLounge, fetchMembers,
    presentCount, typingUsers, broadcastTyping,
  } = useLoungeStore();

  const [input, setInput] = useState('');
  const [replyTo, setReplyTo] = useState<LoungeMessage | null>(null);
  const [actionSheetMsg, setActionSheetMsg] = useState<LoungeMessage | null>(null);
  const [reportSheetVisible, setReportSheetVisible] = useState(false);
  const [selectedMessage, setSelectedMessage] = useState<LoungeMessage | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [doorOpen, setDoorOpen] = useState(false);
  const [members, setMembers] = useState<LoungeMember[]>([]);
  const [localLounge, setLocalLounge] = useState<(LoungeRoom & { is_member?: boolean }) | null>(null);
  const [myStatus, setMyStatus] = useState<LoungeMemberStatus | 'none'>('none');
  const [pending, setPending] = useState(false);
  const [notFound, setNotFound] = useState(false);

  const blockStore = useBlockStore();

  const handleInputChange = useCallback((text: string) => {
    setInput(text);
    // THE HOUSE PULSE — announce the typewriter (throttled in the store).
    if (text.length > 0 && id) broadcastTyping(id);
  }, [id, broadcastTyping]);

  // ── Membership + roster refresh (also drives host's "At the Door") ──
  const refreshMembership = useCallback(async () => {
    if (!id) return;
    const roster = await fetchMembers(id);
    setMembers(roster);
    if (user) {
      const mine = roster.find(m => m.user_id === user.id);
      setMyStatus((mine?.status as LoungeMemberStatus) ?? 'none');
    }
  }, [id, user, fetchMembers]);

  // ── Hydrate lounge metadata + membership ──
  useEffect(() => {
    if (!id) return;
    const loadLounge = async () => {
      const { data: loungeData, error } = await supabase.from('lounges').select('*').eq('id', id).single();
      if (!loungeData || error) { setNotFound(true); return; }
      setLocalLounge(loungeData);
      const store = useLoungeStore.getState();
      if (!store.lounges.some(l => l.id === id)) store.fetchLounges();
    };
    loadLounge();
    refreshMembership();
  }, [id, refreshMembership]);

  const activeLounge = localLounge || lounges.find(l => l.id === id);
  const isCreator = activeLounge?.creator_id === user?.id;
  const isApproved = myStatus === 'approved' || isCreator;
  const isMuted = myStatus === 'muted';
  const canRead = isApproved || isMuted || (activeLounge ? !activeLounge.is_private : false);
  const canPost = isApproved && !isMuted;
  const pendingMembers = useMemo(() => members.filter(m => m.status === 'pending'), [members]);

  // What gate (if any) replaces the transcript.
  const gate: 'chat' | 'preview' | 'request' | 'pending' | 'banned' = !activeLounge
    ? 'chat'
    : isApproved || isMuted ? 'chat'
    : !activeLounge.is_private ? 'preview'
    : myStatus === 'pending' || pending ? 'pending'
    : myStatus === 'banned' ? 'banned'
    : 'request';

  const handleLongPress = useCallback((msg: LoungeMessage) => setActionSheetMsg(msg), []);
  // Clippings are doors — every shared card opens the thing it points to.
  const handleOpenShare = useCallback((msg: LoungeMessage) => {
    const meta = (msg.metadata ?? {}) as Record<string, unknown>;
    switch (msg.type) {
      case 'film_share':
        if (msg.film_id) router.push(`/film/${msg.film_id}`);
        break;
      case 'log_share':
        if (typeof meta.log_id === 'string') router.push(`/log/${meta.log_id}`);
        break;
      case 'list_share':
        if (typeof meta.listId === 'string') router.push(`/stacks/${meta.listId}`);
        break;
      case 'dossier_share':
        if (typeof meta.dossier_id === 'string') router.push(`/dossier/${meta.dossier_id}`);
        break;
    }
  }, [router]);
  const handleReport = useCallback((msg: LoungeMessage) => {
    setSelectedMessage(msg); setActionSheetMsg(null); setReportSheetVisible(true);
  }, []);
  // blockUser applies its optimistic update synchronously before it awaits the
  // server, so by the time it returns the promise the block is already in the store
  // and the purge below sees it. Without the purge the toast said "their content is
  // now hidden" while their messages stayed on screen until you left the salon.
  const handleBlock = useCallback((userId: string) => {
    setActionSheetMsg(null);
    blockStore.blockUser(userId);
    useLoungeStore.getState().purgeHiddenMessages();
  }, [blockStore]);

  // ── Re-fetch on foreground ──
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active' && id) { fetchMessages(id); markRead(id); refreshMembership(); }
    });
    return () => sub.remove();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // ── Subscribe + initial fetch (realtime: messages, reactions, membership) ──
  useEffect(() => {
    if (!id) return;
    fetchMessages(id);
    markRead(id);
    const unsub = subscribeToLounge(id, { onMembership: () => { refreshMembership(); } });
    return () => { unsub(); markRead(id); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const handleSend = useCallback(() => {
    if (!input.trim() || sending || !id) return;
    sendMessage(id, input.trim(), 'text', {
      reply_to_id: replyTo?.id,
      reply_to_username: replyTo?.username,
      reply_to_content: replyTo?.content,
    });
    setInput('');
    setReplyTo(null);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [input, sending, id, replyTo]);

  const handleRequest = useCallback(async () => {
    if (!id) return;
    setPending(true);
    TactileEngine.mutate();
    const result = await requestMembership(id);
    if (result === 'error') setPending(false);
    else refreshMembership();
  }, [id, requestMembership, refreshMembership]);

  const handleTakeSeat = useCallback(async () => {
    if (!id) return;
    TactileEngine.mutate();
    const ok = await joinPublicLounge(id);
    if (ok) { setMyStatus('approved'); refreshMembership(); }
  }, [id, joinPublicLounge, refreshMembership]);

  // ── Edge: not found ──
  if (notFound) {
    return (
      <View style={s.centered}>
        <View style={s.crestSmall}><X size={18} color={colors.sepia} strokeWidth={1.5} /></View>
        <Text style={s.edgeTitle}>Signal Lost</Text>
        <Text style={s.edgeDesc}>This screening room has been incinerated or never existed.</Text>
        <PressableScale style={s.edgeBtn} onPress={() => router.back()} haptic="medium">
          <Text style={s.edgeBtnText}>RETURN TO THE LOBBY</Text>
        </PressableScale>
      </View>
    );
  }

  // ── Edge: loading ──
  if (!activeLounge) {
    return (
      <View style={s.centered}>
        <ActivityIndicator size="small" color={colors.sepia} />
        <Text style={s.edgeLoad}>ESTABLISHING CONNECTION</Text>
      </View>
    );
  }

  return (
    <Animated.View style={[s.container, animatedContainerStyle]}>
      {/* ── Marquee header ── */}
      <View style={[s.header, { paddingTop: Math.max(insets.top + 10, 44) }]}>
        <PressableScale style={s.headerBtn} onPress={() => router.back()} haptic="selection" accessibilityRole="button" accessibilityLabel="Back">
          <ArrowLeft size={20} color={colors.parchment} strokeWidth={1.5} />
        </PressableScale>

        <View style={s.headerCenter}>
          <View style={s.headerCrest}><MasterLogo size={22} /></View>
          <Text style={s.headerTitle} numberOfLines={1}>{activeLounge.name}</Text>
          <View style={s.headerMeta}>
            <Text style={s.headerMetaText} numberOfLines={1}>
              {(members.filter(m => m.status !== 'pending').length || activeLounge.member_count || 0)} MEMBERS
            </Text>
            {/* THE HOUSE PULSE — the ember glows only when the room truly breathes */}
            {presentCount >= 2 && (
              <>
                <View style={s.metaDot} />
                <View style={s.presenceEmber} />
                <Text style={s.presenceText} numberOfLines={1}>{presentCount} HERE NOW</Text>
              </>
            )}
            {activeLounge.is_private && (
              <>
                <View style={s.metaDot} />
                <Lock size={9} color={colors.sepia} strokeWidth={1.5} />
                <Text style={s.metaPrivate}>PRIVATE</Text>
              </>
            )}
          </View>
        </View>

        <View style={s.headerRight}>
          {isCreator && pendingMembers.length > 0 && (
            <PressableScale style={s.doorBadge} onPress={() => setDoorOpen(true)} haptic="medium" accessibilityRole="button" accessibilityLabel={`${pendingMembers.length} at the door`}>
              <DoorOpen size={12} color={colors.ink} strokeWidth={2} />
              <Text style={s.doorBadgeText}>{pendingMembers.length}</Text>
            </PressableScale>
          )}
          <PressableScale style={s.headerBtn} onPress={() => setSettingsOpen(true)} haptic="selection" accessibilityRole="button" accessibilityLabel="Lounge settings">
            <Settings size={18} color={colors.parchment} strokeWidth={1.5} />
          </PressableScale>
        </View>
      </View>

      {/* ── Body: transcript or gate ── */}
      {canRead ? (
        <FlashList
          data={currentMessages}
          keyExtractor={(item) => item.id}
          contentContainerStyle={s.list}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          maintainVisibleContentPosition={{ startRenderingFromBottom: true, autoscrollToBottomThreshold: 0.2 }}
          onStartReached={() => { if (id) useLoungeStore.getState().loadMoreMessages(id); }}
          onStartReachedThreshold={0.5}
          renderItem={({ item, index }) => {
            const isSelf = item.user_id === user?.id;
            const prev = currentMessages[index - 1];
            const gap = prev ? new Date(item.created_at).getTime() - new Date(prev.created_at).getTime() : Infinity;
            const showAuthor = !prev || prev.user_id !== item.user_id || gap > 300000;
            const showDate = !prev || new Date(item.created_at).toDateString() !== new Date(prev.created_at).toDateString();
            return (
              <Dispatch
                msg={item}
                isSelf={isSelf}
                showAuthor={showAuthor}
                showDate={showDate}
                onLongPress={handleLongPress}
                onOpenShare={handleOpenShare}
                onReactToggle={toggleReaction}
                onRetry={retryMessage}
              />
            );
          }}
          ListEmptyComponent={
            <View style={s.emptyChat}>
              <Buster size={48} mood="peeking" />
              <Text style={s.edgeTitle}>The Conversation Begins</Text>
              <Text style={s.edgeDesc}>Be the first to break the silence.</Text>
            </View>
          }
        />
      ) : (
        <GateView
          gate={gate}
          lounge={activeLounge}
          memberCount={members.filter(m => m.status !== 'pending').length || activeLounge.member_count || 0}
          onRequest={handleRequest}
          pending={pending}
        />
      )}

      {/* ── Offline banner ── */}
      {isOffline && canRead && (
        <View style={s.offlineBanner}>
          <WifiOff size={14} color={colors.sepia} strokeWidth={1.5} />
          <Text style={s.offlineText}>You&apos;re offline — dispatches will send when you reconnect.</Text>
        </View>
      )}

      {/* ── Composer / preview / muted ── */}
      {gate === 'chat' && canPost && (
        <View style={[s.composer, { paddingBottom: Math.max(insets.bottom + 8, 12) }]}>
          {/* THE HOUSE PULSE — the typewriter line. Reserved height: the
              composer never shifts a pixel when a typist appears or goes quiet. */}
          <View style={s.typingLine}>
            {typingUsers.length > 0 && (
              <AnimatedView entering={FadeIn.duration(250)} exiting={FadeOut.duration(200)} style={s.typingRow}>
                <View style={s.typingDot} />
                <Text style={s.typingText} numberOfLines={1}>
                  {typingUsers.length === 1
                    ? `AT THE TYPEWRITER — @${typingUsers[0].toUpperCase()}`
                    : 'SEVERAL MEMBERS AT THE TYPEWRITER…'}
                </Text>
              </AnimatedView>
            )}
          </View>
          {replyTo && (
            <AnimatedView entering={FadeIn.duration(200)} exiting={FadeOut.duration(150)} style={s.replyBanner}>
              <View style={s.replyBannerCol}>
                <Text style={s.replyBannerAuthor} numberOfLines={1}>Replying to {replyTo.username}</Text>
                <Text style={s.replyBannerText} numberOfLines={1}>{replyTo.content || 'Shared content'}</Text>
              </View>
              <PressableScale onPress={() => setReplyTo(null)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} haptic="selection" accessibilityRole="button">
                <X size={14} color={colors.fog} strokeWidth={1.5} />
              </PressableScale>
            </AnimatedView>
          )}
          <View style={s.inputRow}>
            <TextInput
              style={s.input}
              placeholder="Compose a dispatch…"
              placeholderTextColor={colors.fog}
              value={input}
              onChangeText={handleInputChange}
              multiline
              maxLength={MAX_LENGTHS.loungeMessage}
              selectionColor={colors.sepia}
              keyboardAppearance="dark"
              accessibilityLabel="Compose a dispatch"
            />
            <PressableScale
              style={[s.sendBtn, (!input.trim() || sending) && s.sendBtnDisabled]}
              onPress={handleSend}
              disabled={!input.trim() || sending}
              haptic="medium"
              accessibilityRole="button"
            >
              <Send size={16} color={colors.ink} strokeWidth={2} />
            </PressableScale>
          </View>
        </View>
      )}

      {gate === 'chat' && isMuted && (
        <View style={[s.mutedBar, { paddingBottom: Math.max(insets.bottom + 8, 12) }]}>
          <VolumeX size={13} color={colors.fog} strokeWidth={1.5} />
          <Text style={s.mutedText}>You&apos;ve been muted — you can read, but not post.</Text>
        </View>
      )}

      {gate === 'preview' && (
        <AnimatedView entering={SlideInDown.duration(300)} style={[s.previewBar, { paddingBottom: Math.max(insets.bottom + 8, 12) }]}>
          <Text style={s.previewText}>You&apos;re previewing this salon.</Text>
          <PressableScale style={s.previewBtn} onPress={handleTakeSeat} haptic="medium" accessibilityRole="button">
            <Text style={s.previewBtnText}>TAKE A SEAT</Text>
          </PressableScale>
        </AnimatedView>
      )}

      {/* ── Overlays ── */}
      <ActionSheet
        visible={!!actionSheetMsg}
        msg={actionSheetMsg}
        isSelf={actionSheetMsg?.user_id === user?.id}
        canReact={canPost}
        currentReactions={actionSheetMsg?.reactions}
        onClose={() => setActionSheetMsg(null)}
        onReply={setReplyTo}
        onReact={(reaction) => { if (actionSheetMsg) toggleReaction(actionSheetMsg.id, reaction); }}
        onDelete={withdrawMessage}
        onReport={handleReport}
        onBlock={handleBlock}
      />
      {selectedMessage && (
        <ReportSheet
          visible={reportSheetVisible}
          contentType="lounge_message"
          contentId={selectedMessage.id}
          targetUserId={selectedMessage.user_id}
          targetUsername={selectedMessage.username || ''}
          onDismiss={() => { setReportSheetVisible(false); setSelectedMessage(null); }}
        />
      )}
      <AtTheDoorPanel
        visible={doorOpen}
        loungeId={activeLounge.id}
        pending={pendingMembers}
        onClose={() => setDoorOpen(false)}
        onResolved={refreshMembership}
      />
      <LoungeSettingsPanel
        lounge={activeLounge}
        members={members}
        visible={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        isCreator={isCreator}
        onMembersChanged={refreshMembership}
      />
    </Animated.View>
  );
}

// ════════════════════════════════════════════════════════════
// GATE VIEW — velvet rope (request), pending, banned
// ════════════════════════════════════════════════════════════
function GateView({ gate, lounge, memberCount, onRequest, pending }: {
  gate: 'request' | 'pending' | 'banned' | 'chat' | 'preview';
  lounge: LoungeRoom; memberCount: number; onRequest: () => void; pending: boolean;
}) {
  return (
    <AnimatedView entering={FadeInDown.duration(400)} style={s.gate}>
      <View style={s.gateCrest}><MasterLogo size={52} /></View>
      <Text style={s.gateName}>{lounge.name}</Text>
      <View style={s.gatePrivateRow}>
        <Lock size={11} color={colors.sepia} strokeWidth={1.5} />
        <Text style={s.gatePrivateLabel}>PRIVATE SALON</Text>
      </View>
      {!!lounge.description && <Text style={s.gateDesc}>{lounge.description}</Text>}
      <Text style={s.gateMembers}>{memberCount} {memberCount === 1 ? 'member' : 'members'} behind the door</Text>

      {gate === 'request' && (
        <>
          <Text style={s.gateCopy}>This room is by invitation of the host. Ask to be admitted and your request will be at the door.</Text>
          <PressableScale style={s.gateBtn} onPress={onRequest} disabled={pending} haptic="medium" accessibilityRole="button">
            {pending ? <ActivityIndicator size="small" color={colors.ink} /> : <Text style={s.gateBtnText}>REQUEST A SEAT</Text>}
          </PressableScale>
        </>
      )}
      {gate === 'pending' && (
        <View style={s.gatePending}>
          <Hourglass size={16} color={colors.sepia} strokeWidth={1.5} />
          <Text style={s.gatePendingText}>Your request is with the host.</Text>
          <Text style={s.gateCopy}>We&apos;ll let you in the moment you&apos;re admitted.</Text>
        </View>
      )}
      {gate === 'banned' && (
        <Text style={s.gateCopy}>You no longer have access to this salon.</Text>
      )}
    </AnimatedView>
  );
}

// ════════════════════════════════════════════════════════════
// STYLES — Editorial Salon
// ════════════════════════════════════════════════════════════
const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.ink },

  // ── Edge states ──
  centered: { flex: 1, backgroundColor: colors.ink, justifyContent: 'center', alignItems: 'center', gap: 12, paddingHorizontal: 32 },
  edgeLoad: { fontFamily: fonts.sub, fontSize: 9, letterSpacing: 3, color: colors.fog, includeFontPadding: false },
  crestSmall: {
    width: 44, height: 44, borderRadius: 22, borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(184,137,26,0.35)', alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(184,137,26,0.03)', marginBottom: 8,
  },
  edgeTitle: { fontFamily: fonts.display, fontSize: 22, color: colors.parchment, textAlign: 'center' },
  edgeDesc: { fontFamily: fonts.serif, fontSize: 14, color: colors.fog, textAlign: 'center', lineHeight: 21 },
  edgeBtn: { marginTop: 20, backgroundColor: colors.sepia, paddingHorizontal: 24, paddingVertical: 12, borderRadius: 4 },
  edgeBtnText: { fontFamily: fonts.sub, fontSize: 10, letterSpacing: 2, color: colors.ink, includeFontPadding: false },

  // ── Header (marquee chrome) ──
  header: {
    paddingBottom: 12, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center',
    backgroundColor: 'rgba(11,10,8,0.97)', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.ash,
  },
  headerBtn: { padding: 8 },
  headerCenter: { flex: 1, alignItems: 'center' },
  headerCrest: { marginBottom: 5, opacity: 0.95 },
  headerTitle: { fontFamily: fonts.sub, fontSize: 16, color: colors.parchment, letterSpacing: 0.3 },
  headerMeta: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 3 },
  headerMetaText: { fontFamily: fonts.sub, fontSize: 8, letterSpacing: 1, color: colors.fog, includeFontPadding: false },
  metaDot: { width: 2, height: 2, borderRadius: 1, backgroundColor: colors.fog, marginHorizontal: 3 },
  metaPrivate: { fontFamily: fonts.sub, fontSize: 8, letterSpacing: 1, color: colors.sepia, includeFontPadding: false },
  // THE HOUSE PULSE — a true brass ember, lit only when others are present.
  presenceEmber: {
    width: 5, height: 5, borderRadius: 3, backgroundColor: colors.marqueeGold,
    shadowColor: colors.marqueeGold, shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.8, shadowRadius: 4, elevation: 3,
    marginRight: 1,
  },
  presenceText: { fontFamily: fonts.sub, fontSize: 8, letterSpacing: 1, color: colors.marqueeGold, includeFontPadding: false },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  doorBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: colors.sepia,
    paddingHorizontal: 9, paddingVertical: 5, borderRadius: 12,
  },
  doorBadgeText: { fontFamily: fonts.sub, fontSize: 11, color: colors.ink },

  // ── Transcript ──
  list: { paddingHorizontal: 18, paddingTop: 16, paddingBottom: 24 },
  // The reel change — sprocket dots mark where one day's projection ends.
  dateDivider: { flexDirection: 'row', alignItems: 'center', gap: 10, marginVertical: 18 },
  dateLine: { flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: colors.ash },
  dateSprocket: { width: 3, height: 3, borderRadius: 1, backgroundColor: 'rgba(184,137,26,0.45)' },
  dateText: { fontFamily: fonts.sub, fontSize: 8, letterSpacing: 2.5, color: colors.fog, includeFontPadding: false },

  row: { marginTop: 10 },
  rowSending: { opacity: 0.55 },
  authorRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 5 },
  authorAvatar: {
    width: 24, height: 24, borderRadius: 12, overflow: 'hidden', backgroundColor: colors.soot,
    alignItems: 'center', justifyContent: 'center', borderWidth: StyleSheet.hairlineWidth, borderColor: colors.ash,
  },
  authorAvatarImg: { width: '100%', height: '100%' },
  authorAvatarLetter: { fontFamily: fonts.display, color: colors.fog, fontSize: 11 },
  authorName: { fontFamily: fonts.sub, fontSize: 12, color: colors.bone, letterSpacing: 0.3, flexShrink: 1 },
  authorNameSelf: { color: colors.sepia },
  authorTime: { fontFamily: fonts.sub, fontSize: 8, color: colors.fog, // 0.6 was 3.04:1 — every timestamp in every conversation. 0.8 = 4.59:1.
    opacity: 0.8, includeFontPadding: false },

  contentCol: { paddingLeft: 32 },
  contentColSelf: { paddingLeft: 13, marginLeft: 11, borderLeftWidth: 2, borderLeftColor: 'rgba(184,137,26,0.45)' },

  bodyText: { fontFamily: fonts.serif, fontSize: 15.5, color: colors.parchment, lineHeight: 24 },
  link: { color: colors.flicker, textDecorationLine: 'underline' },

  tombstone: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  tombstoneText: { fontFamily: fonts.serifItalic, fontSize: 13.5, color: colors.fog },

  stateLine: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 5 },
  stateLineText: { fontFamily: fonts.sub, fontSize: 9, color: colors.fog, includeFontPadding: false },
  stateLineFail: { color: REACTION_META.panned.tint },

  // ── Reply pull-quote ──
  replyQuote: { borderLeftWidth: 2, borderLeftColor: colors.sepia, paddingLeft: 10, marginBottom: 7 },
  replyQuoteAuthor: { fontFamily: fonts.sub, fontSize: 8.5, letterSpacing: 0.5, color: colors.sepia, marginBottom: 2, includeFontPadding: false },
  replyQuoteContent: { fontFamily: fonts.serifItalic, fontSize: 12.5, color: colors.fog, lineHeight: 17 },

  // ── Reactions ──
  reactionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 },
  reactionChip: {
    flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 9, paddingVertical: 3,
    borderRadius: 13, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.ash, backgroundColor: colors.soot,
  },
  reactionChipMine: { borderColor: 'rgba(184,137,26,0.55)', backgroundColor: 'rgba(184,137,26,0.12)' },
  reactionChipCount: { fontFamily: fonts.sub, fontSize: 11, color: colors.bone },
  reactionChipCountMine: { color: colors.flicker },

  // ── Shared clipping ──
  sharedCard: {
    flexDirection: 'row', backgroundColor: 'rgba(0,0,0,0.4)', borderRadius: 4, overflow: 'hidden',
    marginTop: 10, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.ash,
  },
  sharedPoster: { width: 48, height: 72 },
  sharedGlyphSlot: {
    width: 48, alignSelf: 'stretch', alignItems: 'center', justifyContent: 'center',
    borderRightWidth: StyleSheet.hairlineWidth, borderRightColor: colors.ash,
  },
  sharedGlyph: { fontFamily: fonts.display, fontSize: 22, color: colors.sepia, includeFontPadding: false },
  sharedInfo: { padding: 10, flex: 1, justifyContent: 'center' },
  sharedTypeBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 4 },
  sharedTypeText: { fontFamily: fonts.sub, fontSize: 7.5, letterSpacing: 1.5, color: colors.sepia, includeFontPadding: false },
  sharedTitle: { fontFamily: fonts.sub, fontSize: 13, color: colors.bone, lineHeight: 17 },
  sharedByline: { fontFamily: fonts.sub, fontSize: 8, letterSpacing: 1.2, color: colors.fog, marginTop: 4 },

  emptyChat: { alignItems: 'center', justifyContent: 'center', paddingVertical: 80, gap: 10 },

  // ── Offline banner ──
  offlineBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingVertical: 9,
    backgroundColor: 'rgba(22,15,8,0.96)', borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: 'rgba(184,137,26,0.25)',
  },
  offlineText: { flex: 1, fontFamily: fonts.serifItalic, fontSize: 12.5, color: colors.bone },

  // ── Composer ──
  composer: {
    paddingVertical: 8, paddingHorizontal: 16, backgroundColor: colors.ink,
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.ash,
  },
  // THE HOUSE PULSE — reserved height so the composer never shifts.
  typingLine: { height: 16, justifyContent: 'center', marginBottom: 2 },
  typingRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  typingDot: { width: 4, height: 4, borderRadius: 2, backgroundColor: colors.sepia, opacity: 0.8 },
  typingText: { fontFamily: fonts.sub, fontSize: 7.5, letterSpacing: 1.5, color: colors.sepia, opacity: 0.85, includeFontPadding: false },
  replyBanner: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: colors.soot, paddingVertical: 8, paddingHorizontal: 12,
    borderRadius: 4, marginBottom: 8, borderLeftWidth: 2, borderLeftColor: colors.sepia, gap: 10,
  },
  replyBannerCol: { flex: 1 },
  replyBannerAuthor: { fontFamily: fonts.sub, fontSize: 8.5, letterSpacing: 0.5, color: colors.sepia, marginBottom: 2, includeFontPadding: false },
  replyBannerText: { fontFamily: fonts.serif, fontSize: 12.5, color: colors.fog },
  inputRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
  input: {
    flex: 1, minHeight: 42, maxHeight: 120, backgroundColor: colors.soot, borderRadius: 21,
    paddingHorizontal: 16, paddingTop: 12, paddingBottom: 12, color: colors.parchment,
    fontFamily: fonts.serif, fontSize: 15, lineHeight: 20, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.ash,
  },
  sendBtn: {
    width: 42, height: 42, borderRadius: 21, backgroundColor: colors.sepia, alignItems: 'center', justifyContent: 'center',
    shadowColor: colors.sepia, shadowOpacity: 0.3, shadowRadius: 8, shadowOffset: { width: 0, height: 2 },
  },
  sendBtnDisabled: { backgroundColor: colors.ash, shadowOpacity: 0 },

  // ── Muted bar ──
  mutedBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingTop: 14, paddingHorizontal: 16,
    backgroundColor: colors.ink, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.ash,
  },
  mutedText: { fontFamily: fonts.serifItalic, fontSize: 13, color: colors.fog },

  // ── Preview bar ──
  previewBar: {
    paddingHorizontal: 16, paddingTop: 16, backgroundColor: 'rgba(11,10,8,0.97)',
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.ash, alignItems: 'center', gap: 12,
  },
  previewText: { fontFamily: fonts.serifItalic, fontSize: 13, color: colors.fog },
  previewBtn: { backgroundColor: colors.sepia, paddingHorizontal: 24, paddingVertical: 12, borderRadius: 4, width: '100%', alignItems: 'center' },
  previewBtnText: { fontFamily: fonts.sub, fontSize: 10, letterSpacing: 2, color: colors.ink, includeFontPadding: false },

  // ── Gate (velvet rope) ──
  gate: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 36, gap: 12 },
  gateCrest: { marginBottom: 6, opacity: 0.95 },
  gateName: { fontFamily: fonts.display, fontSize: 26, color: colors.parchment, textAlign: 'center', lineHeight: 32 },
  gatePrivateRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  gatePrivateLabel: { fontFamily: fonts.sub, fontSize: 9, letterSpacing: 2.5, color: colors.sepia, includeFontPadding: false },
  gateDesc: { fontFamily: fonts.serif, fontSize: 15, color: colors.bone, textAlign: 'center', lineHeight: 23 },
  gateMembers: { fontFamily: fonts.sub, fontSize: 9, letterSpacing: 1, color: colors.fog, marginTop: 2, includeFontPadding: false },
  gateCopy: { fontFamily: fonts.serifItalic, fontSize: 13.5, color: colors.fog, textAlign: 'center', lineHeight: 21, marginTop: 4 },
  gateBtn: { marginTop: 14, backgroundColor: colors.sepia, paddingHorizontal: 32, paddingVertical: 14, borderRadius: 4, minWidth: 200, alignItems: 'center' },
  gateBtnText: { fontFamily: fonts.sub, fontSize: 10, letterSpacing: 2.5, color: colors.ink, includeFontPadding: false },
  gatePending: { alignItems: 'center', gap: 8, marginTop: 14 },
  gatePendingText: { fontFamily: fonts.sub, fontSize: 15, color: colors.parchment, letterSpacing: 0.3 },
});
