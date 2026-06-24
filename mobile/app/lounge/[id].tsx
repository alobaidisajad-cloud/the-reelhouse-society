import Buster from '@/src/components/Buster';
import { ActionSheet } from '@/src/components/lounge/ActionSheet';
import ReportSheet from '@/src/components/moderation/ReportSheet';
import PressableScale from '@/src/components/PressableScale';
import { supabase } from '@/src/lib/supabase';
import { tmdb } from '@/src/lib/tmdb';
import { useAuthStore } from '@/src/stores/auth';
import { useBlockStore } from '@/src/stores/blockStore';
import { LoungeMessage, LoungeRoom, useLoungeStore } from '@/src/stores/lounge';
import { colors, fonts } from '@/src/theme/theme';
import { LoungeMember } from '@/src/types';
import { isArchivistPlusTier } from '@/src/utils/tier';
import { FlashList } from '@shopify/flash-list';
import { BlurView } from 'expo-blur';
import * as ExpoClipboard from 'expo-clipboard';
import TactileEngine from '@/src/utils/TactileEngine';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
    ArrowLeft,
    Check,
    Copy,
    Crown,
    Lock,
     
    LogOut,
    Reply,
    Send,
    Settings,
    Sparkles,
    Trash2,
    Users,
    X
} from 'lucide-react-native';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    AppState,
    InteractionManager,
    Modal,
    StyleSheet,
    Text,
    TextInput,
    View,
} from 'react-native';
import Animated, { FadeIn, FadeOut, SlideInDown, SlideOutDown, useAnimatedKeyboard, useAnimatedStyle } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const AnimatedView = Animated.createAnimatedComponent(View);

// ════════════════════════════════════════════════════════════
// SHARED CONTENT CARD — Film/Log share embed
// ════════════════════════════════════════════════════════════
 
const SharedCard = React.memo(({ msg }: { msg: LoungeMessage }) => {
  if (!msg.film_title && !msg.film_id) return null;
  const typeLabel = msg.type === 'film_share' ? 'FILM' : msg.type.toUpperCase().replace('_SHARE', '');
  const posterUrl = msg.film_poster ? tmdb.poster(msg.film_poster, 'w342') : null;

  return (
    <View style={s.sharedCard}>
      {posterUrl && <Image source={{ uri: posterUrl }} style={s.sharedPoster} contentFit="cover" cachePolicy="memory-disk" />}
      <View style={s.sharedInfo}>
        <View style={s.sharedTypeBadge}>
          <Sparkles size={7} color={colors.sepia} strokeWidth={2} />
          <Text style={s.sharedTypeText} numberOfLines={1}>{typeLabel}</Text>
        </View>
        <Text style={s.sharedTitle} numberOfLines={2}>{msg.film_title}</Text>
      </View>
    </View>
  );
});

// ════════════════════════════════════════════════════════════
// MESSAGE BUBBLE
// ════════════════════════════════════════════════════════════
 
const MessageBubble = React.memo(({ msg, isSelf, showAuthor, onLongPress }: {
  msg: LoungeMessage; isSelf: boolean; showAuthor: boolean;
  onLongPress: (msg: LoungeMessage) => void;
}) => {
  return (
    <View style={[s.msgWrapper, isSelf ? s.msgSelf : s.msgOther, !showAuthor && s.msgCompact]}>
      {showAuthor && !isSelf && (
        <View style={s.msgAvatar}>
          {msg.avatar_url
            ? <Image source={{ uri: msg.avatar_url }} style={s.msgAvatarImg} contentFit="cover" cachePolicy="memory-disk" />
            : <Text style={s.msgAvatarLetter}>{msg.username?.[0]?.toUpperCase()}</Text>
          }
        </View>
      )}

      <View style={[s.msgContentCol, isSelf && s.msgContentColSelf]}>
        {showAuthor && (
          <View style={[s.msgHeader, isSelf && s.msgHeaderSelf]}>
            <Text style={[s.msgAuthor, { flexShrink: 1 }]} numberOfLines={1}>{isSelf ? 'You' : msg.username}</Text>
            <Text style={s.msgTime}>
              {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </Text>
          </View>
        )}

        <PressableScale
          onLongPress={() => onLongPress(msg)}
          style={[s.msgBubble, isSelf ? s.msgBubbleSelf : s.msgBubbleOther]}
          haptic="medium"
        >
          {Boolean(msg.reply_to_content) && (
            <View style={s.replyQuote}>
              <View style={s.replyQuoteHeader}>
                <Reply size={9} color={colors.sepia} strokeWidth={2} />
                <Text style={[s.replyQuoteAuthor, { flexShrink: 1 }]} numberOfLines={1}>{msg.reply_to_username || 'Unknown'}</Text>
              </View>
              <Text style={s.replyQuoteContent} numberOfLines={2}>{msg.reply_to_content}</Text>
            </View>
          )}

          {Boolean(msg.content) && <Text style={s.msgText}>{msg.content}</Text>}
          {msg.type !== 'text' && <SharedCard msg={msg} />}
        </PressableScale>
      </View>
    </View>
  );
});


// ════════════════════════════════════════════════════════════
// SETTINGS PANEL
// ════════════════════════════════════════════════════════════
interface LoungeSettingsPanelProps {
  lounge: LoungeRoom;
  members: LoungeMember[];
  visible: boolean;
  onClose: () => void;
  isCreator: boolean;
}

function LoungeSettingsPanel({ lounge, members, visible, onClose, isCreator }: LoungeSettingsPanelProps) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { leaveLounge, deleteLounge } = useLoungeStore();
  const [copied, setCopied] = useState(false);

  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  const handleCopyCode = async () => {
    if (lounge.invite_code) {
      ExpoClipboard.setStringAsync(lounge.invite_code);
      TactileEngine.success();
      setCopied(true);
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      timeoutRef.current = setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleLeave = () => {
    Alert.alert('Leave Lounge?', 'You will need a new invite to rejoin a private lounge.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Leave', style: 'destructive', onPress: async () => {
        TactileEngine.destroy();
        await leaveLounge(lounge.id);
        onClose();
        InteractionManager.runAfterInteractions(() => router.replace('/(tabs)/lounge' as any));
      }},
    ]);
  };

  const handleDelete = () => {
    Alert.alert('Incinerate Lounge?', 'All messages and member history will be permanently destroyed.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Incinerate', style: 'destructive', onPress: async () => {
        TactileEngine.warn();
        await deleteLounge(lounge.id);
        onClose();
        InteractionManager.runAfterInteractions(() => router.replace('/(tabs)/lounge' as any));
      }},
    ]);
  };

  const renderMember = useCallback(({ item }: { item: LoungeMember }) => (
    <View style={s.memberRow}>
      <View style={s.memberAvatar}>
        {item.avatar_url
          ? <Image source={{ uri: item.avatar_url }} style={s.memberAvatarImg} contentFit="cover" cachePolicy="memory-disk" />
          : <Users size={13} color={colors.fog} strokeWidth={1.5} />
        }
      </View>
      <Text style={[s.memberName, { flexShrink: 1, marginRight: 8 }]} numberOfLines={1}>@{item.username?.toUpperCase()}</Text>
      {item.user_id === lounge.creator_id && (
        <View style={s.memberBadge}>
          <Crown size={9} color={colors.sepia} strokeWidth={2} />
          <Text style={s.memberBadgeText} numberOfLines={1}>FOUNDER</Text>
        </View>
      )}
    </View>
  ), [lounge.creator_id]);

  if (!visible) return null;

  return (
    <Modal transparent visible animationType="fade" onRequestClose={onClose}>
      <BlurView intensity={50} tint="dark" style={StyleSheet.absoluteFill}>
        <PressableScale style={s.actionBackdrop} onPress={onClose}><View /></PressableScale>
      </BlurView>
      <AnimatedView entering={SlideInDown.springify()} exiting={SlideOutDown} style={[s.settingsSheet, { paddingBottom: Math.max(insets.bottom, 28) }]}>
        <View style={s.actionHandle} />
        <View style={s.settingsHeaderRow}>
          <Text style={s.settingsTitle}>Lounge Settings</Text>
          <PressableScale onPress={onClose} hitSlop={{ top: 10, right: 10, bottom: 10, left: 10 }} haptic="selection" accessibilityRole="button" accessibilityLabel="Close Settings">
            <X size={20} color={colors.fog} strokeWidth={1.5} />
          </PressableScale>
        </View>

        <FlashList
          data={members}
          keyExtractor={item => item.user_id}
          showsVerticalScrollIndicator={false}
          /* estimatedItemSize for member rows */
          estimatedItemSize={56}
          ListHeaderComponent={
            <View style={s.settingsListHeader}>
              {lounge.is_private && lounge.invite_code && (
                <View style={s.settingsSection}>
                  <Text style={s.settingsLabel}>INVITE CODE</Text>
                  <PressableScale style={s.inviteCodeBtn} onPress={handleCopyCode} accessibilityRole="button">
                    <Text style={s.inviteCodeText}>{lounge.invite_code}</Text>
                    {copied
                      ? <Check size={16} color={colors.sepia} strokeWidth={2} />
                      : <Copy size={16} color={colors.fog} strokeWidth={1.5} />
                    }
                  </PressableScale>
                </View>
              )}
              <Text style={s.settingsLabel}>MEMBERS ({members?.length || 0})</Text>
            </View>
          }
          renderItem={renderMember}
          ListFooterComponent={
            <View style={s.settingsFooter}>
              {isCreator ? (
                <PressableScale style={s.leaveBtn} onPress={handleDelete} accessibilityRole="button">
                  <Trash2 size={14} color={colors.sepia} strokeWidth={1.5} />
                  <Text style={s.leaveBtnText} numberOfLines={1}>INCINERATE LOUNGE</Text>
                </PressableScale>
              ) : (
                <PressableScale style={s.leaveBtn} onPress={handleLeave} accessibilityRole="button">
                  <LogOut size={14} color={colors.sepia} strokeWidth={1.5} />
                  <Text style={s.leaveBtnText} numberOfLines={1}>STEP OUT OF LOUNGE</Text>
                </PressableScale>
              )}
            </View>
          }
        />
      </AnimatedView>
    </Modal>
  );
}

// ════════════════════════════════════════════════════════════
// MAIN CHAT ROOM
// ════════════════════════════════════════════════════════════
export default function LoungeRoomScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const user = useAuthStore(s => s.user);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const isArchivist = isArchivistPlusTier(user);
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const keyboard = useAnimatedKeyboard();
  const animatedContainerStyle = useAnimatedStyle(() => ({
    paddingBottom: keyboard.height.value,
  }));

  const {
    lounges, currentMessages, fetchMessages, sendMessage,
    deleteMessage, subscribeToLounge, sending, markRead,
  } = useLoungeStore();
  const [input, setInput] = useState('');
  const [replyTo, setReplyTo] = useState<LoungeMessage | null>(null);
  const [actionSheetMsg, setActionSheetMsg] = useState<LoungeMessage | null>(null);
  const [reportSheetVisible, setReportSheetVisible] = useState(false);
  const [selectedMessage, setSelectedMessage] = useState<LoungeMessage | null>(null);

  const blockStore = useBlockStore();

  // Callback isolation: stabilize chat input handler
  const handleInputChange = useCallback((text: string) => {
    setInput(text);
  }, []);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [members, setMembers] = useState<LoungeMember[]>([]);
  const [localLounge, setLocalLounge] = useState<LoungeRoom & { is_member?: boolean } | null>(null);
  const [joining, setJoining] = useState(false);
  const [notFound, setNotFound] = useState(false);

  const flatListRef = useRef<any>(null);

  // Autonomous hydration & Membership Check
  useEffect(() => {
    if (!id) return;

    const loadLounge = async () => {
      // 1. Fetch lounge data
      const { data: loungeData, error } = await supabase
        .from('lounges')
        .select('*')
        .eq('id', id)
        .single();
        
      if (!loungeData || error) {
        setNotFound(true);
        return;
      }

      // 2. Fetch membership status
      let isMember = false;
      if (user) {
        const { data: memberCheck } = await supabase
          .from('lounge_members')
          .select('id')
          .eq('lounge_id', id)
          .eq('user_id', user.id)
          .single();
        isMember = !!memberCheck;
      }

      setLocalLounge({ ...loungeData, is_member: isMember });

      // Trigger global state sync if not present
      const store = useLoungeStore.getState();
      const loungeExists = store.lounges.some(l => l.id === id);
      if (!loungeExists && isMember) {
        store.fetchLounges();
      }
    };

    loadLounge();
  }, [id, user]);

  const activeLounge = localLounge || lounges.find(l => l.id === id);
  const isCreator = activeLounge?.creator_id === user?.id;
  const isMember = localLounge?.is_member === true;

  const handleLongPress = useCallback((msg: LoungeMessage) => {
    setActionSheetMsg(msg);
  }, []);

  const handleReport = useCallback((msg: LoungeMessage) => {
    setSelectedMessage(msg);
    setActionSheetMsg(null);
    setReportSheetVisible(true);
  }, []);

  const handleBlock = useCallback((userId: string) => {
    setActionSheetMsg(null);
    blockStore.blockUser(userId);
  }, [blockStore]);

  // App state handling
  useEffect(() => {
    let timeout: ReturnType<typeof setTimeout>;
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'background') {
        timeout = setTimeout(() => {
          // Keep connection alive — re-fetch on return
        }, 30000);
      } else if (state === 'active') {
        clearTimeout(timeout);
        if (id) {
          fetchMessages(id);
          markRead(id);
        }
      }
    });
    return () => sub.remove();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // Subscribe & fetch
  useEffect(() => {
    if (id) {
      fetchMessages(id);
      markRead(id); // Clear unread pulse
      const unsub = subscribeToLounge(id);

      supabase
        .from('lounge_members')
        .select('user_id, profiles(username, avatar_url)')
        .eq('lounge_id', id)
        .then(({ data }) => {
          if (data) {
            setMembers(data.map((m: any) => {
              const profile = Array.isArray(m.profiles) ? m.profiles[0] : m.profiles;
              return {
                user_id: m.user_id,
                username: profile?.username ?? 'user',
                avatar_url: profile?.avatar_url,
              };
            }));
          }
        });

      return () => { unsub(); markRead(id); };
    }
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

  // FIX #4: Removed manual .reverse() — FlashList inverted={true} handles display order.
  // currentMessages is already chronological (oldest→newest) from the store.

  if (notFound) {
    return (
      <View style={s.emptyContainer}>
        <View style={s.headerCrest}>
          <X size={18} color={colors.sepia} strokeWidth={1.5} />
        </View>
        <Text style={s.emptyChatTitle}>Signal Lost</Text>
        <Text style={s.emptyChatDesc}>This screening room has been incinerated or does not exist.</Text>
        <PressableScale style={[s.previewBtn, { marginTop: 24, width: 'auto' }]} onPress={() => router.back()} haptic="medium">
          <Text style={s.previewBtnText}>RETURN TO LOBBY</Text>
        </PressableScale>
      </View>
    );
  }

  if (!activeLounge) {
    return (
      <View style={s.emptyContainer}>
        <ActivityIndicator size="small" color={colors.sepia} />
        <Text style={s.emptyLoadText}>ESTABLISHING CONNECTION</Text>
      </View>
    );
  }

  // Handle joining public lounge
  const handleTakeSeat = async () => {
    if (!id) return;
    setJoining(true);
    TactileEngine.mutate();
    const success = await useLoungeStore.getState().joinLoungeById(id);
    if (success) {
      setLocalLounge(prev => prev ? { ...prev, is_member: true } : null);
    }
    setJoining(false);
  };

  return (
    <Animated.View style={[s.container, animatedContainerStyle]}>
      {/* Header */}
      <View style={[s.roomHeader, { paddingTop: Math.max(insets.top + 10, 44) }]}>
        <PressableScale style={s.headerBtn} onPress={() => router.back()} haptic="selection" accessibilityRole="button" accessibilityLabel="Back">
          <ArrowLeft size={20} color={colors.parchment} strokeWidth={1.5} />
        </PressableScale>
        <View style={s.headerCenter}>
          <Text style={s.roomTitle} numberOfLines={1}>{activeLounge.name}</Text>
          <View style={s.roomMeta}>
            <Users size={10} color={colors.fog} strokeWidth={1.5} />
            <Text style={s.roomMetaText} numberOfLines={1}>
              {members.length || activeLounge.member_count || 0} Members
            </Text>
            {activeLounge.is_private && (
              <>
                <View style={s.roomMetaDot} />
                <Lock size={9} color={colors.sepia} strokeWidth={1.5} />
                <Text style={s.roomMetaPrivate}>PRIVATE</Text>
              </>
            )}
          </View>
        </View>
        <PressableScale
          style={s.headerBtn}
          onPress={() => setSettingsOpen(true)}
          haptic="selection"
          accessibilityRole="button" accessibilityLabel="Lounge Settings"
        >
          <Settings size={18} color={colors.parchment} strokeWidth={1.5} />
        </PressableScale>
      </View>

      {/* Messages */}
      <FlashList
        {...{
          ref: flatListRef,
          data: currentMessages,
          keyExtractor: (item: any) => item.id,
          contentContainerStyle: s.messagesList,
          inverted: true,
          keyboardShouldPersistTaps: "handled",
          showsVerticalScrollIndicator: false,
          estimatedItemSize: 100,
          onEndReached: () => {
            if (id) useLoungeStore.getState().loadMoreMessages(id);
          },
          onEndReachedThreshold: 0.5,
          renderItem: ({ item, index }: any) => {
            const isSelf = item.user_id === user?.id;
            const olderMessage = currentMessages[index + 1];
            const showAuthor = !olderMessage || olderMessage.user_id !== item.user_id ||
              (new Date(item.created_at).getTime() - new Date(olderMessage.created_at).getTime() > 300000);

            return (
              <MessageBubble
                msg={item}
                isSelf={isSelf}
                showAuthor={showAuthor}
                onLongPress={handleLongPress}
              />
            );
          },
          ListEmptyComponent: (
            <View style={s.emptyChat}>
              <Buster size={48} mood="peeking" />
              <Text style={s.emptyChatTitle}>The Conversation Begins</Text>
              <Text style={s.emptyChatDesc}>Be the first to break the silence.</Text>
            </View>
          )
        } as any}
      />

      {/* Input or Preview Banner */}
      {isMember ? (
        <View style={[s.inputWrapper, { paddingBottom: Math.max(insets.bottom + 8, 12) }]}>
          {replyTo && (
            <AnimatedView entering={FadeIn.duration(200)} exiting={FadeOut.duration(150)} style={s.replyBanner}>
              <View style={s.replyBannerLeft}>
                <Reply size={10} color={colors.sepia} strokeWidth={2} />
                <Text style={[s.replyBannerAuthor, { flexShrink: 1 }]} numberOfLines={1}>{replyTo.username}</Text>
              </View>
              <Text style={s.replyBannerText} numberOfLines={1}>{replyTo.content || 'Shared content'}</Text>
              <PressableScale onPress={() => setReplyTo(null)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} haptic="selection" accessibilityRole="button">
                <X size={14} color={colors.fog} strokeWidth={1.5} />
              </PressableScale>
            </AnimatedView>
          )}
          <View style={s.inputRow}>
            <TextInput
              style={s.chatInput}
              placeholder="Say something about cinema..."
              placeholderTextColor={colors.ash}
              value={input}
              onChangeText={handleInputChange}
              multiline
              maxLength={500}
              selectionColor={colors.sepia}
              keyboardAppearance="dark"
              accessibilityLabel="Chat message input"
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
      ) : (
        <AnimatedView entering={SlideInDown.duration(300)} style={[s.previewBanner, { paddingBottom: Math.max(insets.bottom + 8, 12) }]}>
          <Text style={s.previewBannerText}>You are previewing this salon.</Text>
          <PressableScale
            style={[s.previewBtn, joining && s.previewBtnDisabled]}
            onPress={handleTakeSeat}
            disabled={joining}
            haptic="medium"
            accessibilityRole="button"
          >
            {joining ? (
              <ActivityIndicator size="small" color={colors.ink} />
            ) : (
              <Text style={s.previewBtnText}>TAKE A SEAT</Text>
            )}
          </PressableScale>
        </AnimatedView>
      )}

      {/* Overlays */}
      <ActionSheet
        visible={!!actionSheetMsg}
        msg={actionSheetMsg}
        isSelf={actionSheetMsg?.user_id === user?.id}
        onClose={() => setActionSheetMsg(null)}
        onReply={setReplyTo}
        onDelete={deleteMessage}
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
          onDismiss={() => {
            setReportSheetVisible(false);
            setSelectedMessage(null);
          }}
        />
      )}
      <LoungeSettingsPanel
        lounge={activeLounge}
        members={members}
        visible={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        isCreator={isCreator}
      />
    </Animated.View>
  );
}

// ════════════════════════════════════════════════════════════
// STYLES — Zero inline, all Nitrate Noir
// ════════════════════════════════════════════════════════════

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.ink },
  emptyContainer: {
    flex: 1,
    backgroundColor: colors.ink,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 12,
  },
  emptyLoadText: {
    fontFamily: fonts.uiMedium,
    fontSize: 9,
    letterSpacing: 3,
    color: colors.fog,
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
    marginBottom: 8,
  },
  emptyChat: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 80,
    gap: 10,
  },
  emptyChatTitle: {
    fontFamily: fonts.display,
    fontSize: 22,
    color: colors.parchment,
    marginBottom: 4,
  },
  emptyChatDesc: {
    fontFamily: fonts.body,
    fontSize: 12,
    color: colors.fog,
    textAlign: 'center',
    paddingHorizontal: 32,
  },

  // ── Room Header ──
  roomHeader: {
    paddingTop: 0,
    paddingBottom: 14,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(11,10,8,0.97)',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.ash,
  },
  headerBtn: { padding: 8 },
  headerCenter: { flex: 1, alignItems: 'center' },
  roomTitle: {
    fontFamily: fonts.sub,
    fontSize: 16,
    color: colors.parchment,
    marginBottom: 3,
  },
  roomMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  roomMetaText: {
    fontFamily: fonts.ui,
    fontSize: 9,
    letterSpacing: 0.5,
    color: colors.fog,
  },
  roomMetaDot: {
    width: 2,
    height: 2,
    borderRadius: 1,
    backgroundColor: colors.fog,
    marginHorizontal: 4,
  },
  roomMetaPrivate: {
    fontFamily: fonts.uiMedium,
    fontSize: 8,
    letterSpacing: 1,
    color: colors.sepia,
  },

  // ── Messages ──
  messagesList: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 24,
    gap: 4,
  },
  msgWrapper: { marginBottom: 2 },
  msgSelf: { alignItems: 'flex-end' },
  msgOther: { alignItems: 'flex-start' },
  msgCompact: { marginTop: -2 },
  msgAvatar: {
    position: 'absolute',
    left: -4,
    top: 4,
    width: 28,
    height: 28,
    borderRadius: 14,
    overflow: 'hidden',
    backgroundColor: colors.soot,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.ash,
  },
  msgAvatarImg: { width: '100%', height: '100%' },
  msgAvatarLetter: {
    fontFamily: fonts.display,
    color: colors.fog,
    fontSize: 13,
  },
  msgContentCol: { maxWidth: '82%', paddingLeft: 32 },
  msgContentColSelf: { alignItems: 'flex-end', paddingLeft: 0 },
  msgHeader: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 8,
    marginBottom: 4,
  },
  msgHeaderSelf: { justifyContent: 'flex-end' },
  msgAuthor: {
    fontFamily: fonts.uiMedium,
    fontSize: 10,
    letterSpacing: 0.5,
    color: colors.bone,
  },
  msgTime: {
    fontFamily: fonts.ui,
    fontSize: 9,
    color: colors.fog,
    opacity: 0.5,
  },

  msgBubble: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 14,
  },
  msgBubbleSelf: {
    backgroundColor: 'rgba(196,150,26,0.08)',
    borderBottomRightRadius: 4,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(196,150,26,0.25)',
  },
  msgBubbleOther: {
    backgroundColor: colors.soot,
    borderBottomLeftRadius: 4,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.ash,
  },
  msgText: {
    fontFamily: fonts.body,
    fontSize: 14,
    color: colors.parchment,
    lineHeight: 22,
  },

  // ── Reply Quote ──
  replyQuote: {
    backgroundColor: 'rgba(0,0,0,0.3)',
    padding: 8,
    borderRadius: 4,
    marginBottom: 8,
    borderLeftWidth: 2,
    borderLeftColor: colors.sepia,
  },
  replyQuoteHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 3,
  },
  replyQuoteAuthor: {
    fontFamily: fonts.uiMedium,
    fontSize: 9,
    letterSpacing: 0.5,
    color: colors.sepia,
  },
  replyQuoteContent: {
    fontFamily: fonts.bodyItalic,
    fontSize: 12,
    color: colors.fog,
    lineHeight: 17,
  },

  // ── Shared Film Card ──
  sharedCard: {
    flexDirection: 'row',
    backgroundColor: 'rgba(0,0,0,0.4)',
    borderRadius: 4,
    overflow: 'hidden',
    marginTop: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.ash,
  },
  sharedPoster: { width: 48, height: 72 },
  sharedInfo: {
    padding: 10,
    flex: 1,
    justifyContent: 'center',
  },
  sharedTypeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 4,
  },
  sharedTypeText: {
    fontFamily: fonts.uiMedium,
    fontSize: 8,
    letterSpacing: 1.5,
    color: colors.sepia,
  },
  sharedTitle: {
    fontFamily: fonts.sub,
    fontSize: 13,
    color: colors.bone,
    lineHeight: 17,
  },

  // ── Input ──
  inputWrapper: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    backgroundColor: colors.ink,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.ash,
  },
  replyBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.soot,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 4,
    marginBottom: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.ash,
    gap: 8,
  },
  replyBannerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  replyBannerAuthor: {
    fontFamily: fonts.uiMedium,
    fontSize: 10,
    color: colors.sepia,
    letterSpacing: 0.5,
  },
  replyBannerText: {
    flex: 1,
    fontFamily: fonts.body,
    fontSize: 12,
    color: colors.fog,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
  },
  chatInput: {
    flex: 1,
    minHeight: 40,
    maxHeight: 120,
    backgroundColor: colors.soot,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 12,
    color: colors.bone,
    fontFamily: fonts.body,
    fontSize: 14,
    lineHeight: 18,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.ash,
  },
  sendBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.sepia,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: colors.sepia,
    shadowOpacity: 0.3,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
  },
  sendBtnDisabled: {
    backgroundColor: colors.ash,
    shadowOpacity: 0,
  },

  // ── Preview Banner ──
  previewBanner: {
    paddingHorizontal: 16,
    paddingTop: 16,
    backgroundColor: 'rgba(11,10,8,0.97)',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.ash,
    alignItems: 'center',
    gap: 12,
  },
  previewBannerText: {
    fontFamily: fonts.ui,
    fontSize: 11,
    color: colors.fog,
    letterSpacing: 0.5,
  },
  previewBtn: {
    backgroundColor: colors.sepia,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 4,
    width: '100%',
    alignItems: 'center',
  },
  previewBtnDisabled: {
    opacity: 0.5,
  },
  previewBtnText: {
    fontFamily: fonts.uiMedium,
    fontSize: 11,
    letterSpacing: 2,
    color: colors.ink,
  },

  // ── Action Sheet ──
  actionBackdrop: { flex: 1 },
  actionSheet: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: colors.ink,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: 24,
    borderWidth: 1,
    borderBottomWidth: 0,
    borderColor: 'rgba(196,150,26,0.15)',
  },
  actionHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.08)',
    alignSelf: 'center',
    marginBottom: 20,
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
    gap: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.soot,
  },
  actionBtnLast: { borderBottomWidth: 0 },
  actionBtnText: {
    fontFamily: fonts.uiMedium,
    fontSize: 12,
    letterSpacing: 2,
    color: colors.parchment,
  },
  actionBtnDanger: { color: colors.bloodReel },

  // ── Settings Sheet ──
  settingsSheet: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: '85%',
    backgroundColor: colors.ink,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: 24,
    paddingBottom: 28,
    borderWidth: 1,
    borderBottomWidth: 0,
    borderColor: 'rgba(196,150,26,0.15)',
  },
  settingsHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 24,
  },
  settingsTitle: {
    fontFamily: fonts.display,
    fontSize: 22,
    color: colors.parchment,
  },
  settingsListHeader: { gap: 20, marginBottom: 16 },
  settingsSection: { gap: 8 },
  settingsLabel: {
    fontFamily: fonts.uiMedium,
    fontSize: 9,
    letterSpacing: 2,
    color: colors.fog,
  },
  inviteCodeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 14,
    backgroundColor: 'rgba(196,150,26,0.06)',
    borderRadius: 4,
    borderWidth: 1,
    borderColor: 'rgba(196,150,26,0.3)',
    borderStyle: 'dashed',
    gap: 12,
  },
  inviteCodeText: {
    fontFamily: fonts.uiBold,
    fontSize: 18,
    letterSpacing: 6,
    color: colors.parchment,
  },

  // ── Members ──
  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.soot,
  },
  memberAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.soot,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.ash,
  },
  memberAvatarImg: { width: '100%', height: '100%' },
  memberName: {
    flex: 1,
    fontFamily: fonts.uiMedium,
    fontSize: 12,
    letterSpacing: 1,
    color: colors.bone,
  },
  memberBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 2,
    backgroundColor: 'rgba(196,150,26,0.08)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(196,150,26,0.2)',
  },
  memberBadgeText: {
    fontFamily: fonts.uiMedium,
    fontSize: 8,
    letterSpacing: 1.5,
    color: colors.sepia,
  },
  settingsFooter: {
    marginTop: 32,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.ash,
    paddingTop: 20,
  },
  leaveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 14,
    gap: 10,
  },
  leaveBtnText: {
    fontFamily: fonts.uiMedium,
    fontSize: 10,
    letterSpacing: 2,
    color: colors.sepia,
  },
});


MessageBubble.displayName = 'MessageBubble';

SharedCard.displayName = 'SharedCard';