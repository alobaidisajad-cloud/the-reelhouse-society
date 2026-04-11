import React, { useEffect, useState, useRef, useCallback } from 'react';
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity,
  KeyboardAvoidingView, Platform, FlatList, Image, Modal,
  AppState, ActivityIndicator, Clipboard,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import Animated, { FadeIn, FadeOut, SlideInDown, SlideOutDown } from 'react-native-reanimated';
import { BlurView } from 'expo-blur';
import * as Haptics from 'expo-haptics';
import {
  ArrowLeft, Users, Settings, Send, Reply, Copy, Trash2,
  LogOut, X, Lock, Globe, Crown, Sparkles, Check, MessageCircle,
} from 'lucide-react-native';
import { useLoungeStore, LoungeMessage } from '@/src/stores/lounge';
import { useAuthStore } from '@/src/stores/auth';
import { colors, fonts } from '@/src/theme/theme';
import { tmdb } from '@/src/lib/tmdb';
import { supabase } from '@/src/lib/supabase';

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
      {posterUrl && <Image source={{ uri: posterUrl }} style={s.sharedPoster} />}
      <View style={s.sharedInfo}>
        <View style={s.sharedTypeBadge}>
          <Sparkles size={7} color={colors.sepia} strokeWidth={2} />
          <Text style={s.sharedTypeText}>{typeLabel}</Text>
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
            ? <Image source={{ uri: msg.avatar_url }} style={s.msgAvatarImg} />
            : <Text style={s.msgAvatarLetter}>{msg.username?.[0]?.toUpperCase()}</Text>
          }
        </View>
      )}

      <View style={[s.msgContentCol, isSelf && s.msgContentColSelf]}>
        {showAuthor && (
          <View style={[s.msgHeader, isSelf && s.msgHeaderSelf]}>
            <Text style={s.msgAuthor}>{isSelf ? 'You' : msg.username}</Text>
            <Text style={s.msgTime}>
              {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </Text>
          </View>
        )}

        <TouchableOpacity
          activeOpacity={0.8}
          onLongPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); onLongPress(msg); }}
          style={[s.msgBubble, isSelf ? s.msgBubbleSelf : s.msgBubbleOther]}
        >
          {Boolean(msg.reply_to_content) && (
            <View style={s.replyQuote}>
              <View style={s.replyQuoteHeader}>
                <Reply size={9} color={colors.sepia} strokeWidth={2} />
                <Text style={s.replyQuoteAuthor}>{msg.reply_to_username || 'Unknown'}</Text>
              </View>
              <Text style={s.replyQuoteContent} numberOfLines={2}>{msg.reply_to_content}</Text>
            </View>
          )}

          {Boolean(msg.content) && <Text style={s.msgText}>{msg.content}</Text>}
          {msg.type !== 'text' && <SharedCard msg={msg} />}
        </TouchableOpacity>
      </View>
    </View>
  );
});

// ════════════════════════════════════════════════════════════
// ACTION SHEET — Long-press menu
// ════════════════════════════════════════════════════════════
function ActionSheet({ visible, msg, isSelf, onClose, onReply, onDelete }: any) {
  if (!visible || !msg) return null;

  const handleCopy = async () => {
    Clipboard.setString(msg.content || '');
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    onClose();
  };

  return (
    <Modal transparent visible animationType="fade" onRequestClose={onClose}>
      <BlurView intensity={30} tint="dark" style={StyleSheet.absoluteFill}>
        <TouchableOpacity activeOpacity={1} style={s.actionBackdrop} onPress={onClose} />
      </BlurView>
      <AnimatedView entering={SlideInDown.springify()} exiting={SlideOutDown} style={s.actionSheet}>
        <View style={s.actionHandle} />
        <TouchableOpacity style={s.actionBtn} onPress={() => { onReply(msg); onClose(); }}>
          <Reply size={18} color={colors.bone} strokeWidth={1.5} />
          <Text style={s.actionBtnText}>REPLY</Text>
        </TouchableOpacity>
        <TouchableOpacity style={s.actionBtn} onPress={handleCopy}>
          <Copy size={18} color={colors.bone} strokeWidth={1.5} />
          <Text style={s.actionBtnText}>COPY TEXT</Text>
        </TouchableOpacity>
        {isSelf && (
          <TouchableOpacity
            style={[s.actionBtn, s.actionBtnLast]}
            onPress={() => {
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
              onDelete(msg.id);
              onClose();
            }}
          >
            <Trash2 size={18} color={colors.sepia} strokeWidth={1.5} />
            <Text style={[s.actionBtnText, s.actionBtnDanger]}>DELETE MESSAGE</Text>
          </TouchableOpacity>
        )}
      </AnimatedView>
    </Modal>
  );
}

// ════════════════════════════════════════════════════════════
// SETTINGS PANEL
// ════════════════════════════════════════════════════════════
function LoungeSettingsPanel({ lounge, members, visible, onClose, isCreator }: any) {
  const router = useRouter();
  const { leaveLounge } = useLoungeStore();
  const [copied, setCopied] = useState(false);

  const handleCopyCode = async () => {
    if (lounge.invite_code) {
      Clipboard.setString(lounge.invite_code);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleLeave = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    await leaveLounge(lounge.id);
    onClose();
    router.replace('/(tabs)/lounge');
  };

  if (!visible) return null;

  return (
    <Modal transparent visible animationType="fade" onRequestClose={onClose}>
      <BlurView intensity={50} tint="dark" style={StyleSheet.absoluteFill}>
        <TouchableOpacity activeOpacity={1} style={s.actionBackdrop} onPress={onClose} />
      </BlurView>
      <AnimatedView entering={SlideInDown.springify()} exiting={SlideOutDown} style={s.settingsSheet}>
        <View style={s.actionHandle} />
        <View style={s.settingsHeaderRow}>
          <Text style={s.settingsTitle}>Lounge Settings</Text>
          <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, right: 10, bottom: 10, left: 10 }}>
            <X size={20} color={colors.fog} strokeWidth={1.5} />
          </TouchableOpacity>
        </View>

        <FlatList
          data={members}
          keyExtractor={item => item.user_id}
          showsVerticalScrollIndicator={false}
          ListHeaderComponent={
            <View style={s.settingsListHeader}>
              {lounge.is_private && lounge.invite_code && (
                <View style={s.settingsSection}>
                  <Text style={s.settingsLabel}>INVITE CODE</Text>
                  <TouchableOpacity style={s.inviteCodeBtn} onPress={handleCopyCode} activeOpacity={0.7}>
                    <Text style={s.inviteCodeText}>{lounge.invite_code}</Text>
                    {copied
                      ? <Check size={16} color={colors.sepia} strokeWidth={2} />
                      : <Copy size={16} color={colors.fog} strokeWidth={1.5} />
                    }
                  </TouchableOpacity>
                </View>
              )}
              <Text style={s.settingsLabel}>MEMBERS ({members?.length || 0})</Text>
            </View>
          }
          renderItem={({ item }) => (
            <View style={s.memberRow}>
              <View style={s.memberAvatar}>
                {item.avatar_url
                  ? <Image source={{ uri: item.avatar_url }} style={s.memberAvatarImg} />
                  : <Users size={13} color={colors.fog} strokeWidth={1.5} />
                }
              </View>
              <Text style={s.memberName}>@{item.username?.toUpperCase()}</Text>
              {item.user_id === lounge.created_by && (
                <View style={s.memberBadge}>
                  <Crown size={9} color={colors.sepia} strokeWidth={2} />
                  <Text style={s.memberBadgeText}>FOUNDER</Text>
                </View>
              )}
            </View>
          )}
          ListFooterComponent={
            <View style={s.settingsFooter}>
              <TouchableOpacity style={s.leaveBtn} onPress={handleLeave} activeOpacity={0.7}>
                <LogOut size={14} color={colors.sepia} strokeWidth={1.5} />
                <Text style={s.leaveBtnText}>STEP OUT OF LOUNGE</Text>
              </TouchableOpacity>
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
  const router = useRouter();
  const user = useAuthStore(s => s.user);

  const {
    lounges, currentMessages, fetchMessages, sendMessage,
    deleteMessage, subscribeToLounge, sending, markRead,
  } = useLoungeStore();
  const activeLounge = lounges.find(l => l.id === id);
  const isCreator = activeLounge?.created_by === user?.id;

  const [input, setInput] = useState('');
  const [replyTo, setReplyTo] = useState<LoungeMessage | null>(null);
  const [actionSheetMsg, setActionSheetMsg] = useState<LoungeMessage | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [members, setMembers] = useState<any[]>([]);

  const flatListRef = useRef<FlatList>(null);

  // App state handling
  useEffect(() => {
    let timeout: NodeJS.Timeout;
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'background') {
        timeout = setTimeout(() => {}, 30000);
      } else if (state === 'active') {
        clearTimeout(timeout);
        if (id) fetchMessages(id);
      }
    });
    return () => sub.remove();
  }, [id]);

  // Subscribe & fetch
  useEffect(() => {
    if (id) {
      fetchMessages(id);
      const unsub = subscribeToLounge(id);

      supabase
        .from('lounge_members')
        .select('user_id, profiles(username, avatar_url)')
        .eq('lounge_id', id)
        .then(({ data }) => {
          if (data) {
            setMembers(data.map((m: any) => ({
              user_id: m.user_id,
              username: m.profiles?.username || 'user',
              avatar_url: m.profiles?.avatar_url,
            })));
          }
        });

      return () => { unsub(); markRead(id); };
    }
  }, [id]);

  const handleSend = useCallback(() => {
    if (!input.trim() || sending || !id) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    sendMessage(id, input.trim(), 'text', {
      reply_to_id: replyTo?.id,
      reply_to_username: replyTo?.username,
      reply_to_content: replyTo?.content,
    });
    setInput('');
    setReplyTo(null);
  }, [input, sending, id, replyTo]);

  if (!activeLounge) {
    return (
      <View style={s.emptyContainer}>
        <ActivityIndicator size="small" color={colors.sepia} />
        <Text style={s.emptyLoadText}>ESTABLISHING CONNECTION</Text>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView style={s.container} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      {/* Header */}
      <View style={s.roomHeader}>
        <TouchableOpacity style={s.headerBtn} onPress={() => router.back()} activeOpacity={0.7}>
          <ArrowLeft size={20} color={colors.parchment} strokeWidth={1.5} />
        </TouchableOpacity>
        <View style={s.headerCenter}>
          <Text style={s.roomTitle} numberOfLines={1}>{activeLounge.name}</Text>
          <View style={s.roomMeta}>
            <Users size={10} color={colors.fog} strokeWidth={1.5} />
            <Text style={s.roomMetaText}>
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
        <TouchableOpacity
          style={s.headerBtn}
          onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setSettingsOpen(true); }}
          activeOpacity={0.7}
        >
          <Settings size={18} color={colors.parchment} strokeWidth={1.5} />
        </TouchableOpacity>
      </View>

      {/* Messages */}
      <FlatList
        ref={flatListRef}
        data={currentMessages}
        keyExtractor={item => item.id}
        contentContainerStyle={s.messagesList}
        inverted={false}
        onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: true })}
        showsVerticalScrollIndicator={false}
        renderItem={({ item, index }) => {
          const isSelf = item.user_id === user?.id;
          const prev = currentMessages[index - 1];
          const showAuthor = !prev || prev.user_id !== item.user_id ||
            (new Date(item.created_at).getTime() - new Date(prev.created_at).getTime() > 300000);

          return (
            <MessageBubble
              msg={item}
              isSelf={isSelf}
              showAuthor={showAuthor}
              onLongPress={(msg) => setActionSheetMsg(msg)}
            />
          );
        }}
        ListEmptyComponent={
          <View style={s.emptyChat}>
            <MessageCircle size={32} color={colors.sepia} strokeWidth={1} />
            <Text style={s.emptyChatTitle}>The Conversation Begins</Text>
            <Text style={s.emptyChatDesc}>Be the first to break the silence.</Text>
          </View>
        }
      />

      {/* Input */}
      <View style={s.inputWrapper}>
        {replyTo && (
          <AnimatedView entering={FadeIn.duration(200)} exiting={FadeOut.duration(150)} style={s.replyBanner}>
            <View style={s.replyBannerLeft}>
              <Reply size={10} color={colors.sepia} strokeWidth={2} />
              <Text style={s.replyBannerAuthor}>{replyTo.username}</Text>
            </View>
            <Text style={s.replyBannerText} numberOfLines={1}>{replyTo.content || 'Shared content'}</Text>
            <TouchableOpacity onPress={() => setReplyTo(null)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <X size={14} color={colors.fog} strokeWidth={1.5} />
            </TouchableOpacity>
          </AnimatedView>
        )}
        <View style={s.inputRow}>
          <TextInput
            style={s.chatInput}
            placeholder="Say something about cinema..."
            placeholderTextColor={colors.ash}
            value={input}
            onChangeText={setInput}
            multiline
            maxLength={500}
            selectionColor={colors.sepia}
          />
          <TouchableOpacity
            style={[s.sendBtn, (!input.trim() || sending) && s.sendBtnDisabled]}
            onPress={handleSend}
            disabled={!input.trim() || sending}
            activeOpacity={0.8}
          >
            <Send size={16} color={colors.ink} strokeWidth={2} />
          </TouchableOpacity>
        </View>
      </View>

      {/* Overlays */}
      <ActionSheet
        visible={!!actionSheetMsg}
        msg={actionSheetMsg}
        isSelf={actionSheetMsg?.user_id === user?.id}
        onClose={() => setActionSheetMsg(null)}
        onReply={setReplyTo}
        onDelete={deleteMessage}
      />
      <LoungeSettingsPanel
        lounge={activeLounge}
        members={members}
        visible={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        isCreator={isCreator}
      />
    </KeyboardAvoidingView>
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

  // ── Room Header ──
  roomHeader: {
    paddingTop: Platform.OS === 'ios' ? 54 : 24,
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
    color: colors.ash,
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

  // ── Empty Chat ──
  emptyChat: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 80,
    gap: 10,
  },
  emptyChatTitle: {
    fontFamily: fonts.display,
    fontSize: 16,
    color: colors.parchment,
  },
  emptyChatDesc: {
    fontFamily: fonts.bodyItalic,
    fontSize: 12,
    color: colors.fog,
  },

  // ── Input ──
  inputWrapper: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    backgroundColor: colors.ink,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.ash,
    paddingBottom: Platform.OS === 'ios' ? 30 : 12,
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
    gap: 10,
  },
  chatInput: {
    flex: 1,
    backgroundColor: colors.soot,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.ash,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingTop: Platform.OS === 'ios' ? 12 : 8,
    paddingBottom: 12,
    minHeight: 40,
    maxHeight: 120,
    fontFamily: fonts.body,
    color: colors.parchment,
    fontSize: 14,
  },
  sendBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.sepia,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 2,
  },
  sendBtnDisabled: { opacity: 0.35 },

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
    paddingBottom: Platform.OS === 'ios' ? 44 : 28,
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
  actionBtnDanger: { color: colors.sepia },

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
    paddingBottom: Platform.OS === 'ios' ? 44 : 28,
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
