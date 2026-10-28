import Buster, { BusterEyes } from '@/src/components/Buster';
import { RemoteImage, PosterMark } from '@/src/components/Picture';
import { ActionSheet } from '@/src/components/lounge/ActionSheet';
import { AtTheDoorPanel } from '@/src/components/lounge/AtTheDoorPanel';
import { LoungeSettingsPanel } from '@/src/components/lounge/LoungeSettingsPanel';
import { REACTION_META } from '@/src/components/lounge/reactions';
import { KIND_NAME, nameOf, UNSPOKEN } from '@/src/components/dispatch/paper/paperMetrics';
import { initialOf } from '@/src/utils/text';
import { MasterLogo } from '@/src/components/MasterLogo';
import ReportSheet from '@/src/components/moderation/ReportSheet';
import PressableScale from '@/src/components/PressableScale';
import { useOfflineAware } from '@/src/hooks/useOfflineAware';
import { supabase } from '@/src/lib/supabase';
import { tmdb } from '@/src/lib/tmdb';
import { useAuthStore } from '@/src/stores/auth';
import { useBlockStore } from '@/src/stores/blockStore';
import { useNotificationStore } from '@/src/stores/notificationStore';
import { LoungeMessage, LoungeRoom, ReactionSummary, useLoungeStore } from '@/src/stores/lounge';
import { colors, fonts } from '@/src/theme/theme';
import { UNREADY, UNREADY_INK } from '@/src/theme/unready';
import { LoungeMember, LoungeMemberStatus } from '@/src/types/social.types';
import { knownStanding, roomGate, type RoomGate, type RoomStanding } from '@/src/components/lounge/roomGate';
import { offerWord } from '@/src/lib/pushPrimer';
import TactileEngine from '@/src/utils/TactileEngine';
import { safeOpenURL } from '@/src/utils/linking';
import { MAX_LENGTHS } from '@/src/utils/sanitizeInput';
import { FlashList } from '@shopify/flash-list';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
    AlertTriangle,
    ArrowLeft,
    Clock,
    DoorOpen,
    Hourglass,
    Lock,
    MinusCircle,
    Radio,
    Send,
    Settings,
    Sparkles,
    VolumeX,
    WifiOff,
    X,
} from 'lucide-react-native';
import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, AppState, Platform, StyleSheet, View } from 'react-native';
import { Text, TextInput } from '@/src/components/text';
import Animated, { useAnimatedKeyboard, useAnimatedStyle } from 'react-native-reanimated';
import { Presence, PresenceView } from '@/src/components/motion/Presence';
import { useBottomEdge, usePushedHeaderTop } from '@/src/components/layout/navMetrics';
import { nav } from '@/src/utils/typedRouter';
import { useClearance } from '@/src/hooks/useClearance';
import { ropeSpoken } from '@/src/components/clearance/Clearance';
import { EDGE_LIT } from '@/src/theme/light';
import { RoomLight } from '@/src/components/atmosphere/RoomLight';
import { formatClockTime, formatDateMonthDay } from '@/src/utils/timeAgo';
import { useClock } from '@/src/hooks/useClock';
import { useScreenReady } from '@/src/hooks/useScreenReady';
import { EmptyOffline } from '@/src/components/EmptyStates';
import { authorName, isDepartedHandle, quotedName } from '@/src/constants/departed';
import { useScrollTrace } from '@/src/hooks/useScrollTrace';
import { counted } from '@/src/utils/counted';
import { useHeld } from '@/src/stores/offlineQueueStore';
import { Arrive } from '@/src/components/Arrive';


// ════════════════════════════════════════════════════════════
// LINKIFY — auto-detect URLs → safe, tappable sepia links
// ════════════════════════════════════════════════════════════
const URL_RE = /(https?:\/\/[^\s]+)/g;
/** A room's words before the store holds them: one array, so the list is not handed a new one each render. */
const NO_WORDS: LoungeMessage[] = [];
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
// SHARED CONTENT CARD — the clipping (film / record / stack / essay)
// Every clipping is a door: tap opens the thing itself.
// ════════════════════════════════════════════════════════════
const SHARE_LABELS: Record<string, string> = {
  film_share: 'FILM',
  log_share: 'LOG',
  list_share: 'STACK',
  // The message type is the wire's word and stays; the label is the reader's.
  dossier_share: KIND_NAME.dossier,
};

/**
 * What a message shares, as its card names it; null for plain words. The
 * Dispatch shares every kind of filing down the `dossier_share` path (the type
 * and metadata key stay, for the messages already in rooms), so the kind comes
 * from the metadata when it is there.
 */
export function shareOf(msg: LoungeMessage): { typeLabel: string; title: string | null } | null {
  if (msg.type === 'text') return null;
  const meta = (msg.metadata ?? {}) as Record<string, unknown>;
  // Stack shares carry their title in metadata, not the film_title column.
  const title = msg.film_title || (typeof meta.title === 'string' ? meta.title : null);
  if (!title && !msg.film_id) return null;
  const sharedKind = typeof meta.kind === 'string' ? nameOf(meta.kind) : null;
  const typeLabel = sharedKind ?? SHARE_LABELS[msg.type] ?? msg.type.toUpperCase().replace('_SHARE', '');
  return { typeLabel, title };
}

export const firstLink = (content: string | null | undefined) =>
  content?.match(URL_RE)?.[0]?.replace(/[.,;:!?)\]]+$/, '') ?? null;

/** A message, as a screen reader hears it: what it answers, its words, what it shares. */
export function spokenDispatch(msg: LoungeMessage): string {
  const parts: string[] = [];
  if (msg.reply_to_content) parts.push(`In reply to ${quotedName(msg.reply_to_username)}: ${msg.reply_to_content}`);
  if (msg.content) parts.push(msg.content);
  const share = shareOf(msg);
  if (share) parts.push(`Shared ${share.typeLabel.toLowerCase()}${share.title ? `: ${share.title}` : ''}`);
  // Each part one sentence: a stop added only where the words did not end on one.
  return parts.map((p) => p.trim()).filter(Boolean)
    .map((p) => (/[.!?…]$/.test(p) ? p : `${p}.`)).join(' ');
}

/** The acts a screen reader is offered on a message. */
export function dispatchActions(msg: LoungeMessage) {
  const share = shareOf(msg);
  return [
    { name: 'activate' as const },
    { name: 'longpress' as const, label: 'Show actions' },
    ...(share ? [{ name: 'open', label: `Open the ${share.typeLabel.toLowerCase()}` }] : []),
    ...(firstLink(msg.content) ? [{ name: 'link', label: 'Open the link' }] : []),
  ];
}

const SharedCard = React.memo(({ msg, onOpen, onLongPress }: {
  msg: LoungeMessage;
  onOpen: (msg: LoungeMessage) => void;
  onLongPress: (msg: LoungeMessage) => void;
}) => {
  const share = shareOf(msg);
  if (!share) return null;
  const { typeLabel, title } = share;
  const meta = (msg.metadata ?? {}) as Record<string, unknown>;
  const posterUrl = msg.film_poster ? tmdb.poster(msg.film_poster, 'w342') : null;

  // One quiet attribution line, when the payload carries one.
  const byline =
    msg.type === 'dossier_share' && typeof meta.author_username === 'string'
      ? `BY @${meta.author_username.toUpperCase()}`
      : msg.type === 'log_share' && typeof meta.owner_username === 'string'
      ? `FILED BY @${meta.owner_username.toUpperCase()}`
      : msg.type === 'list_share' && typeof meta.curator === 'string'
      ? `${typeof meta.filmCount === 'number' ? `${counted(meta.filmCount, 'REEL', 'REELS')} · ` : ''}@${meta.curator.toUpperCase()}`
      : null;

  return (
    <PressableScale
      style={s.sharedCard}
      onPress={() => onOpen(msg)}
      onLongPress={() => onLongPress(msg)}
      haptic="selection"
      pressedScale={0.98}
      // Inside the message, which speaks for it and offers "Open" as an action.
      accessible={false}
      importantForAccessibility="no-hide-descendants"
    >
      <RemoteImage uri={posterUrl} style={s.sharedPoster} contentFit="cover" transition={150} fallback={msg.type === 'dossier_share' ? (
        <View style={s.sharedGlyphSlot}>
          <Text style={s.sharedGlyph}>§</Text>
        </View>
      ) : <PosterMark style={s.sharedPoster} size={14} />} />
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
const ReactionChips = React.memo(({ reactions, canReact, onToggle }: {
  reactions: ReactionSummary[];
  /** May add a reaction. A member without the rank may still take back their own; another chip is only read. */
  canReact: boolean;
  onToggle: (reaction: string) => void;
}) => {
  if (!reactions.length) return null;
  return (
    <View style={s.reactionRow}>
      {reactions.map(r => {
        const meta = REACTION_META[r.reaction as keyof typeof REACTION_META];
        const Icon = meta?.Icon;
        const tint = meta?.tint ?? colors.fog;
        if (!canReact && !r.mine) {
          return (
            <View key={r.reaction} style={s.reactionChip} accessible accessibilityLabel={`${meta?.label ?? r.reaction}, ${r.count}`}>
              {Icon && <Icon size={11} color={tint} strokeWidth={2} />}
              <Text style={s.reactionChipCount}>{r.count}</Text>
            </View>
          );
        }
        return (
          <PressableScale
            key={r.reaction}
            style={[s.reactionChip, r.mine && s.reactionChipMine]}
            onPress={() => onToggle(r.reaction)}
            haptic="selection"
            // Half of the 8pt above and the 6pt between: the default reached 15
            // up into the message, so a long press on its last line took a reaction.
            hitSlop={{ top: 4, bottom: 8, left: 3, right: 3 }}
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
const Dispatch = React.memo(({ msg, isSelf, showAuthor, showDate, canReact, onLongPress, onOpenShare, onReactToggle, onRetry }: {
  msg: LoungeMessage; isSelf: boolean; showAuthor: boolean; showDate: boolean;
  canReact: boolean;
  onLongPress: (msg: LoungeMessage) => void;
  onOpenShare: (msg: LoungeMessage) => void;
  onReactToggle: (messageId: string, reaction: string) => void;
  onRetry: (messageId: string) => void;
}) => {
  const isWithdrawn = !!msg.deleted_at;
  const isSending = msg.status === 'sending';
  const isFailed = msg.status === 'failed';
  // TODAY turns to YESTERDAY at the member's midnight, with the room still open.
  const day = useClock((now) => (showDate ? formatDay(msg.created_at, now) : ''));

  return (
    <View>
      {showDate && (
        <View style={s.dateDivider}>
          <View style={s.dateLine} />
          <View style={s.dateSprocket} />
          <Text style={s.dateText}>{day}</Text>
          <View style={s.dateSprocket} />
          <View style={s.dateLine} />
        </View>
      )}

      <View style={[s.row, isSending && s.rowSending]}>
        {showAuthor && (
          <View style={s.authorRow}>
            {!isSelf && (
              <View style={s.authorAvatar}>
                <RemoteImage uri={msg.avatar_url} style={s.authorAvatarImg} contentFit="cover" transition={150} fallback={!msg.user_id || isDepartedHandle(msg.username) || !msg.username
                  // A departed member's disc is empty, as on every card: no letter of a mark.
                  ? null
                  : <Text style={s.authorAvatarLetter} {...UNSPOKEN}>{initialOf(msg.username)}</Text>} />
              </View>
            )}
            <Text style={[s.authorName, isSelf && s.authorNameSelf]} numberOfLines={1}>
              {isSelf ? 'You' : authorName(msg.user_id, msg.username)}
            </Text>
            <Text style={s.authorTime}>
              {formatClockTime(msg.created_at)}
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
            <PressableScale onLongPress={() => onLongPress(msg)} haptic="medium" disabled={isSending || isFailed}
              // One element to a screen reader, whose long press and whose card
              // inside are out of its reach: they are offered as named actions.
              accessibilityRole="text"
              accessibilityLabel={spokenDispatch(msg)}
              accessibilityActions={isSending || isFailed ? undefined : dispatchActions(msg)}
              onAccessibilityAction={(e) => {
                const act = e.nativeEvent.actionName;
                if (act === 'open' || (act === 'activate' && shareOf(msg))) onOpenShare(msg);
                else if (act === 'link') { const url = firstLink(msg.content); if (url) safeOpenURL(url); }
                else if (act === 'activate' || act === 'longpress') onLongPress(msg);
              }}>
              {Boolean(msg.reply_to_content) && (
                <View style={s.replyQuote}>
                  <Text style={s.replyQuoteAuthor} numberOfLines={1}>{quotedName(msg.reply_to_username)}</Text>
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
            <ReactionChips reactions={msg.reactions} canReact={canReact} onToggle={(r) => onReactToggle(msg.id, r)} />
          )}
        </View>
      </View>
    </View>
  );
});
Dispatch.displayName = 'Dispatch';

/** Between the composer, or a bar in its place, and the home indicator's edge. */
export const BAR_FOOT_GAP = 8;

function formatDay(iso: string, now: number): string {
  const d = new Date(iso);
  const today = new Date(now);
  const yesterday = new Date(now); yesterday.setDate(today.getDate() - 1);
  const sameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString();
  if (sameDay(d, today)) return 'TODAY';
  if (sameDay(d, yesterday)) return 'YESTERDAY';
  return formatDateMonthDay(d, 'long');
}

// ════════════════════════════════════════════════════════════
// MAIN SALON SCREEN
// ════════════════════════════════════════════════════════════
export default function LoungeRoomScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const user = useAuthStore(s => s.user);
  // Who reads, by id: the store hands a new `user` object at each session restore, and a read
  // keyed on the object asked for the room, its roster and the Lounge list again each time (three
  // times in one opening, speed lab 39868403930).
  const userId = user?.id ?? null;
  const router = useRouter();
  const barFoot = useBottomEdge() + BAR_FOOT_GAP;
  const headerTop = usePushedHeaderTop();
  const { isOffline } = useOfflineAware();
  // Each scroll measured on the phones, as one transaction (useScrollTrace).
  const { traceProps } = useScrollTrace();

  const keyboard = useAnimatedKeyboard();
  // iOS only: on Android the root ends at the keyboard (KeyboardRoom).
  const animatedContainerStyle = useAnimatedStyle(() => ({ paddingBottom: Platform.OS === 'ios' ? keyboard.height.value : 0 }));

  const {
    lounges, fetchMessages, sendMessage,
    subscribeToLounge, sending, markRead,
    withdrawMessage, retryMessage, toggleReaction,
    requestMembership, joinPublicLounge, fetchMembers,
    presentCount, typingUsers, broadcastTyping,
  } = useLoungeStore();
  const roomLive = useLoungeStore((st) => st.roomLive);

  const [input, setInput] = useState('');
  const [replyTo, setReplyTo] = useState<LoungeMessage | null>(null);
  const [actionSheetMsg, setActionSheetMsg] = useState<LoungeMessage | null>(null);
  const [reportSheetVisible, setReportSheetVisible] = useState(false);
  const [selectedMessage, setSelectedMessage] = useState<LoungeMessage | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [doorOpen, setDoorOpen] = useState(false);
  const [members, setMembers] = useState<LoungeMember[]>([]);
  const [localLounge, setLocalLounge] = useState<LoungeRoom | null>(null);
  // What the Lounge list knows of this member here, else unknown until the roster
  // is read — never taken for "none" (roomGate.ts, knownStanding).
  const [myStatus, setMyStatus] = useState<RoomStanding>(() => knownStanding(useLoungeStore.getState().lounges, id));
  const [rosterFailed, setRosterFailed] = useState(false);
  const [pending, setPending] = useState(false);
  const [notFound, setNotFound] = useState(false);
  // The room could not be asked for — not "incinerated", which it said of any
  // room opened with no signal.
  const [loadFailed, setLoadFailed] = useState(false);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const askForRoomAgain = useCallback(() => setLoadAttempt((n) => n + 1), []);

  const blockStore = useBlockStore();

  const handleInputChange = useCallback((text: string) => {
    setInput(text);
    // THE HOUSE PULSE — announce the typewriter (throttled in the store).
    if (text.length > 0 && id) broadcastTyping(id);
  }, [id, broadcastTyping]);

  // The room on screen NOW, for answers to compare against the room they were asked for.
  const shownRoomRef = useRef(id);
  useLayoutEffect(() => { shownRoomRef.current = id; });

  // ── Membership + roster refresh (also drives host's "At the Door") ──
  // Asked for, and shown when the answer comes: nothing changes on screen in the asking.
  const refreshMembership = useCallback(() => {
    if (!id) return;
    void fetchMembers(id).then((roster) => {
      // Room A's roster must not become room B's (the screen is reused across rooms).
      if (shownRoomRef.current !== id) return;
      // Unread is not empty: the standing already known stays, and if none is, the
      // room says the list could not be reached (with a way to try again).
      if (!roster) { setRosterFailed(true); return; }
      setRosterFailed(false);
      setMembers(roster);
      const mine = userId ? roster.find(m => m.user_id === userId) : undefined;
      setMyStatus((mine?.status as LoungeMemberStatus) ?? 'none');
    });
  }, [id, userId, fetchMembers]);

  const retryRoster = useCallback(() => {
    setRosterFailed(false);
    refreshMembership();
  }, [refreshMembership]);

  // ── Hydrate lounge metadata + membership ──
  // The screen is reused across rooms. A new room (or another try) starts as it renders from what
  // the list knows of it: the last room's standing, roster, verdict and record are not this one's
  // (its name, privacy and host drew the header and decided the gate until this one's answer came).
  const roomKey = `${loadAttempt}:${id ?? ''}`;
  const [roomFor, setRoomFor] = useState<string | null>(null);
  if (id && roomFor !== roomKey) {
    setRoomFor(roomKey);
    setMyStatus(knownStanding(useLoungeStore.getState().lounges, id));
    setRosterFailed(false);
    setPending(false);
    setMembers([]);
    setNotFound(false);
    setLoadFailed(false);
    setLocalLounge(null);
  }
  useEffect(() => {
    if (!id) return;
    // An answer for the room left behind is dropped.
    let cancelled = false;
    const loadLounge = async () => {
      const { data: loungeData, error } = await supabase.from('lounges').select('*').eq('id', id).maybeSingle();
      if (cancelled) return;
      if (error) { setLoadFailed(true); return; }
      if (!loungeData) { setNotFound(true); return; }
      setLocalLounge(loungeData);
      const store = useLoungeStore.getState();
      if (!store.lounges.some(l => l.id === id)) store.fetchLounges();
    };
    loadLounge();
    refreshMembership();
    return () => { cancelled = true; };
  }, [id, refreshMembership, loadAttempt]);

  const activeLounge = localLounge || lounges.find(l => l.id === id);
  // This room's words, and its read's flags: until the store holds this room, what it holds is
  // another room's (left before this one opened), never to be drawn under this one's name.
  const currentMessages = useLoungeStore((s) => (s.currentLoungeId === id ? s.currentMessages : NO_WORDS));
  const messagesLoading = useLoungeStore((s) => s.currentLoungeId !== id || s.messagesLoading);
  const messagesFailed = useLoungeStore((s) => s.currentLoungeId === id && s.messagesFailed);
  // Written offline and refused for the rank when sent: held for the member, drawn failed with its
  // words and 'tap to retry', as a live send refused so is; after a restart too, as the queue keeps it.
  const heldWords = useHeld('send_lounge_message');
  const shownMessages = useMemo(() => (heldWords.size === 0 ? currentMessages
    : currentMessages.map((m) => (heldWords.has(m.id) && m.status !== 'failed' ? { ...m, status: 'failed' as const } : m))),
  [currentMessages, heldWords]);
  // Failed: the room could not be asked for, and nothing of it is held to show.
  const roomLost = !notFound && loadFailed && !lounges.some((l) => l.id === id);
  const readyMark = useScreenReady('room',
    roomLost || (!notFound && messagesFailed && currentMessages.length === 0) ? 'failed'
      : notFound || loadFailed || (!!activeLounge && (currentMessages.length > 0 || !messagesLoading)) ? 'ready' : 'reading');
  const isCreator = activeLounge?.creator_id === user?.id;
  const isApproved = myStatus === 'approved' || isCreator;
  const isMuted = myStatus === 'muted';
  const canRead = isApproved || isMuted || (activeLounge ? !activeLounge.is_private : false);
  const canPost = isApproved && !isMuted;
  // Speaking and reacting are the Archivist's (DECISIONS 3.4). A seated member without the rank
  // keeps the seat, reads, and takes back their own words and reactions; nothing more is offered.
  const roomHref = id ? `/lounge/${id}` : '/lounge';
  const speaking = useClearance('lounge-speaking', roomHref);
  const reacting = useClearance('lounge-reacting', roomHref);
  const canSpeak = canPost && speaking.held;
  const canReact = canPost && reacting.held;
  const pendingMembers = useMemo(() => members.filter(m => m.status === 'pending'), [members]);
  // Seated: the roster's, or the room's own count until the roster is read.
  const seated = members.filter(m => m.status !== 'pending').length || activeLounge?.member_count || 0;

  // What gate (if any) replaces the transcript.
  const gate: RoomGate = !activeLounge ? 'chat' : roomGate({
    isPrivate: !!activeLounge.is_private,
    isCreator,
    standing: myStatus,
    requesting: pending,
    rosterFailed,
  });

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
        // Straight to the Dispatch's reader (not the redirecting /dossier/), by
        // `nav`: the generated route types do not know /dispatch/[id] yet.
        if (typeof meta.dossier_id === 'string') nav.push(`/dispatch/${meta.dossier_id}`);
        break;
    }
  }, [router]);
  const handleReport = useCallback((msg: LoungeMessage) => {
    setSelectedMessage(msg); setActionSheetMsg(null); setReportSheetVisible(true);
  }, []);
  // blockUser updates the store before it awaits the server, so the purge sees the
  // block at once and the member's messages leave the room as the toast says.
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

  // ── Initial fetch ──
  useEffect(() => {
    if (!id) return;
    fetchMessages(id);
    markRead(id);
    return () => { markRead(id); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // ── The live channel (messages, reactions, seats, presence, typing) ──
  // Joined only when the salon's own rules let this member receive it (an open
  // salon, or a seat in a private one), with presence and typing from a seat
  // alone; joined again whenever either changes, without leaving the room. A
  // seat lost in a private salon leaves the channel at once.
  const listening = !!activeLounge && (!activeLounge.is_private || myStatus === 'approved');
  const seatedHere = myStatus === 'approved';
  useEffect(() => {
    if (!id || !listening) return;
    return subscribeToLounge(id, { seated: seatedHere, onMembership: () => { refreshMembership(); } });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, listening, seatedHere]);

  // A member waiting at a private door has no channel to hear the door open on;
  // their admission arrives as a notice, so each new notice asks again.
  const noticesHeard = useNotificationStore((s) => s.noticesHeard);
  useEffect(() => {
    if (myStatus === 'pending') refreshMembership();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [noticesHeard]);

  const handleSend = useCallback(() => {
    if (!input.trim() || sending || !id) return;
    sendMessage(id, input.trim(), 'text', {
      reply_to_id: replyTo?.id,
      // Kept with the reply: only a real handle (or the database's own mark), never a stand-in.
      reply_to_username: replyTo?.username || undefined,
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
    // The door promises to let them in the moment they're admitted: the moment to ask to send word.
    if (result === 'requested' && userId) void offerWord('seat', userId);
  }, [id, requestMembership, refreshMembership, userId]);

  // From the registry the Society page sells from; enforced by tr_tier_gate_lounge_*.
  const seat = useClearance('the-lounge', id ? `/lounge/${id}` : '/lounge');

  const handleTakeSeat = useCallback(async () => {
    if (!id) return;
    TactileEngine.mutate();
    const ok = await joinPublicLounge(id);
    if (ok) { setMyStatus('approved'); refreshMembership(); }
  }, [id, joinPublicLounge, refreshMembership]);

  // ── Edge: not found ──
  // The way out says where it goes: back where there is a back, else the Lobby
  // (opened from a notice, there is no back, and the router's own back did nothing).
  if (notFound) {
    const wayOut = nav.canGoBack() ? 'GO BACK' : 'RETURN TO THE LOBBY';
    return (
      <View style={s.centered}>
        <RoomLight room="default" />
        {readyMark}
        <Buster size={80} mood="suspicious" />
        <Text style={s.edgeTitle}>Signal Lost</Text>
        <Text style={s.edgeDesc}>This screening room has been incinerated or never existed.</Text>
        <PressableScale style={s.edgeBtn} onPress={() => nav.back()} haptic="medium" accessibilityRole="button" accessibilityLabel={wayOut}>
          <Text style={s.edgeBtnText}>{wayOut}</Text>
        </PressableScale>
      </View>
    );
  }

  // ── Edge: could not be reached (and nothing of it held) ──
  if (loadFailed && !lounges.some((l) => l.id === id)) {
    return (
      <View style={s.centered}>
        <RoomLight room="default" />
        {readyMark}
        <EmptyOffline
          onRetry={askForRoomAgain}
          wayOut={{ label: nav.canGoBack() ? 'Go back' : 'Return to the Lobby', onPress: () => nav.back() }}
        />
      </View>
    );
  }

  // ── Edge: loading ──
  if (!activeLounge) {
    return (
      <View style={s.centered}>
        <RoomLight room="default" />
        {readyMark}
        <BusterEyes />
        <Text style={s.edgeLoad}>ESTABLISHING CONNECTION</Text>
      </View>
    );
  }

  return (
    <Animated.View style={[s.container, animatedContainerStyle]}>
      <RoomLight room="default" />
      {readyMark}
      {/* ── Marquee header ── */}
      <View style={[s.header, { paddingTop: headerTop }]}>
        <PressableScale style={s.headerBtn} onPress={() => nav.back()} haptic="selection" accessibilityRole="button" accessibilityLabel="Back">
          <ArrowLeft size={20} color={colors.parchment} strokeWidth={1.5} />
        </PressableScale>

        <View style={s.headerCenter}>
          <View style={s.headerCrest}><MasterLogo size={22} /></View>
          <Text style={s.headerTitle} numberOfLines={1}>{activeLounge.name}</Text>
          <View style={s.headerMeta}>
            <Text style={s.headerMetaText} numberOfLines={1}>
              {counted(seated, 'MEMBER', 'MEMBERS')}
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
          data={shownMessages}
          extraData={canReact}
          keyExtractor={(item) => item.id}
          {...traceProps}
          contentContainerStyle={s.list}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          maintainVisibleContentPosition={{ startRenderingFromBottom: true, autoscrollToBottomThreshold: 0.2 }}
          onStartReached={() => { if (id) useLoungeStore.getState().loadMoreMessages(id); }}
          onStartReachedThreshold={0.5}
          renderItem={({ item, index }) => {
            const isSelf = item.user_id === user?.id;
            const prev = shownMessages[index - 1];
            const gap = prev ? new Date(item.created_at).getTime() - new Date(prev.created_at).getTime() : Infinity;
            const showAuthor = !prev || prev.user_id !== item.user_id || gap > 300000;
            const showDate = !prev || new Date(item.created_at).toDateString() !== new Date(prev.created_at).toDateString();
            return (
              <Dispatch
                msg={item}
                isSelf={isSelf}
                showAuthor={showAuthor}
                showDate={showDate}
                canReact={canReact}
                onLongPress={handleLongPress}
                onOpenShare={handleOpenShare}
                onReactToggle={toggleReaction}
                onRetry={retryMessage}
              />
            );
          }}
          ListEmptyComponent={
            // Empty only once read: while its words are on their way, or could not come, the
            // room says that, never "be the first".
            messagesFailed ? (
              // Not awaited: the read says how it ended in the store's flags, which draw this list.
              <EmptyOffline onRetry={() => { if (id) void fetchMessages(id); }} />
            ) : messagesLoading ? (
              <View style={s.emptyChat}>
                <BusterEyes />
                <Text style={s.edgeLoad}>RETRIEVING THE CONVERSATION</Text>
              </View>
            ) : (
              <View style={s.emptyChat}>
                <Buster size={48} mood="seated" />
                <Text style={s.edgeTitle}>The Conversation Begins</Text>
                <Text style={s.edgeDesc}>Be the first to break the silence.</Text>
              </View>
            )
          }
        />
      ) : (
        <GateView
          gate={gate}
          lounge={activeLounge}
          memberCount={seated}
          onRequest={handleRequest}
          onRetry={retryRoster}
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
      {/* Online, but the room's live channel is down: said quietly, and the room is read again
          every few seconds until it answers (watchChannel). */}
      {!isOffline && !roomLive && canRead && (
        <View style={s.offlineBanner}>
          <Radio size={14} color={colors.sepia} strokeWidth={1.5} />
          <Text style={s.offlineText}>Not live — the room is read again every few seconds.</Text>
        </View>
      )}

      {/* ── Composer / preview / muted ── */}
      {gate === 'chat' && canSpeak && (
        <View style={[s.composer, { paddingBottom: barFoot }]}>
          {/* THE HOUSE PULSE — the typewriter line. Reserved height: the
              composer never shifts a pixel when a typist appears or goes quiet. */}
          <View style={s.typingLine}>
            <Presence>
              {typingUsers.length > 0 && (
                <PresenceView key="typing" name="lounge.typing" style={s.typingRow}
                  enter={{ kind: 'FadeIn', duration: 250 }} exit={{ kind: 'FadeOut', duration: 200 }}>
                  <View style={s.typingDot} />
                  <Text style={s.typingText} numberOfLines={1}>
                    {typingUsers.length === 1
                      ? `AT THE TYPEWRITER — @${typingUsers[0].toUpperCase()}`
                      : 'SEVERAL MEMBERS AT THE TYPEWRITER…'}
                  </Text>
                </PresenceView>
              )}
            </Presence>
          </View>
          <Presence>
          {replyTo && (
            <PresenceView key="reply" name="lounge.reply" style={s.replyBanner}
              enter={{ kind: 'FadeIn', duration: 200 }} exit={{ kind: 'FadeOut', duration: 150 }}>
              <View style={s.replyBannerCol}>
                <Text style={s.replyBannerAuthor} numberOfLines={1}>Replying to {authorName(replyTo.user_id, replyTo.username)}</Text>
                <Text style={s.replyBannerText} numberOfLines={1}>{replyTo.content || 'Shared content'}</Text>
              </View>
              <PressableScale onPress={() => setReplyTo(null)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} haptic="selection" accessibilityRole="button"
                accessibilityLabel="Cancel the reply">
                <X size={14} color={colors.fog} strokeWidth={1.5} />
              </PressableScale>
            </PresenceView>
          )}
          </Presence>
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
              style={[s.sendBtn, !input.trim() && UNREADY.plate]}
              onPress={handleSend}
              disabled={!input.trim() || sending}
              haptic="medium"
              accessibilityRole="button"
              accessibilityLabel="Send the dispatch"
            >
              <Send size={16} color={input.trim() ? colors.ink : UNREADY_INK} strokeWidth={2} />
            </PressableScale>
          </View>
        </View>
      )}

      {/* Seated without the rank to speak: their seat and their words are kept, and the rope
          stands where the composer would. */}
      {gate === 'chat' && canPost && !speaking.held && (
        <View style={[s.previewBar, { paddingBottom: barFoot }]}>
          <Text style={s.speakText}>
            {speaking.standing === 'reading'
              ? 'You keep your seat. Your rank is being read.'
              : `You keep your seat and every word you wrote. ${speaking.standing === 'lapsed'
                ? 'Your dues have lapsed.'
                : `Speaking is for ${speaking.rank === 'auteur' ? 'Auteurs' : 'Archivists'}.`}`}
          </Text>
          <PressableScale
            style={s.previewBtn}
            onPress={speaking.open}
            haptic="medium"
            accessibilityRole="button"
            accessibilityLabel={ropeSpoken('Speak in this salon', speaking.rank, speaking.standing)}
          >
            <Text style={s.previewBtnText}>{speaking.standing === 'reading' ? '✦ ASK AGAIN' : '✦ ASCEND THE RANKS'}</Text>
          </PressableScale>
        </View>
      )}

      {/* A public room still reads for a member the host has banned; they are
          told why there is no seat, not offered one. */}
      {gate === 'banned' && canRead && (
        <View style={[s.mutedBar, { paddingBottom: barFoot }]}>
          <VolumeX size={13} color={colors.fog} strokeWidth={1.5} />
          <Text style={s.mutedText}>You no longer have a seat in this salon — you can read, but not post.</Text>
        </View>
      )}

      {gate === 'chat' && isMuted && (
        <View style={[s.mutedBar, { paddingBottom: barFoot }]}>
          <VolumeX size={13} color={colors.fog} strokeWidth={1.5} />
          <Text style={s.mutedText}>You&apos;ve been muted — you can read, but not post.</Text>
        </View>
      )}

      {/* A public salon reads for any member; the rope sits on the one act that
          needs the rank, taking a seat. */}
      {gate === 'preview' && (
        <Arrive name="salon-preview-bar" duration={300} rise={80} style={[s.previewBar, { paddingBottom: barFoot }]}>
          <Text style={s.previewText}>
            {seat.held
              ? "You're previewing this salon."
              : seat.standing === 'reading'
                ? "You're reading as a guest while your rank is read."
              : seat.standing === 'lapsed'
                ? "You're reading as a guest — your dues have lapsed."
                : "You're reading as a guest."}
          </Text>
          <PressableScale
            style={s.previewBtn}
            onPress={seat.held ? handleTakeSeat : seat.open}
            haptic="medium"
            accessibilityRole="button"
            accessibilityLabel={seat.held
              ? 'Take a seat in this salon'
              : seat.standing === 'reading' ? 'Take a seat. Your rank is being read. Ask again.'
              : `Take a seat. ${seat.rank === 'auteur' ? 'The Auteur' : 'The Archivist'} opens this. Opens the Society.`}
          >
            <Text style={s.previewBtnText}>
              {seat.held ? 'TAKE A SEAT' : seat.standing === 'reading' ? '✦ ASK AGAIN' : '✦ ASCEND THE RANKS'}
            </Text>
          </PressableScale>
        </Arrive>
      )}

      {/* A public room is readable while the roster is out; if it cannot be read,
          the member is told why they cannot post, and may ask again. */}
      {gate === 'unreachable' && canRead && (
        <View style={[s.mutedBar, { paddingBottom: barFoot }]}>
          <Text style={s.mutedText}>Your seat could not be confirmed.</Text>
          <PressableScale style={s.retryBtn} onPress={retryRoster} haptic="selection" accessibilityRole="button"
            accessibilityLabel="Try again to confirm your seat">
            <Text style={s.retryText}>TRY AGAIN</Text>
          </PressableScale>
        </View>
      )}

      {/* ── Overlays ── */}
      <ActionSheet
        visible={!!actionSheetMsg}
        msg={actionSheetMsg}
        isSelf={actionSheetMsg?.user_id === user?.id}
        canReact={canReact}
        canReply={canSpeak}
        currentReactions={actionSheetMsg?.reactions}
        onClose={() => setActionSheetMsg(null)}
        onReply={setReplyTo}
        onReact={(reaction) => { if (actionSheetMsg) toggleReaction(actionSheetMsg.id, reaction); }}
        onDelete={withdrawMessage}
        onReport={handleReport}
        onBlock={handleBlock}
      />
      {selectedMessage?.user_id && (
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
export function GateView({ gate, lounge, memberCount, onRequest, onRetry, pending }: {
  gate: RoomGate;
  lounge: LoungeRoom; memberCount: number; onRequest: () => void; onRetry: () => void; pending: boolean;
}) {
  return (
    <Arrive name="lounge-1" duration={400} style={s.gate}>
      <View style={s.gateCrest}><MasterLogo size={52} /></View>
      <Text style={s.gateName}>{lounge.name}</Text>
      <View style={s.gatePrivateRow}>
        <Lock size={11} color={colors.sepia} strokeWidth={1.5} />
        <Text style={s.gatePrivateLabel}>PRIVATE SALON</Text>
      </View>
      {!!lounge.description && <Text style={s.gateDesc}>{lounge.description}</Text>}
      <Text style={s.gateMembers}>{counted(memberCount, 'member', 'members')} behind the door</Text>

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
      {gate === 'knocking' && (
        <View style={s.gatePending} accessibilityLiveRegion="polite">
          <ActivityIndicator size="small" color={colors.sepia} />
          <Text style={s.edgeLoad}>CHECKING THE GUEST LIST</Text>
        </View>
      )}
      {gate === 'unreachable' && (
        <>
          <Text style={s.gateCopy}>The guest list could not be reached, so the door cannot say whether you are expected.</Text>
          <PressableScale style={s.gateBtn} onPress={onRetry} haptic="medium" accessibilityRole="button"
            accessibilityLabel="Try the guest list again">
            <Text style={s.gateBtnText}>TRY AGAIN</Text>
          </PressableScale>
        </>
      )}
    </Arrive>
  );
}

// ════════════════════════════════════════════════════════════
// STYLES — Editorial Salon
// ════════════════════════════════════════════════════════════
const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.ink },

  // ── Edge states ──
  centered: { flex: 1, backgroundColor: colors.ink, justifyContent: 'center', alignItems: 'center', gap: 12, paddingHorizontal: 32 },
  edgeLoad: { fontFamily: fonts.sub, fontSize: 10, letterSpacing: 2.4, color: colors.fog, includeFontPadding: false },
  edgeTitle: { fontFamily: fonts.display, fontSize: 22, color: colors.parchment, textAlign: 'center' },
  edgeDesc: { fontFamily: fonts.serif, fontSize: 14, color: colors.fog, textAlign: 'center', lineHeight: 21 },
  edgeBtn: { marginTop: 20, backgroundColor: colors.sepia, paddingHorizontal: 24, paddingVertical: 12, borderRadius: 4 },
  edgeBtnText: { fontFamily: fonts.sub, fontSize: 10, letterSpacing: 2, color: colors.ink, includeFontPadding: false },

  // ── Header (marquee chrome) ──
  header: {
    paddingBottom: 12, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center',
    backgroundColor: colors.ink, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.ash,
  },
  headerBtn: { padding: 8 },
  headerCenter: { flex: 1, alignItems: 'center' },
  headerCrest: { marginBottom: 5, opacity: 0.95 },
  headerTitle: { fontFamily: fonts.sub, fontSize: 16, color: colors.parchment, letterSpacing: 0.3 },
  headerMeta: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 3 },
  headerMetaText: { fontFamily: fonts.sub, fontSize: 10, letterSpacing: 0.6, color: colors.fog, includeFontPadding: false },
  metaDot: { width: 2, height: 2, borderRadius: 1, backgroundColor: colors.fog, marginHorizontal: 3 },
  metaPrivate: { fontFamily: fonts.sub, fontSize: 10, letterSpacing: 0.6, color: colors.sepia, includeFontPadding: false },
  // THE HOUSE PULSE — a true brass ember, lit only when others are present.
  presenceEmber: {
    width: 5, height: 5, borderRadius: 3, backgroundColor: colors.marqueeGold,
    shadowColor: colors.marqueeGold, shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.8, shadowRadius: 4, elevation: 3,
    marginRight: 1,
  },
  presenceText: { fontFamily: fonts.sub, fontSize: 10, letterSpacing: 0.6, color: colors.marqueeGold, includeFontPadding: false },
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
  dateText: { fontFamily: fonts.sub, fontSize: 10, letterSpacing: 1.6, color: colors.fog, includeFontPadding: false },

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
  // Solid, not faded: a word must not borrow its contrast from the ground behind it.
  authorTime: { fontFamily: fonts.sub, fontSize: 10, color: colors.fogQuiet, includeFontPadding: false },

  contentCol: { paddingLeft: 32 },
  contentColSelf: { paddingLeft: 13, marginLeft: 11, borderLeftWidth: 2, borderLeftColor: 'rgba(184,137,26,0.45)' },

  bodyText: { fontFamily: fonts.serif, fontSize: 15.5, color: colors.parchment, lineHeight: 24 },
  link: { color: colors.flicker, textDecorationLine: 'underline' },

  tombstone: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  tombstoneText: { fontFamily: fonts.serifItalic, fontSize: 13.5, color: colors.fog },

  stateLine: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 5 },
  stateLineText: { fontFamily: fonts.sub, fontSize: 10, color: colors.fog, includeFontPadding: false },
  // A word: the PANNED icon's pigment reads 2.78:1 as text, so the family's ink.
  stateLineFail: { color: colors.crimsonInk },

  // ── Reply pull-quote ──
  replyQuote: { borderLeftWidth: 2, borderLeftColor: colors.sepia, paddingLeft: 10, marginBottom: 7 },
  replyQuoteAuthor: { fontFamily: fonts.sub, fontSize: 10, letterSpacing: 0.4, color: colors.sepia, marginBottom: 2, includeFontPadding: false },
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
  sharedTypeText: { fontFamily: fonts.sub, fontSize: 10, letterSpacing: 0.8, color: colors.sepia, includeFontPadding: false },
  sharedTitle: { fontFamily: fonts.sub, fontSize: 13, color: colors.bone, lineHeight: 17 },
  sharedByline: { fontFamily: fonts.sub, fontSize: 10, letterSpacing: 0.8, color: colors.fog, marginTop: 4 },

  emptyChat: { alignItems: 'center', justifyContent: 'center', paddingVertical: 80, gap: 10 },

  // ── Offline banner ──
  offlineBanner: { ...EDGE_LIT,
    flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingVertical: 9,
    backgroundColor: colors.soot, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: 'rgba(184,137,26,0.25)',
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
  typingText: { fontFamily: fonts.sub, fontSize: 10, letterSpacing: 0.8, color: colors.sepia, includeFontPadding: false },
  replyBanner: { ...EDGE_LIT,
    flexDirection: 'row', alignItems: 'center', backgroundColor: colors.soot, paddingVertical: 8, paddingHorizontal: 12,
    borderRadius: 4, marginBottom: 8, borderLeftWidth: 2, borderLeftColor: colors.sepia, gap: 10,
  },
  replyBannerCol: { flex: 1 },
  replyBannerAuthor: { fontFamily: fonts.sub, fontSize: 10, letterSpacing: 0.4, color: colors.sepia, marginBottom: 2, includeFontPadding: false },
  replyBannerText: { fontFamily: fonts.serif, fontSize: 12.5, color: colors.fog },
  inputRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
  input: {
    flex: 1, minHeight: 42, maxHeight: 120, backgroundColor: colors.well, borderRadius: 21,
    paddingHorizontal: 16, paddingTop: 12, paddingBottom: 12, color: colors.parchment,
    fontFamily: fonts.serif, fontSize: 15, lineHeight: 20, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.ash,
  },
  sendBtn: {
    width: 42, height: 42, borderRadius: 21, backgroundColor: colors.sepia, alignItems: 'center', justifyContent: 'center',
    shadowColor: colors.sepia, shadowOpacity: 0.3, shadowRadius: 8, shadowOffset: { width: 0, height: 2 },
  },

  // ── Muted bar ──
  mutedBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingTop: 14, paddingHorizontal: 16,
    backgroundColor: colors.ink, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.ash,
  },
  mutedText: { fontFamily: fonts.serifItalic, fontSize: 13, color: colors.fog },
  retryBtn: { minHeight: 48, justifyContent: 'center', paddingHorizontal: 8 },
  retryText: { fontFamily: fonts.sub, fontSize: 10, letterSpacing: 2, color: colors.sepia, includeFontPadding: false },

  // ── Preview bar ──
  previewBar: {
    paddingHorizontal: 16, paddingTop: 16, backgroundColor: colors.ink,
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.ash, alignItems: 'center', gap: 12,
  },
  previewText: { fontFamily: fonts.serifItalic, fontSize: 13, color: colors.fog },
  // Two sentences, centred over the rope: they may wrap.
  speakText: { fontFamily: fonts.serifItalic, fontSize: 13, lineHeight: 19, color: colors.fog, textAlign: 'center' },
  previewBtn: { backgroundColor: colors.sepia, paddingHorizontal: 24, paddingVertical: 12, borderRadius: 4, width: '100%', alignItems: 'center' },
  previewBtnText: { fontFamily: fonts.sub, fontSize: 10, letterSpacing: 2, color: colors.ink, includeFontPadding: false },

  // ── Gate (velvet rope) ──
  gate: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 36, gap: 12 },
  gateCrest: { marginBottom: 6, opacity: 0.95 },
  gateName: { fontFamily: fonts.display, fontSize: 26, color: colors.parchment, textAlign: 'center', lineHeight: 32 },
  gatePrivateRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  gatePrivateLabel: { fontFamily: fonts.sub, fontSize: 10, letterSpacing: 2, color: colors.sepia, includeFontPadding: false },
  gateDesc: { fontFamily: fonts.serif, fontSize: 15, color: colors.bone, textAlign: 'center', lineHeight: 23 },
  gateMembers: { fontFamily: fonts.sub, fontSize: 10, letterSpacing: 0.8, color: colors.fog, marginTop: 2, includeFontPadding: false },
  gateCopy: { fontFamily: fonts.serifItalic, fontSize: 13.5, color: colors.fog, textAlign: 'center', lineHeight: 21, marginTop: 4 },
  gateBtn: { marginTop: 14, backgroundColor: colors.sepia, paddingHorizontal: 32, paddingVertical: 14, borderRadius: 4, minWidth: 200, alignItems: 'center' },
  gateBtnText: { fontFamily: fonts.sub, fontSize: 10, letterSpacing: 2.5, color: colors.ink, includeFontPadding: false },
  gatePending: { alignItems: 'center', gap: 8, marginTop: 14 },
  gatePendingText: { fontFamily: fonts.sub, fontSize: 15, color: colors.parchment, letterSpacing: 0.3 },
});

// Expo Router per-route crash net — see src/components/RouteErrorBoundary.tsx
export { RouteErrorBoundary as ErrorBoundary } from '@/src/components/RouteErrorBoundary';
