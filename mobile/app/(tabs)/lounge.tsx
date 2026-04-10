import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, Modal, KeyboardAvoidingView, Platform, Image, Switch, Dimensions } from 'react-native';
import { useRouter } from 'expo-router';
import Animated, { FadeInDown, FadeIn, SlideInDown, SlideOutDown } from 'react-native-reanimated';
import { BlurView } from 'expo-blur';
import { Search, Plus, Lock, Users, Globe, X, Check, Copy, Info } from 'lucide-react-native';
import { useLoungeStore, LoungeRoom } from '@/src/stores/lounge';
import { useAuthStore } from '@/src/stores/auth';
import { colors, fonts } from '@/src/theme/theme';
import { tmdb } from '@/src/lib/tmdb';

const { width } = Dimensions.get('window');

const AnimatedView = Animated.createAnimatedComponent(View);

// ── Lounge Gate ──
function LoungeGate() {
  const router = useRouter();
  return (
    <View style={s.gateContainer}>
      <AnimatedView entering={FadeInDown.duration(800)} style={s.gateCard}>
        <View style={s.gateIconWrap}><Lock size={40} color={colors.parchment} strokeWidth={1} /></View>
        <Text style={s.gateTitle}>The Lounge</Text>
        <Text style={s.gateSub}>ARCHIVIST MEMBERS ONLY</Text>
        <View style={s.rule} />
        <Text style={s.gateDesc}>
          Beyond this door lies The Lounge — intimate cinema salons where the devoted gather to discuss,
          debate, and discover. Private screening rooms. Whispered critiques. 
          A place where cinema lives between the frames, and every conversation 
          is a love letter to the art.
        </Text>
        <TouchableOpacity style={s.gateBtn} onPress={() => router.push('/settings')}>
          <Text style={s.gateBtnText}>BECOME AN ARCHIVIST</Text>
        </TouchableOpacity>
      </AnimatedView>
    </View>
  );
}

// ── Create Lounge Sheet ──
function CreateLoungeSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const router = useRouter();
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
      onClose();
      router.push(`/lounge/${id}`);
    }
  };

  if (!visible) return null;

  return (
    <Modal transparent visible animationType="fade" onRequestClose={onClose}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <BlurView intensity={40} tint="dark" style={StyleSheet.absoluteFill}>
          <TouchableOpacity activeOpacity={1} style={{ flex: 1 }} onPress={onClose} />
        </BlurView>
        
        <AnimatedView entering={SlideInDown.springify().damping(24)} exiting={SlideOutDown} style={s.sheet}>
          <View style={s.sheetHandle} />
          <View style={s.sheetHeader}>
            <Text style={s.sheetEyebrow}>CURATE YOUR CINEMA CIRCLE</Text>
            <Text style={s.sheetTitle}>Open a Lounge</Text>
          </View>

          <View style={s.field}>
            <Text style={s.label}>LOUNGE NAME</Text>
            <TextInput
              style={s.input}
              placeholder="e.g., The Noir Corner..."
              placeholderTextColor={colors.fog}
              value={name}
              onChangeText={setName}
              maxLength={60}
              selectionColor={colors.sepia}
            />
          </View>

          <View style={s.field}>
            <Text style={s.label}>DESCRIPTION</Text>
            <TextInput
              style={[s.input, { height: 80, textAlignVertical: 'top' }]}
              placeholder="What's this lounge about?"
              placeholderTextColor={colors.fog}
              value={description}
              onChangeText={setDescription}
              maxLength={300}
              multiline
              selectionColor={colors.sepia}
            />
          </View>

          <View style={s.toggleRow}>
            <View style={{ flex: 1 }}>
              <Text style={s.toggleLabel}>{isPrivate ? 'PRIVATE SCREENING ROOM' : 'PUBLIC SALON'}</Text>
              <Text style={s.toggleDesc}>{isPrivate ? 'Invite-only via code' : 'Anyone with Archivist+ can join'}</Text>
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
            <TouchableOpacity style={s.sheetBtnGhost} onPress={onClose} disabled={creating}>
              <Text style={s.sheetBtnGhostText}>CANCEL</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[s.sheetBtnPrimary, (!name.trim() || creating) && { opacity: 0.5 }]} onPress={handleCreate} disabled={!name.trim() || creating}>
              <Text style={s.sheetBtnPrimaryText}>{creating ? 'OPENING...' : 'OPEN LOUNGE'}</Text>
            </TouchableOpacity>
          </View>
        </AnimatedView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ── Cards ──
function JoinedLoungeCard({ lounge }: { lounge: LoungeRoom }) {
  const router = useRouter();
  const coverUrl = lounge.cover_image ? tmdb.backdrop(lounge.cover_image, 'w500') : null;

  return (
    <TouchableOpacity style={s.joinedCard} onPress={() => router.push(`/lounge/${lounge.id}`)}>
      <View style={s.joinedCardImgWrap}>
        {coverUrl ? (
           <Image style={s.joinedCardImg} source={{ uri: coverUrl }} />
        ) : (
           <View style={[s.joinedCardImg, { backgroundColor: 'rgba(196,150,26,0.05)' }]} />
        )}
        <View style={s.joinedOverlay} />
      </View>
      <View style={s.joinedCardContent}>
        <Text style={s.joinedCardName} numberOfLines={1}>{lounge.name}</Text>
        <Text style={s.joinedCardMeta}>{lounge.member_count} MEMBER{lounge.member_count !== 1 ? 'S' : ''}</Text>
      </View>
      {Boolean(lounge.unread_count && lounge.unread_count > 0) && (
        <View style={s.unreadBadge} />
      )}
    </TouchableOpacity>
  );
}

function PublicLoungeCard({ lounge }: { lounge: LoungeRoom }) {
  const router = useRouter();
  const coverUrl = lounge.cover_image ? tmdb.backdrop(lounge.cover_image, 'w500') : null;

  return (
    <TouchableOpacity style={s.publicCard} onPress={() => router.push(`/lounge/${lounge.id}`)}>
      <View style={s.publicCardLeft}>
        <Text style={s.publicCardName} numberOfLines={1}>{lounge.name}</Text>
        <Text style={s.publicCardDesc} numberOfLines={2}>{lounge.description || 'A cinematic gathering.'}</Text>
        <View style={s.publicCardFooter}>
          <Users size={12} color={colors.fog} />
          <Text style={s.publicCardMeta}>{lounge.member_count} Members</Text>
        </View>
      </View>
      {coverUrl && (
        <View style={s.publicCardRight}>
           <Image source={{ uri: coverUrl }} style={s.publicCardImg} />
        </View>
      )}
    </TouchableOpacity>
  );
}

// ── Main Screen ──
export default function LoungeScreen() {
  const user = useAuthStore(s => s.user);
  const isAuthenticated = useAuthStore(s => s.isAuthenticated);
  const { lounges, fetchLounges, loading } = useLoungeStore();
  
  const [searchQuery, setSearchQuery] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [inviteCode, setInviteCode] = useState('');
  const [joining, setJoining] = useState(false);

  const isArchivist = user?.role === 'archivist' || user?.role === 'auteur';

  useEffect(() => {
    if (isAuthenticated && isArchivist) {
      fetchLounges();
      const interval = setInterval(fetchLounges, 30000);
      return () => clearInterval(interval);
    }
  }, [isAuthenticated, isArchivist]);

  const handleJoinByCode = async () => {
    if (!inviteCode.trim()) return;
    setJoining(true);
    const success = await useLoungeStore.getState().joinLounge(inviteCode.trim());
    setJoining(false);
    if (success) {
      setInviteCode('');
    }
  };

  if (!isAuthenticated || !isArchivist) {
    return <LoungeGate />;
  }

  const query = searchQuery.toLowerCase().trim();
  const filteredLounges = lounges.filter(l => l.name.toLowerCase().includes(query) || (l.description && l.description.toLowerCase().includes(query)));
  
  // Separation logic: myLounges vs publicLounges
  const myLounges = filteredLounges.filter(l => typeof l.unread_count === 'number');
  const publicLounges = filteredLounges.filter(l => typeof l.unread_count !== 'number' && !l.is_private);

  return (
    <View style={s.container}>
      <AnimatedView entering={FadeIn.duration(600)} style={s.header}>
        <Text style={s.headerEyebrow}>ARCHIVIST EXCLUSIVE</Text>
        <Text style={s.headerTitle}>The Lounge</Text>
        <Text style={s.headerSubtitle}>Where cinema lives between the frames.</Text>

        <View style={s.searchWrap}>
          <Search size={16} color={colors.fog} />
          <TextInput
            style={s.searchInput}
            placeholder="Search screening rooms..."
            placeholderTextColor={colors.fog}
            value={searchQuery}
            onChangeText={setSearchQuery}
            selectionColor={colors.sepia}
          />
        </View>

        <View style={s.actionsRow}>
          <TouchableOpacity style={s.btnPrimary} onPress={() => setShowCreate(true)}>
            <Plus size={14} color={colors.ink} />
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
            />
            <TouchableOpacity style={s.btnJoin} onPress={handleJoinByCode} disabled={!inviteCode.trim() || joining}>
              <Text style={s.btnJoinText}>{joining ? '⋅⋅⋅' : 'JOIN'}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </AnimatedView>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={s.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Joined Rooms */}
        {myLounges.length > 0 && (
          <View style={s.section}>
            <Text style={s.sectionLabel}>YOUR PRIVATE SCREENING ROOMS</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 16, paddingLeft: 20, paddingRight: 20 }}>
              {myLounges.map(l => <JoinedLoungeCard key={`my-${l.id}`} lounge={l} />)}
            </ScrollView>
          </View>
        )}

        {/* Public Salons */}
        <View style={s.section}>
          <View style={{ paddingHorizontal: 20 }}>
            <Text style={s.sectionLabel}>OPEN SALONS — TAKE A SEAT</Text>
            {publicLounges.length > 0 ? (
              <View style={{ gap: 16 }}>
                {publicLounges.map(l => <PublicLoungeCard key={`pub-${l.id}`} lounge={l} />)}
              </View>
            ) : (
              <View style={s.emptyState}>
                <Text style={s.emptyStateText}>No open salons at this time.</Text>
              </View>
            )}
          </View>
        </View>
      </ScrollView>

      <CreateLoungeSheet visible={showCreate} onClose={() => setShowCreate(false)} />
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.ink },
  gateContainer: { flex: 1, backgroundColor: colors.ink, justifyContent: 'center', padding: 30 },
  gateCard: { alignItems: 'center', borderTopWidth: 1, borderTopColor: 'rgba(196,150,26,0.2)', paddingTop: 40 },
  gateIconWrap: { width: 80, height: 80, borderRadius: 40, borderWidth: 1, borderColor: colors.sepia, alignItems: 'center', justifyContent: 'center', marginBottom: 20 },
  gateTitle: { fontFamily: fonts.display, fontSize: 32, color: colors.parchment, marginBottom: 8 },
  gateSub: { fontFamily: fonts.uiMedium, fontSize: 10, letterSpacing: 3, color: colors.sepia, marginBottom: 16 },
  rule: { width: 40, height: 1, backgroundColor: colors.sepia, opacity: 0.4, marginVertical: 12 },
  gateDesc: { fontFamily: fonts.body, color: colors.bone, fontSize: 13, lineHeight: 22, textAlign: 'center', marginBottom: 32 },
  gateBtn: { backgroundColor: colors.sepia, paddingVertical: 16, paddingHorizontal: 32, borderRadius: 2 },
  gateBtnText: { fontFamily: fonts.uiMedium, fontSize: 11, letterSpacing: 2, color: colors.ink, fontWeight: '700' },

  header: { paddingTop: Platform.OS === 'ios' ? 60 : 60, paddingHorizontal: 20, paddingBottom: 24, borderBottomWidth: 1, borderBottomColor: colors.soot },
  headerEyebrow: { fontFamily: fonts.uiMedium, fontSize: 9, letterSpacing: 4, color: colors.sepia, marginBottom: 6 },
  headerTitle: { fontFamily: fonts.display, fontSize: 36, color: colors.parchment, lineHeight: 40 },
  headerSubtitle: { fontFamily: fonts.bodyItalic, fontSize: 13, color: colors.bone, opacity: 0.8, marginTop: 4 },
  
  searchWrap: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.soot, borderRadius: 2, paddingHorizontal: 14, height: 44, marginTop: 20, borderWidth: 1, borderColor: colors.ash },
  searchInput: { flex: 1, marginLeft: 10, fontFamily: fonts.ui, fontSize: 12, color: colors.parchment },
  
  actionsRow: { flexDirection: 'row', marginTop: 16, gap: 12 },
  btnPrimary: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: colors.sepia, borderRadius: 2, height: 44 },
  btnPrimaryText: { fontFamily: fonts.uiMedium, fontSize: 10, letterSpacing: 2, color: colors.ink, fontWeight: '700' },
  inviteWrap: { flexDirection: 'row', flex: 1, gap: 8 },
  inviteInput: { flex: 1, backgroundColor: colors.soot, borderRadius: 2, height: 44, paddingHorizontal: 12, fontFamily: fonts.ui, fontSize: 12, color: colors.parchment, textAlign: 'center', letterSpacing: 4, borderWidth: 1, borderColor: colors.ash },
  btnJoin: { backgroundColor: colors.ash, paddingHorizontal: 16, justifyContent: 'center', alignItems: 'center', borderRadius: 2 },
  btnJoinText: { fontFamily: fonts.uiMedium, fontSize: 10, letterSpacing: 2, color: colors.parchment },

  scrollContent: { paddingVertical: 24, paddingBottom: 100 },
  section: { marginBottom: 40 },
  sectionLabel: { fontFamily: fonts.uiMedium, fontSize: 10, letterSpacing: 2, color: colors.fog, marginBottom: 16, paddingHorizontal: 20 },
  
  joinedCard: { width: 140 },
  joinedCardImgWrap: { width: 140, height: 180, borderRadius: 2, overflow: 'hidden', marginBottom: 12 },
  joinedCardImg: { width: '100%', height: '100%' },
  joinedOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.1)' },
  joinedCardContent: { gap: 4 },
  joinedCardName: { fontFamily: fonts.display, fontSize: 16, color: colors.parchment },
  joinedCardMeta: { fontFamily: fonts.ui, fontSize: 10, letterSpacing: 1, color: colors.fog },
  unreadBadge: { position: 'absolute', top: 8, right: 8, width: 8, height: 8, borderRadius: 4, backgroundColor: colors.sepia },

  publicCard: { flexDirection: 'row', backgroundColor: colors.soot, borderRadius: 2, padding: 16, borderWidth: 1, borderColor: colors.ash, alignItems: 'center' },
  publicCardLeft: { flex: 1, paddingRight: 16 },
  publicCardName: { fontFamily: fonts.display, fontSize: 18, color: colors.parchment, marginBottom: 4 },
  publicCardDesc: { fontFamily: fonts.body, fontSize: 13, color: colors.bone, lineHeight: 18, marginBottom: 12 },
  publicCardFooter: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  publicCardMeta: { fontFamily: fonts.ui, fontSize: 10, letterSpacing: 1, color: colors.fog },
  publicCardRight: { width: 70, height: 70, borderRadius: 2, overflow: 'hidden' },
  publicCardImg: { width: '100%', height: '100%' },

  emptyState: { alignItems: 'center', justifyContent: 'center', padding: 40, borderWidth: 1, borderColor: colors.ash, borderStyle: 'dashed', borderRadius: 2 },
  emptyStateText: { fontFamily: fonts.bodyItalic, fontSize: 13, color: colors.fog },

  sheet: { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: colors.soot, borderTopLeftRadius: 16, borderTopRightRadius: 16, padding: 24, paddingBottom: Platform.OS === 'ios' ? 40 : 24, borderWidth: 1, borderColor: colors.ash },
  sheetHandle: { width: 40, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.1)', alignSelf: 'center', marginBottom: 24 },
  sheetHeader: { marginBottom: 24 },
  sheetEyebrow: { fontFamily: fonts.uiMedium, fontSize: 9, letterSpacing: 3, color: colors.fog, marginBottom: 8 },
  sheetTitle: { fontFamily: fonts.display, fontSize: 28, color: colors.parchment },
  field: { marginBottom: 20 },
  label: { fontFamily: fonts.uiMedium, fontSize: 10, letterSpacing: 2, color: colors.fog, marginBottom: 8 },
  input: { backgroundColor: colors.ink, borderWidth: 1, borderColor: colors.ash, borderRadius: 2, padding: 14, fontFamily: fonts.body, fontSize: 14, color: colors.bone },
  toggleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 32 },
  toggleLabel: { fontFamily: fonts.uiMedium, fontSize: 11, letterSpacing: 1, color: colors.parchment, marginBottom: 4 },
  toggleDesc: { fontFamily: fonts.bodyItalic, fontSize: 12, color: colors.fog },
  sheetActions: { flexDirection: 'row', gap: 12 },
  sheetBtnGhost: { flex: 1, height: 48, justifyContent: 'center', alignItems: 'center', borderRadius: 2, borderWidth: 1, borderColor: colors.ash },
  sheetBtnGhostText: { fontFamily: fonts.uiMedium, fontSize: 10, letterSpacing: 2, color: colors.parchment },
  sheetBtnPrimary: { flex: 1, height: 48, justifyContent: 'center', alignItems: 'center', borderRadius: 2, backgroundColor: colors.sepia },
  sheetBtnPrimaryText: { fontFamily: fonts.uiMedium, fontSize: 10, letterSpacing: 2, color: colors.ink, fontWeight: '700' },
});
