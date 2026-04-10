import React, { useEffect, useState, useRef, useCallback } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, KeyboardAvoidingView, Platform, FlatList, Keyboard, Image, Modal, AppState, Clipboard } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import Animated, { FadeIn, FadeOut, SlideInDown, SlideOutDown } from 'react-native-reanimated';
import { BlurView } from 'expo-blur';
import { ArrowLeft, Users, Settings, Send, Reply, Copy, Trash2, LogOut, X, Lock, Globe, Crown } from 'lucide-react-native';
import { useLoungeStore, LoungeMessage } from '@/src/stores/lounge';
import { useAuthStore } from '@/src/stores/auth';
import { colors, fonts } from '@/src/theme/theme';
import { tmdb } from '@/src/lib/tmdb';
import { supabase } from '@/src/lib/supabase';

const AnimatedView = Animated.createAnimatedComponent(View);

// ── Shared Content Card ──
const SharedCard = React.memo(({ msg }: { msg: LoungeMessage }) => {
  if (!msg.film_title && !msg.film_id) return null;
  const typeLabel = msg.type === 'film_share' ? 'FILM' : msg.type.toUpperCase().replace('_SHARE', '');
  const posterUrl = msg.film_poster ? tmdb.poster(msg.film_poster, 'w342') : null;

  return (
    <View style={s.sharedCard}>
      {posterUrl && <Image source={{ uri: posterUrl }} style={s.sharedCardPoster} />}
      <View style={s.sharedCardInfo}>
        <Text style={s.sharedCardType}>✦ {typeLabel}</Text>
        <Text style={s.sharedCardTitle}>{msg.film_title}</Text>
      </View>
    </View>
  );
});

// ── Message Bubble ──
const MessageBubble = React.memo(({ msg, isSelf, showAuthor, onLongPress }: {
  msg: LoungeMessage; isSelf: boolean; showAuthor: boolean;
  onLongPress: (msg: LoungeMessage) => void;
}) => {
  return (
    <View style={[s.msgWrapper, isSelf ? s.msgSelf : s.msgOther, !showAuthor && s.msgCompact]}>
      {showAuthor && !isSelf && (
        <View style={s.msgAvatar}>
          {msg.avatar_url ? <Image source={{ uri: msg.avatar_url }} style={s.msgAvatarImg} /> : <Text style={s.msgAvatarLetter}>{msg.username?.[0]?.toUpperCase()}</Text>}
        </View>
      )}
      
      <View style={[s.msgContentCol, isSelf && { alignItems: 'flex-end' }]}>
        {showAuthor && (
          <View style={[s.msgHeader, isSelf && { justifyContent: 'flex-end' }]}>
            <Text style={s.msgAuthor}>{isSelf ? 'You' : msg.username}</Text>
            <Text style={s.msgTime}>{new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</Text>
          </View>
        )}
        
        <TouchableOpacity 
          activeOpacity={0.8} 
          onLongPress={() => onLongPress(msg)}
          style={[s.msgBubble, isSelf ? s.msgBubbleSelf : s.msgBubbleOther]}
        >
          {Boolean(msg.reply_to_content) && (
            <View style={s.replyQuote}>
              <Text style={s.replyQuoteAuthor}>↩ {msg.reply_to_username || 'Unknown'}</Text>
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

// ── Action Sheet ──
function ActionSheet({ visible, msg, isSelf, onClose, onReply, onDelete }: any) {
  if (!visible || !msg) return null;
  return (
    <Modal transparent visible animationType="fade" onRequestClose={onClose}>
      <BlurView intensity={30} tint="dark" style={StyleSheet.absoluteFill}>
        <TouchableOpacity activeOpacity={1} style={{ flex: 1 }} onPress={onClose} />
      </BlurView>
      <AnimatedView entering={SlideInDown.springify()} exiting={SlideOutDown} style={s.sheet}>
        <View style={s.sheetHandle} />
        <TouchableOpacity style={s.sheetBtn} onPress={() => { onReply(msg); onClose(); }}>
          <Reply size={20} color={colors.bone} />
          <Text style={s.sheetBtnText}>REPLY</Text>
        </TouchableOpacity>
        <TouchableOpacity style={s.sheetBtn} onPress={() => { Clipboard.setString(msg.content); onClose(); }}>
          <Copy size={20} color={colors.bone} />
          <Text style={s.sheetBtnText}>COPY TEXT</Text>
        </TouchableOpacity>
        {isSelf && (
          <TouchableOpacity style={[s.sheetBtn, { borderBottomWidth: 0 }]} onPress={() => { onDelete(msg.id); onClose(); }}>
            <Trash2 size={20} color={colors.sepia} />
            <Text style={[s.sheetBtnText, { color: colors.sepia }]}>DELETE MESSAGE</Text>
          </TouchableOpacity>
        )}
      </AnimatedView>
    </Modal>
  );
}

// ── Settings Panel ──
function LoungeSettingsPanel({ lounge, members, visible, onClose, isCreator }: any) {
  const router = useRouter();
  const { updateLounge, kickMember, leaveLounge } = useLoungeStore();
  const user = useAuthStore(s => s.user);

  const [copied, setCopied] = useState(false);

  const handleCopyCode = () => {
    if (lounge.invite_code) {
      Clipboard.setString(lounge.invite_code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleLeave = async () => {
    await leaveLounge(lounge.id);
    onClose();
    router.replace('/lounge');
  };

  if (!visible) return null;

  return (
    <Modal transparent visible animationType="fade" onRequestClose={onClose}>
      <BlurView intensity={50} tint="dark" style={StyleSheet.absoluteFill}>
        <TouchableOpacity activeOpacity={1} style={{ flex: 1 }} onPress={onClose} />
      </BlurView>
      <AnimatedView entering={SlideInDown.springify()} exiting={SlideOutDown} style={[s.sheet, { height: '85%' }]}>
        <View style={s.sheetHandle} />
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
          <Text style={s.sheetTitle}>Lounge Settings</Text>
          <TouchableOpacity onPress={onClose}><X size={20} color={colors.fog} /></TouchableOpacity>
        </View>

        <FlatList
          data={members}
          keyExtractor={item => item.user_id}
          ListHeaderComponent={
            <View style={{ gap: 24, marginBottom: 24 }}>
              {lounge.is_private && lounge.invite_code && (
                <View>
                  <Text style={s.settingsLabel}>INVITE CODE</Text>
                  <TouchableOpacity style={s.inviteCodeBtn} onPress={handleCopyCode}>
                    <Text style={s.inviteCodeText}>{lounge.invite_code}</Text>
                    {copied ? <Check size={16} color={colors.sepia} /> : <Copy size={16} color={colors.fog} />}
                  </TouchableOpacity>
                </View>
              )}
              
              <Text style={s.settingsLabel}>MEMBERS ({members?.length || 0})</Text>
            </View>
          }
          renderItem={({ item }) => (
            <View style={s.memberRow}>
              {item.avatar_url ? <Image source={{ uri: item.avatar_url }} style={s.memberAvatar} /> : <View style={s.memberAvatar}><Users size={14} color={colors.fog} /></View>}
              <Text style={s.memberName}>@{item.username.toUpperCase()}</Text>
              {item.user_id === lounge.creator_id && <Text style={s.memberRole}><Crown size={10} /> CREATOR</Text>}
            </View>
          )}
          ListFooterComponent={
            <View style={{ marginTop: 40, borderTopWidth: 1, borderTopColor: colors.ash, paddingTop: 20 }}>
              <TouchableOpacity style={s.leaveBtn} onPress={handleLeave}>
                <LogOut size={16} color={colors.sepia} />
                <Text style={s.leaveBtnText}>STEP OUT OF LOUNGE</Text>
              </TouchableOpacity>
            </View>
          }
        />
      </AnimatedView>
    </Modal>
  );
}


// ── Main Chat Room ──
export default function LoungeRoom() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const user = useAuthStore(s => s.user);

  const { lounges, currentMessages, fetchMessages, sendMessage, deleteMessage, subscribeToLounge, sending, markRead } = useLoungeStore();
  const activeLounge = lounges.find(l => l.id === id);
  const isCreator = activeLounge?.created_by === user?.id;

  const [input, setInput] = useState('');
  const [replyTo, setReplyTo] = useState<LoungeMessage | null>(null);
  const [actionSheetMsg, setActionSheetMsg] = useState<LoungeMessage | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [members, setMembers] = useState<any[]>([]);

  const flatListRef = useRef<FlatList>(null);

  // Ghost-Town Suspender
  useEffect(() => {
    let timeout: NodeJS.Timeout;
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'background') {
        timeout = setTimeout(() => {
          // Pause logic: web pauses realtime via store, we manually unsubscribe
          console.log('[Lounge] App in background for 30s. Subscriptions would pause.');
        }, 30000);
      } else if (state === 'active') {
        clearTimeout(timeout);
        fetchMessages(id!);
      }
    });
    return () => sub.remove();
  }, [id]);

  useEffect(() => {
    if (id) {
      fetchMessages(id);
      const unsub = subscribeToLounge(id);
      
      // Fetch members
      supabase.from('lounge_members').select('user_id, profiles(username, avatar_url)')
        .eq('lounge_id', id).then(({ data }) => {
          if (data) setMembers(data.map((m: any) => ({ user_id: m.user_id, username: m.profiles?.username || 'user', avatar_url: m.profiles?.avatar_url })));
      });

      return () => { unsub(); markRead(id); };
    }
  }, [id]);

  if (!activeLounge) return <View style={s.container} />;

  const handleSend = () => {
    if (!input.trim() || sending) return;
    sendMessage(id!, input.trim(), 'text', {
      reply_to_id: replyTo?.id,
      reply_to_username: replyTo?.username,
      reply_to_content: replyTo?.content,
    });
    setInput('');
    setReplyTo(null);
  };

  return (
    <KeyboardAvoidingView style={s.container} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity style={s.headerBtn} onPress={() => router.back()}>
          <ArrowLeft size={20} color={colors.parchment} />
        </TouchableOpacity>
        <View style={s.headerCenter}>
          <Text style={s.headerTitle} numberOfLines={1}>{activeLounge.name}</Text>
          <View style={s.headerMeta}>
            <Users size={12} color={colors.fog} />
            <Text style={s.headerMetaText}>{activeLounge.member_count} Members</Text>
          </View>
        </View>
        <TouchableOpacity style={s.headerBtn} onPress={() => setSettingsOpen(true)}>
          <Settings size={20} color={colors.parchment} />
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
        renderItem={({ item, index }) => {
          const isSelf = item.user_id === user?.id;
          const prev = currentMessages[index - 1];
          const showAuthor = !prev || prev.user_id !== item.user_id || (new Date(item.created_at).getTime() - new Date(prev.created_at).getTime() > 300000);
          
          return (
            <MessageBubble 
              msg={item} 
              isSelf={isSelf} 
              showAuthor={showAuthor} 
              onLongPress={(msg) => setActionSheetMsg(msg)}
            />
          );
        }}
      />

      {/* Input */}
      <View style={s.inputWrapper}>
        {replyTo && (
          <AnimatedView entering={FadeIn} exiting={FadeOut} style={s.replyBanner}>
            <View style={{ flex: 1 }}>
              <Text style={s.replyBannerAuthor}>Replying to {replyTo.username}</Text>
              <Text style={s.replyBannerText} numberOfLines={1}>{replyTo.content || 'Shared content'}</Text>
            </View>
            <TouchableOpacity onPress={() => setReplyTo(null)} style={{ padding: 4 }}>
              <X size={16} color={colors.fog} />
            </TouchableOpacity>
          </AnimatedView>
        )}
        <View style={s.inputRow}>
          <TextInput
            style={s.input}
            placeholder="Say something about cinema..."
            placeholderTextColor={colors.ash}
            value={input}
            onChangeText={setInput}
            multiline
            maxLength={2000}
            selectionColor={colors.sepia}
          />
          <TouchableOpacity style={[s.sendBtn, (!input.trim() || sending) && { opacity: 0.5 }]} onPress={handleSend} disabled={!input.trim() || sending}>
            <Send size={18} color={colors.ink} />
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

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.ink },
  
  header: {
    paddingTop: Platform.OS === 'ios' ? 50 : 20, paddingBottom: 16, paddingHorizontal: 16,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: 'rgba(5, 3, 1, 0.95)', borderBottomWidth: 1, borderBottomColor: colors.soot,
  },
  headerBtn: { padding: 8 },
  headerCenter: { flex: 1, alignItems: 'center' },
  headerTitle: { fontFamily: fonts.display, fontSize: 18, color: colors.parchment, marginBottom: 2 },
  headerMeta: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  headerMetaText: { fontFamily: fonts.ui, fontSize: 9, letterSpacing: 1, color: colors.fog },

  messagesList: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 24, gap: 4 },
  msgWrapper: { marginBottom: 2 },
  msgSelf: { alignItems: 'flex-end' },
  msgOther: { alignItems: 'flex-start' },
  msgCompact: { marginTop: -2 },
  msgAvatar: { position: 'absolute', left: -8, top: 4, width: 28, height: 28, borderRadius: 14, overflow: 'hidden', backgroundColor: colors.soot, alignItems: 'center', justifyContent: 'center' },
  msgAvatarImg: { width: '100%', height: '100%' },
  msgAvatarLetter: { fontFamily: fonts.display, color: colors.fog, fontSize: 14 },
  msgContentCol: { maxWidth: '85%', paddingLeft: 28 },
  msgHeader: { flexDirection: 'row', alignItems: 'baseline', gap: 8, marginBottom: 4 },
  msgAuthor: { fontFamily: fonts.uiMedium, fontSize: 10, letterSpacing: 1, color: colors.bone },
  msgTime: { fontFamily: fonts.ui, fontSize: 9, color: colors.ash },

  msgBubble: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 12 },
  msgBubbleSelf: { backgroundColor: 'rgba(196,150,26,0.1)', borderBottomRightRadius: 4, borderWidth: 1, borderColor: 'rgba(196,150,26,0.3)' },
  msgBubbleOther: { backgroundColor: colors.soot, borderBottomLeftRadius: 4, borderWidth: 1, borderColor: colors.ash },
  
  msgText: { fontFamily: fonts.body, fontSize: 14, color: colors.parchment, lineHeight: 22 },

  replyQuote: { backgroundColor: 'rgba(0,0,0,0.3)', padding: 8, borderRadius: 2, marginBottom: 8, borderLeftWidth: 2, borderLeftColor: colors.sepia },
  replyQuoteAuthor: { fontFamily: fonts.uiMedium, fontSize: 9, color: colors.sepia, marginBottom: 2 },
  replyQuoteContent: { fontFamily: fonts.bodyItalic, fontSize: 12, color: colors.fog },

  sharedCard: { flexDirection: 'row', backgroundColor: 'rgba(0,0,0,0.4)', borderRadius: 2, overflow: 'hidden', marginTop: 8 },
  sharedCardPoster: { width: 50, height: 75 },
  sharedCardInfo: { padding: 10, flex: 1, justifyContent: 'center' },
  sharedCardType: { fontFamily: fonts.uiMedium, fontSize: 9, letterSpacing: 1, color: colors.sepia, marginBottom: 4 },
  sharedCardTitle: { fontFamily: fonts.display, fontSize: 14, color: colors.bone },

  inputWrapper: { paddingVertical: 12, paddingHorizontal: 16, backgroundColor: colors.ink, borderTopWidth: 1, borderTopColor: colors.soot },
  replyBanner: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.soot, padding: 10, borderRadius: 2, marginBottom: 8, borderWidth: 1, borderColor: colors.ash },
  replyBannerAuthor: { fontFamily: fonts.uiMedium, fontSize: 10, color: colors.sepia, marginBottom: 2 },
  replyBannerText: { fontFamily: fonts.body, fontSize: 12, color: colors.fog },
  inputRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 10 },
  input: { flex: 1, backgroundColor: colors.soot, borderWidth: 1, borderColor: colors.ash, borderRadius: 20, paddingHorizontal: 16, paddingTop: Platform.OS === 'ios' ? 12 : 8, paddingBottom: 12, minHeight: 40, maxHeight: 120, fontFamily: fonts.body, color: colors.parchment, fontSize: 14 },
  sendBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.sepia, alignItems: 'center', justifyContent: 'center', marginBottom: 2 },

  // Bottom Sheets
  sheet: { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: colors.ink, borderTopLeftRadius: 16, borderTopRightRadius: 16, padding: 24, paddingBottom: Platform.OS === 'ios' ? 40 : 24, borderWidth: 1, borderColor: 'rgba(196,150,26,0.2)' },
  sheetHandle: { width: 40, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.1)', alignSelf: 'center', marginBottom: 24 },
  sheetBtn: { flexDirection: 'row', alignItems: 'center', paddingVertical: 16, gap: 16, borderBottomWidth: 1, borderBottomColor: colors.soot },
  sheetBtnText: { fontFamily: fonts.uiMedium, fontSize: 12, letterSpacing: 2, color: colors.parchment },

  // Settings
  sheetTitle: { fontFamily: fonts.display, fontSize: 24, color: colors.parchment },
  settingsLabel: { fontFamily: fonts.uiMedium, fontSize: 10, letterSpacing: 2, color: colors.fog },
  inviteCodeBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', padding: 14, backgroundColor: 'rgba(196,150,26,0.1)', borderRadius: 2, borderWidth: 1, borderColor: colors.sepia, borderStyle: 'dashed', gap: 12, marginTop: 8 },
  inviteCodeText: { fontFamily: fonts.uiMedium, fontSize: 16, letterSpacing: 4, color: colors.parchment },
  
  memberRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.soot },
  memberAvatar: { width: 32, height: 32, borderRadius: 16, backgroundColor: colors.soot, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  memberName: { flex: 1, fontFamily: fonts.body, fontSize: 14, color: colors.bone },
  memberRole: { fontFamily: fonts.uiMedium, fontSize: 9, letterSpacing: 2, color: colors.sepia },

  leaveBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', padding: 14, gap: 10 },
  leaveBtnText: { fontFamily: fonts.uiMedium, fontSize: 11, letterSpacing: 2, color: colors.sepia, fontWeight: '700' },
});
