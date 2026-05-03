/**
 * EditProfileScreen — "Edit Profile"
 * Pixel-exact match of web EditProfilePage.tsx + settings.css
 */
import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, TextInput, ScrollView,
  ActivityIndicator, Alert, InteractionManager
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeInDown, useSharedValue, useAnimatedStyle, withTiming, Easing, cancelAnimation, useAnimatedKeyboard } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import {
  ChevronLeft, User, Camera, Link2, GripVertical, Plus, X, Film, Sparkles
} from 'lucide-react-native';
import { useAuthStore } from '@/src/stores/auth';
import reelToast from '@/src/utils/reelToast';
import { supabase } from '@/src/lib/supabase';
import { colors, fonts, effects } from '@/src/theme/theme';
import PressableScale from '@/src/components/PressableScale';
import AvatarCropSheet from '@/src/components/profile/AvatarCropSheet';
import { ProfileTriptych } from '@/src/components/profile/ProfileTriptych';
import Buster from '@/src/components/Buster';
import { Image } from 'expo-image';



interface SocialLink {
  id: string;
  title: string;
  url: string;
}

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).substring(2, 9);
}

// Removed redundant AnimatedView definition

// ── Ornamental Divider ──◇── ──
function OrnamentalRule() {
  return (
    <View style={st.ornRule}>
      <View style={st.ornLine} />
      <View style={st.ornDiamond} />
      <View style={st.ornLine} />
    </View>
  );
}

// ── Module-level Section Components (extracted from inline to prevent re-mount on keystroke) ──
const SectionCard = React.memo(({ children, danger }: { children: React.ReactNode; danger?: boolean }) => (
  <View style={[st.sectionCard, danger && st.sectionCardDanger]}>
    <LinearGradient
      colors={danger ? ['transparent', 'rgba(162,36,36,0.2)', 'transparent'] : ['transparent', 'rgba(139,105,20,0.2)', 'transparent']}
      start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
      style={st.sectionTopLine}
    />
    <LinearGradient
      colors={['rgba(139,105,20,0.03)', 'transparent']}
      style={StyleSheet.absoluteFillObject}
    />
    {children}
  </View>
));
SectionCard.displayName = 'SectionCard';

const SectionHead = React.memo(({ icon: Icon, label, danger }: { icon: import('lucide-react-native').LucideIcon; label: string; danger?: boolean }) => (
  <View style={st.sectionHeaderWrap}>
    <View style={st.sectionHeaderRow}>
      <Icon size={14} color={danger ? 'rgba(162,36,36,0.7)' : colors.sepia} style={st.sectionHeaderIcon} />
      <Text style={[st.sectionHeaderText, danger && st.sectionHeaderTextDanger]}>{label}</Text>
    </View>
  </View>
));
SectionHead.displayName = 'SectionHead';

export default function EditProfileScreen() {
  const router = useRouter();
  const { user, updateUser } = useAuthStore();
  const insets = useSafeAreaInsets();

  // ── Profile Fields ──
  const [username, setUsername] = useState(user?.username ?? '');
  const [displayName, setDisplayName] = useState(user?.display_name ?? user?.displayName ?? user?.username ?? '');
  const [bio, setBio] = useState(user?.bio ?? '');
  const [avatarPreview, setAvatarPreview] = useState<string | null>(user?.avatar_url ?? null);
  
  const [showCropModal, setShowCropModal] = useState(false);
  const [links, setLinks] = useState<SocialLink[]>([]);
  const [saving, setSaving] = useState(false);
  const [usernameError, setUsernameError] = useState('');

  // ── Re-sync state from user ──
  useEffect(() => {
    if (!user) return;
    setUsername(user.username ?? '');
    setDisplayName(user.display_name ?? user.displayName ?? user.username ?? '');
    setBio(user.bio ?? '');
    setAvatarPreview(user.avatar_url ?? null);

    const stored = user.social_links as Record<string, string> | { title?: string; url?: string }[] | undefined;
    if (Array.isArray(stored)) {
        setLinks(stored.map(l => ({ id: generateId(), title: l.title || '', url: l.url || '' })));
    } else if (stored && typeof stored === 'object') {
        const converted = Object.entries(stored)
            .filter(([, v]) => v && v.trim())
            .map(([k, v]) => ({ id: generateId(), title: k.charAt(0).toUpperCase() + k.slice(1), url: v }));
        if (converted.length > 0) setLinks(converted);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  // ── Link Management ──
  const addLink = () => {
    if (links.length >= 10) { reelToast.error('Maximum 10 links allowed'); return; }
    Haptics.selectionAsync();
    setLinks(prev => [...prev, { id: generateId(), title: '', url: '' }]);
  };

  const removeLink = (id: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setLinks(prev => prev.filter(l => l.id !== id));
  };

  const updateLink = (id: string, field: 'title' | 'url', value: string) => {
    setLinks(prev => prev.map(l => l.id === id ? { ...l, [field]: value } : l));
  };

  // ── Username Validation ──
  const validateUsername = async (newUsername: string) => {
      if (newUsername === user?.username) { setUsernameError(''); return true }
      if (newUsername.length < 3) { setUsernameError('Must be at least 3 characters'); return false }
      if (newUsername.length > 20) { setUsernameError('Must be 20 characters or fewer'); return false }
      if (!/^[a-zA-Z0-9_]+$/.test(newUsername)) { setUsernameError('Only letters, numbers, and underscores'); return false }

      const { data } = await supabase
          .from('profiles')
          .select('id')
          .eq('username', newUsername)
          .maybeSingle()

      if (data) { setUsernameError('Username already taken'); return false }
      setUsernameError('');
      return true;
  };

  // ── Save All ──
  const handleSave = async () => {
    if (!user) return;
    
    if (displayName.trim().length > 50) { reelToast.error('Display name must be 50 or fewer characters.'); return; }
    if (bio.trim().length > 300) { reelToast.error('Bio must be 300 or fewer characters.'); return; }

    const _username = username.trim().toLowerCase();
    if (_username !== user.username) {
        const isValid = await validateUsername(_username)
        if (!isValid) return;
    }

    setSaving(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      const cleanedLinks = links
          .filter(l => l.url && l.url.trim())
          .map(l => ({ title: l.title.trim() || 'Link', url: l.url.trim() }));
          
      const updateData = {
          display_name: displayName.trim(),
          bio: bio.trim(),
          avatar_url: avatarPreview,
          social_links: cleanedLinks,
          username: _username,
      };

      const { error } = await supabase
          .from('profiles')
          .update(updateData)
          .eq('id', user.id);
          
      if (error) throw error;
      
      // FIX #3: If local update fails after DB success, log breadcrumb but still show success
      // (restoreSession on next launch will reconcile)
      try {
        await updateUser({
          username: _username,
          display_name: displayName.trim(),
          bio: bio.trim(),
          avatar_url: avatarPreview ?? undefined,
          social_links: cleanedLinks,
        });
      } catch (localErr: unknown) {
        if (__DEV__) console.warn('[EditProfile] Local updateUser failed after DB success:', localErr);
      }

      reelToast.success('Profile updated ✦');
      // FIX #2: Defer navigation to prevent animation conflict with success toast
      InteractionManager.runAfterInteractions(() => router.back());
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Update failed — please try again.';
      reelToast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  const isDirty = React.useMemo(() => {
    if (!user) return false;
    const origUsername = user.username ?? '';
    const origDisplayName = user.display_name ?? user.displayName ?? user.username ?? '';
    const origBio = user.bio ?? '';
    const origAvatar = user.avatar_url ?? null;

    if (username !== origUsername) return true;
    if (displayName !== origDisplayName) return true;
    if (bio !== origBio) return true;
    if (avatarPreview !== origAvatar) return true;

    const currentLinks = links.map(l => ({ title: l.title, url: l.url }));
    let origLinks: { title: string; url: string }[] = [];
    const stored = user.social_links as any;
    if (Array.isArray(stored)) {
        origLinks = stored.map(l => ({ title: l.title || '', url: l.url || '' }));
    } else if (stored && typeof stored === 'object') {
        origLinks = Object.entries(stored)
            .filter(([, v]) => v && (v as string).trim())
            .map(([k, v]) => ({ title: k.charAt(0).toUpperCase() + k.slice(1), url: v as string }));
    }
    
    return JSON.stringify(currentLinks) !== JSON.stringify(origLinks);
  }, [user, username, displayName, bio, avatarPreview, links]);

  const handleBack = () => {
    if (isDirty) {
      Alert.alert(
        'Discard Changes',
        'You have unsaved changes. Are you sure you want to discard them?',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Discard', style: 'destructive', onPress: () => router.back() }
        ]
      );
    } else {
      router.back();
    }
  };





  const glowOpacity = useSharedValue(0.04);
  useEffect(() => {
    // Round 6: Removed infinite loop to allow UI thread idling
    glowOpacity.value = withTiming(0.08, { duration: 3000, easing: Easing.inOut(Easing.ease) });
    return () => cancelAnimation(glowOpacity);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const glowStyle = useAnimatedStyle(() => ({ opacity: glowOpacity.value }));

  const keyboard = useAnimatedKeyboard();
  const animatedKeyboardStyle = useAnimatedStyle(() => ({ paddingBottom: keyboard.height.value }));

  if (!user) return null;

  return (
    <Animated.View style={[st.container, animatedKeyboardStyle]}>
      <Animated.View style={[st.ambientGlow, glowStyle]}>
        <LinearGradient
          colors={['rgba(139,105,20,0.15)', 'transparent', 'transparent']}
          locations={[0, 0.4, 1]}
          style={StyleSheet.absoluteFillObject}
        />
      </Animated.View>
      
      <View style={[st.navBar, { paddingTop: insets.top + 8 }]}>
        <PressableScale onPress={handleBack} style={st.navBackBtn} hitSlop={{top: 15, bottom: 15, left: 15, right: 15}} haptic="light">
          <ChevronLeft size={22} color={colors.bone} />
        </PressableScale>
        <PressableScale onPress={handleSave} disabled={saving} hitSlop={{top: 15, bottom: 15, left: 15, right: 15}} haptic="selection" accessibilityRole="button" accessibilityLabel={saving ? 'Saving profile' : 'Save profile changes'}>
          {saving ? <ActivityIndicator size="small" color={colors.sepia} /> : (
            <Text style={st.navSaveText}>SAVE</Text>
          )}
        </PressableScale>
      </View>

      <ScrollView contentContainerStyle={[st.scrollContent, { paddingBottom: Math.max(insets.bottom, 100) }]} showsVerticalScrollIndicator={false}>

        <Animated.View entering={FadeInDown.duration(600)} style={st.hero}>
          <View style={st.heroRuleTop} />
          <View style={st.heroEyebrowRow}>
            <Sparkles size={7} color={colors.sepia} strokeWidth={2} />
            <Text style={st.heroEyebrow}>THE DOSSIER BUREAU</Text>
            <Sparkles size={7} color={colors.sepia} strokeWidth={2} />
          </View>
          <Text style={st.heroTitle}>Edit Profile</Text>
          <Text style={st.heroDesc}>Shape how the society sees you.</Text>
          <View style={st.heroRuleBottom} />
        </Animated.View>


        {/* ════ PROFILE PICTURE ════ */}
        <Animated.View entering={FadeInDown.duration(500).delay(50)}>
          <SectionCard>
            <SectionHead icon={Camera} label="PROFILE PICTURE" />
            <View style={st.avatarSection}>
              <PressableScale 
                style={st.avatarWrap} 
                onPress={() => setShowCropModal(true)}
                accessibilityRole="button"
                accessibilityLabel="Change profile picture"
              >
                {avatarPreview ? (
                    <Image source={{ uri: avatarPreview }} style={st.avatarImg} contentFit="cover" />
                ) : (
                    <Buster size={72} mood="smiling" />
                )}
                <View style={st.avatarOverlay}>
                    <Camera size={24} color={colors.parchment} />
                </View>
              </PressableScale>
              
              <Text style={st.avatarHint}>Tap portrait to change</Text>
              <Text style={st.avatarSpec}>JPG, PNG, or WEBP · MAX 5MB</Text>
            </View>
          </SectionCard>
        </Animated.View>
        
        <OrnamentalRule />

        {/* ════ IDENTITY ════ */}
        <Animated.View entering={FadeInDown.duration(500).delay(100)}>
          <SectionCard>
            <SectionHead icon={User} label="IDENTITY" />

            <View style={st.fieldWrap}>
              <Text style={st.fieldLabel}>USERNAME</Text>
              <View style={st.usernameWrap}>
                <Text style={st.usernameAt}>@</Text>
                <TextInput style={st.usernameInput} value={username} onChangeText={(v: string) => { setUsername(v.toLowerCase().replace(/[^a-z0-9_]/g, '')); setUsernameError(''); }}
                  autoCapitalize="none" autoCorrect={false} placeholderTextColor={colors.ash} maxLength={20} keyboardAppearance="dark" accessibilityLabel="Username" selectionColor={colors.sepia} />
              </View>
              {!!usernameError && <Text style={st.errorText}>{usernameError}</Text>}
              <Text style={st.helperText}>Letters, numbers, and underscores only · 3-20 characters</Text>
            </View>

            <View style={st.fieldWrap}>
              <Text style={st.fieldLabel}>DISPLAY NAME</Text>
              <TextInput style={st.fieldInput} value={displayName} onChangeText={setDisplayName}
                placeholderTextColor={colors.ash} placeholder="Your name in the credits..." maxLength={50} keyboardAppearance="dark" accessibilityLabel="Display name" selectionColor={colors.sepia} />
            </View>

            <View style={st.fieldWrap}>
              <Text style={st.fieldLabel}>BIO</Text>
              <TextInput style={st.bioInput}
                value={bio} onChangeText={setBio} multiline maxLength={300}
                placeholderTextColor={colors.ash} placeholder="A brief dispatch about your cinematic journey..." keyboardAppearance="dark" accessibilityLabel="Bio" selectionColor={colors.sepia} returnKeyType="done" blurOnSubmit={true} />
              <Text style={st.charCount}>{bio.length}/300</Text>
            </View>
          </SectionCard>
        </Animated.View>
        
        <OrnamentalRule />

        {/* ════ FAVORITE FILMS ════ */}
        <Animated.View entering={FadeInDown.duration(500).delay(150)}>
            <SectionCard>
                <SectionHead icon={Film} label="FAVORITE FILMS" />
                <Text style={st.fieldBody}>Choose 3 films that define your cinematic identity. Tap a slot to search and select.</Text>
                <ProfileTriptych user={user as unknown as import('@/src/components/profile/ProfileTriptych').TriptychUser} isOwnProfile={true} userRole={user?.role as string} />
            </SectionCard>
        </Animated.View>

        <OrnamentalRule />

        {/* ════ LINKS ════ */}
        <Animated.View entering={FadeInDown.duration(500).delay(200)}>
            <SectionCard>
                <SectionHead icon={Link2} label="LINKS" />
                <Text style={st.fieldBody}>Add links to your profile. They will be visible to anyone who visits your page.</Text>
                
                <View style={st.linksContainer}>
                    {links.map((link, index) => (
                        <View key={link.id} style={st.linkItem}>
                            <View style={st.linkItemHeader}>
                                <View style={st.linkDragHandleRow}>
                                    <GripVertical size={12} color={colors.ash} style={st.linkDragHandleIcon} />
                                    <Text style={st.linkItemTitle} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>LINK {index + 1}</Text>
                                </View>
                                <PressableScale onPress={() => removeLink(link.id)} style={st.linkRemoveBtn} hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }} haptic="light">
                                    <X size={14} color={colors.ash} />
                                </PressableScale>
                            </View>
                            
                            <View style={st.fieldWrap}>
                                <Text style={st.fieldLabel}>TITLE</Text>
                                <TextInput style={st.fieldInput} value={link.title} onChangeText={(t) => updateLink(link.id, 'title', t)} placeholder="e.g. My Portfolio, Blog, Channel..." placeholderTextColor={colors.ash} maxLength={40} keyboardAppearance="dark" accessibilityLabel="Link title" selectionColor={colors.sepia} />
                            </View>
                            
                            <View style={st.fieldWrap}>
                                <Text style={st.fieldLabel}>URL</Text>
                                <TextInput style={st.fieldInput} value={link.url} onChangeText={(t) => updateLink(link.id, 'url', t)} placeholder="https://..." placeholderTextColor={colors.ash} keyboardType="url" autoCapitalize="none" autoCorrect={false} keyboardAppearance="dark" accessibilityLabel="Link URL" selectionColor={colors.sepia} />
                            </View>
                        </View>
                    ))}
                </View>

                <PressableScale style={st.addLinkBtn} onPress={addLink} haptic="selection">
                    <Plus size={14} color={colors.sepia} />
                    <Text style={st.addLinkText}>ADD LINK</Text>
                </PressableScale>

                {links.length > 0 && <Text style={st.linksCount}>{links.length}/10 LINKS</Text>}
            </SectionCard>
        </Animated.View>


        {/* ── Heritage Footer ── */}
        <Animated.View entering={FadeInDown.duration(500).delay(250)} style={st.heritageFooter}>
          <OrnamentalRule />

          {/* H-08 AUDIT FIX: Duplicate save button removed — nav bar SAVE is the single action */}

          <Text style={st.memberSince}>
            MEMBER SINCE {user.created_at ? new Date(user.created_at).toLocaleDateString('en-US', { month: 'long', year: 'numeric' }).toUpperCase() : 'THE BEGINNING'}
          </Text>

          <View style={st.endMarkRow}>
            <View style={st.endMarkLine} />
            <Sparkles size={8} color={colors.sepia} strokeWidth={1.5} />
            <View style={st.endMarkLine} />
          </View>
        </Animated.View>

      </ScrollView>

      {/* Avatar Crop Modal Overlay */}
      {showCropModal && (
        <AvatarCropSheet 
           onClose={() => setShowCropModal(false)}
           onSuccess={(url) => {
               setAvatarPreview(url);
               setShowCropModal(false);
           }}
        />
      )}
    </Animated.View>
  );
}

// ═══════════════════════════════════════════════════════
//  STYLES
// ═══════════════════════════════════════════════════════
const st = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.ink },
  scrollContent: { paddingBottom: 100 },
  ambientGlow: {
    position: 'absolute', top: 0, left: 0, right: 0, height: 350, zIndex: 0,
  },
  ornRule: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    marginVertical: 8, marginHorizontal: 24, opacity: 0.4,
  },
  ornLine: { flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: colors.sepia },
  ornDiamond: {
    width: 5, height: 5, backgroundColor: colors.sepia,
    transform: [{ rotate: '45deg' }],
  },
  navBar: {
    paddingHorizontal: 16, paddingBottom: 12,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.ash,
    backgroundColor: colors.ink, zIndex: 10,
  },
  navBackBtn: { width: 40, height: 40, justifyContent: 'center' },
  navSaveText: { fontFamily: fonts.uiBold, fontSize: 10, letterSpacing: 2, color: colors.sepia },
  hero: {
    alignItems: 'center', paddingHorizontal: 24,
    marginTop: 20, marginBottom: 12, paddingBottom: 20,
  },
  heroRuleTop: {
    width: '80%', height: 6, marginBottom: 16,
    borderTopWidth: 3, borderTopColor: colors.sepia,
    borderBottomWidth: 1, borderBottomColor: 'rgba(139,105,20,0.25)', opacity: 0.5,
  },
  heroEyebrowRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 },
  heroEyebrow: { fontFamily: fonts.ui, fontSize: 8, letterSpacing: 5, color: colors.sepia, opacity: 0.8 },
  heroTitle: { fontFamily: fonts.display, fontSize: 32, color: colors.parchment, lineHeight: 36, marginBottom: 6, ...effects.textGlowSepia, textShadowRadius: 25 },
  heroDesc: { fontFamily: fonts.body, fontSize: 13, color: colors.bone, opacity: 0.6, fontStyle: 'italic', textAlign: 'center', lineHeight: 20, letterSpacing: 0.5, marginBottom: 16 },
  heroRuleBottom: { width: '80%', height: 6, borderTopWidth: 1, borderTopColor: 'rgba(139,105,20,0.25)', borderBottomWidth: 3, borderBottomColor: colors.sepia, opacity: 0.5 },
  sectionCard: { marginHorizontal: 16, marginBottom: 16, padding: 20, backgroundColor: 'rgba(18,14,9,0.85)', borderWidth: 1, borderColor: 'rgba(139,105,20,0.12)', borderRadius: 4, overflow: 'hidden' },
  sectionCardDanger: { borderColor: 'rgba(162,36,36,0.15)' },
  sectionTopLine: { position: 'absolute', top: 0, left: 0, right: 0, height: 1 },
  sectionHeaderWrap: { marginBottom: 18, paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: 'rgba(139,105,20,0.08)' },
  sectionHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  sectionHeaderIcon: { opacity: 0.7 },
  sectionHeaderText: { fontFamily: fonts.ui, fontSize: 9, letterSpacing: 2.5, color: colors.sepia },
  sectionHeaderTextDanger: { color: 'rgba(162,36,36,0.7)' },
  
  // Fields
  fieldWrap: { marginBottom: 16 },
  fieldLabel: { fontFamily: fonts.ui, fontSize: 8, letterSpacing: 2, color: colors.sepia, marginBottom: 6 },
  fieldInput: { width: '100%', paddingHorizontal: 14, paddingVertical: 11, backgroundColor: 'rgba(10,7,3,0.6)', borderWidth: 1, borderColor: 'rgba(139,105,20,0.1)', borderRadius: 3, color: colors.parchment, fontFamily: fonts.body, fontSize: 14 },
  bioInput: { width: '100%', paddingHorizontal: 14, paddingVertical: 11, backgroundColor: 'rgba(10,7,3,0.6)', borderWidth: 1, borderColor: 'rgba(139,105,20,0.1)', borderRadius: 3, color: colors.parchment, fontFamily: fonts.body, fontSize: 14, height: 90, textAlignVertical: 'top', lineHeight: 20 },
  charCount: { fontFamily: fonts.ui, fontSize: 8, letterSpacing: 1, color: colors.ash, textAlign: 'right', marginTop: 4 },
  fieldBody: { fontFamily: fonts.body, fontSize: 13, color: colors.bone, lineHeight: 20, marginBottom: 12 },
  
  usernameWrap: { position: 'relative', width: '100%', justifyContent: 'center' },
  usernameAt: { position: 'absolute', left: 14, fontFamily: fonts.body, fontSize: 14, color: colors.fog, zIndex: 2 },
  usernameInput: { paddingLeft: 32, width: '100%', paddingHorizontal: 14, paddingVertical: 11, backgroundColor: 'rgba(10,7,3,0.6)', borderWidth: 1, borderColor: 'rgba(139,105,20,0.1)', borderRadius: 3, color: colors.parchment, fontFamily: fonts.body, fontSize: 14 },
  errorText: { fontFamily: fonts.ui, fontSize: 9, letterSpacing: 1, color: '#c0392b', marginTop: 4 },
  helperText: { fontFamily: fonts.ui, fontSize: 9, letterSpacing: 1, color: colors.ash, marginTop: 4 },

  // Avatar
  avatarSection: { alignItems: 'center', marginVertical: 10 },
  avatarWrap: { width: 120, height: 120, borderRadius: 60, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(139,105,20,0.3)', backgroundColor: colors.soot, justifyContent: 'center', alignItems: 'center', marginBottom: 12 },
  avatarImg: { width: '100%', height: '100%' },
  avatarOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', alignItems: 'center' },
  avatarHint: { fontFamily: fonts.body, fontSize: 14, color: colors.bone, marginBottom: 4 },
  avatarSpec: { fontFamily: fonts.ui, fontSize: 9, letterSpacing: 1.5, color: colors.ash },

  // Links
  linksContainer: { gap: 16, marginBottom: 12 },
  linkItem: { padding: 16, backgroundColor: 'rgba(10,7,3,0.5)', borderWidth: 1, borderColor: 'rgba(139,105,20,0.1)', borderRadius: 4 },
  linkItemHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  linkItemTitle: { fontFamily: fonts.ui, fontSize: 9, letterSpacing: 2, color: colors.fog },
  linkRemoveBtn: { padding: 4 },
  addLinkBtn: { width: '100%', padding: 14, backgroundColor: 'rgba(139,105,20,0.05)', borderWidth: 1, borderColor: 'rgba(139,105,20,0.2)', borderStyle: 'dashed', borderRadius: 4, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 4 },
  addLinkText: { fontFamily: fonts.ui, fontSize: 10, letterSpacing: 2, color: colors.sepia },
  linksCount: { fontFamily: fonts.ui, fontSize: 9, letterSpacing: 1, color: colors.ash, textAlign: 'center', marginTop: 10 },

  heritageFooter: { alignItems: 'center', paddingHorizontal: 24, paddingBottom: 40, marginTop: 10 },
  globalSaveBtn: { position: 'relative', width: '100%', paddingVertical: 14, borderRadius: 4, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(139,105,20,0.3)', marginBottom: 24, backgroundColor: colors.ink },
  disabledBtn: { opacity: 0.5 },
  saveBtnContent: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 },
  globalSaveBtnText: { fontFamily: fonts.uiBold, fontSize: 11, letterSpacing: 3, color: colors.sepia },
  memberSince: { fontFamily: fonts.ui, fontSize: 9, letterSpacing: 2, color: colors.fog, marginBottom: 20 },
  endMarkRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 20, width: '40%', alignSelf: 'center', opacity: 0.3 },
  endMarkLine: { flex: 1, height: 1, backgroundColor: colors.sepia },
  linkDragHandleRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  linkDragHandleIcon: { opacity: 0.4 },
});
