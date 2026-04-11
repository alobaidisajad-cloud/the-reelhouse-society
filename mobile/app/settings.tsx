/**
 * SettingsScreen — "The Dossier Bureau"
 * Pixel-exact match of web SettingsPage.tsx + settings.css
 * Sections: Edit Profile, Patronage, Account, Privacy, Notifications, Import/Export, Legal, Account Actions
 * Nitrate Noir — lucide icons only, zero emojis.
 */
import { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity, ScrollView,
  Switch, Alert, ActivityIndicator, Platform, Linking,
} from 'react-native';
import Animated, { FadeInDown, useSharedValue, useAnimatedStyle, withRepeat, withTiming, Easing } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import {
  ChevronLeft, Lock, Eye, Bell, Download, Trash2,
  Shield, FileText, User, Crown, LogOut, ChevronDown, ChevronUp,
  Smartphone, Sparkles, Star,
} from 'lucide-react-native';
import { useAuthStore } from '@/src/stores/auth';
import { supabase } from '@/src/lib/supabase';
import { colors, fonts, effects } from '@/src/theme/theme';
import DataVault from '@/src/components/settings/DataVault';

const AnimatedView = Animated.createAnimatedComponent(View);

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

export default function SettingsScreen() {
  const router = useRouter();
  const { user, updateUser, logout } = useAuthStore();

  // ── Profile Fields ──
  const [username, setUsername] = useState(user?.username || '');
  const [displayName, setDisplayName] = useState(user?.display_name || user?.username || '');
  const [bio, setBio] = useState(user?.bio || '');

  // ── Privacy ──
  const [socialVisibility, setSocialVisibility] = useState<string>(
    (user?.preferences as any)?.social_visibility || (user?.is_social_private ? 'private' : 'public')
  );
  const [privacyEndorsements, setPrivacyEndorsements] = useState<string>(
    (user?.preferences as any)?.privacy_endorsements || 'everyone'
  );
  const [privacyAnnotations, setPrivacyAnnotations] = useState<string>(
    (user?.preferences as any)?.privacy_annotations || 'everyone'
  );

  // ── Notifications ──
  const prefs = (user?.preferences || {}) as Record<string, any>;
  const [notifFollows, setNotifFollows] = useState(prefs.notif_follows !== false);
  const [notifEndorsements, setNotifEndorsements] = useState(prefs.notif_endorsements !== false);
  const [notifComments, setNotifComments] = useState(prefs.notif_comments !== false);
  const [notifSystem, setNotifSystem] = useState(prefs.notif_system !== false);

  // ── Password ──
  const [showPasswordChange, setShowPasswordChange] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [changingPassword, setChangingPassword] = useState(false);

  // ── General ──
  const [saving, setSaving] = useState(false);

  const userRole = (user?.role as string) || 'cinephile';

  // ── Re-sync state from user ──
  useEffect(() => {
    if (!user) return;
    const p = (user.preferences || {}) as Record<string, any>;
    setSocialVisibility(p.social_visibility || (user.is_social_private ? 'private' : 'public'));
    setPrivacyEndorsements(p.privacy_endorsements || 'everyone');
    setPrivacyAnnotations(p.privacy_annotations || 'everyone');
    setNotifFollows(p.notif_follows !== undefined ? !!p.notif_follows : true);
    setNotifEndorsements(p.notif_endorsements !== undefined ? !!p.notif_endorsements : true);
    setNotifComments(p.notif_comments !== undefined ? !!p.notif_comments : true);
    setNotifSystem(p.notif_system !== undefined ? !!p.notif_system : true);
  }, [user?.id, user?.preferences]);

  // ── Save All ──
  const handleSave = async () => {
    if (!user) return;
    setSaving(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      await updateUser({
        username: username.trim(),
        display_name: displayName.trim(),
        bio: bio.trim(),
        isSocialPrivate: socialVisibility === 'private',
      });
      const setP = useAuthStore.getState().setPreference;
      await setP('notif_follows', notifFollows);
      await setP('notif_endorsements', notifEndorsements);
      await setP('notif_comments', notifComments);
      await setP('notif_system', notifSystem);
      await setP('social_visibility', socialVisibility);
      await setP('privacy_endorsements', privacyEndorsements);
      await setP('privacy_annotations', privacyAnnotations);

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert('Archived', 'Settings saved successfully.');
    } catch (err: any) {
      Alert.alert('Save Failed', err.message || 'An error occurred');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setSaving(false);
    }
  };

  // ── Password Change ──
  const handlePasswordChange = async () => {
    if (newPassword.length < 8) { Alert.alert('Error', 'Password must be at least 8 characters'); return; }
    if (newPassword !== confirmPassword) { Alert.alert('Error', 'Passwords do not match'); return; }
    setChangingPassword(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;
      Alert.alert('Updated', 'Password changed successfully.');
      setNewPassword('');
      setConfirmPassword('');
      setShowPasswordChange(false);
    } catch (e: any) {
      Alert.alert('Failed', e.message || 'Password change failed');
    } finally {
      setChangingPassword(false);
    }
  };

  // ── Sign Out ──
  const handleSignOut = () => {
    Alert.alert('Sign Out', 'Leave The Society for now?', [
      { text: 'CANCEL', style: 'cancel' },
      { text: 'SIGN OUT', style: 'destructive', onPress: async () => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
        await logout();
        router.replace('/');
      }},
    ]);
  };

  // ── Delete Account ──
  const handleDeleteAccount = () => {
    Alert.alert(
      'Delete Account',
      'This will permanently delete your account, all logs, lists, and reviews. This cannot be undone.',
      [
        { text: 'CANCEL', style: 'cancel' },
        { text: 'DELETE', style: 'destructive', onPress: () => {
          Alert.alert('Contact Support', 'Account deletion requires admin intervention. Contact support@reelhouse.app');
        }},
      ]
    );
  };

  if (!user) return null;

  // ═══ REUSABLE COMPONENTS ═══

  // Section Card — matches web .settings-section
  const SectionCard = ({ children, danger }: { children: React.ReactNode; danger?: boolean }) => (
    <View style={[st.sectionCard, danger && st.sectionCardDanger]}>
      {/* Top gradient line (::before equivalent) */}
      <LinearGradient
        colors={danger ? ['transparent', 'rgba(162,36,36,0.2)', 'transparent'] : ['transparent', 'rgba(139,105,20,0.2)', 'transparent']}
        start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
        style={st.sectionTopLine}
      />
      {/* Subtle vertical gradient overlay */}
      <LinearGradient
        colors={['rgba(139,105,20,0.03)', 'transparent']}
        style={StyleSheet.absoluteFillObject}
      />
      {children}
    </View>
  );

  // Section Header — matches web .settings-section-header
  const SectionHead = ({ icon: Icon, label, danger }: { icon: any; label: string; danger?: boolean }) => (
    <View style={[st.sectionHeaderWrap]}>
      <View style={st.sectionHeaderRow}>
        <Icon size={14} color={danger ? 'rgba(162,36,36,0.7)' : colors.sepia} style={st.sectionHeaderIcon} />
        <Text style={[st.sectionHeaderText, danger && st.sectionHeaderTextDanger]}>{label}</Text>
      </View>
    </View>
  );

  // Toggle — matches web .settings-toggle
  const Toggle = ({ active, onToggle }: { active: boolean; onToggle: () => void }) => (
    <Switch
      value={active}
      onValueChange={() => { Haptics.selectionAsync(); onToggle(); }}
      trackColor={{ false: 'rgba(139,105,20,0.12)', true: colors.sepia }}
      thumbColor={active ? colors.parchment : colors.fog}
    />
  );

  // Radio Option — matches web .settings-radio-option
  const RadioOption = ({ selected, label, onPress }: { selected: boolean; label: string; onPress: () => void }) => (
    <TouchableOpacity
      style={[st.radioOption, selected && st.radioOptionActive]}
      onPress={() => { Haptics.selectionAsync(); onPress(); }}
      activeOpacity={0.7}
    >
      <View style={[st.radioDot, selected && st.radioDotActive]} />
      <Text style={[st.radioLabel, selected && st.radioLabelActive]}>{label}</Text>
    </TouchableOpacity>
  );

  // Action Button — matches web .settings-action-btn
  const ActionBtn = ({ icon: Icon, label, onPress, danger }: { icon: any; label: string; onPress: () => void; danger?: boolean }) => (
    <TouchableOpacity
      style={[st.actionBtn, danger && st.actionBtnDanger]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <Icon size={12} color={danger ? 'rgba(162,36,36,0.7)' : colors.fog} />
      <Text style={[st.actionBtnText, danger && st.actionBtnTextDanger]}>{label}</Text>
    </TouchableOpacity>
  );

  // ── Breathing ambient glow ──
  const glowOpacity = useSharedValue(0.04);
  useEffect(() => {
    glowOpacity.value = withRepeat(
      withTiming(0.08, { duration: 3000, easing: Easing.inOut(Easing.ease) }),
      -1, true
    );
  }, []);
  const glowStyle = useAnimatedStyle(() => ({ opacity: glowOpacity.value }));

  return (
    <View style={st.container}>
      {/* Ambient background atmosphere */}
      <Animated.View style={[st.ambientGlow, glowStyle]}>
        <LinearGradient
          colors={['rgba(139,105,20,0.15)', 'transparent', 'transparent']}
          locations={[0, 0.4, 1]}
          style={StyleSheet.absoluteFillObject}
        />
      </Animated.View>
      {/* ── Nav Bar ── */}
      <View style={st.navBar}>
        <TouchableOpacity onPress={() => router.back()} style={st.navBackBtn} activeOpacity={0.7}>
          <ChevronLeft size={22} color={colors.bone} />
        </TouchableOpacity>
        <TouchableOpacity onPress={handleSave} disabled={saving} activeOpacity={0.7}>
          {saving ? <ActivityIndicator size="small" color={colors.sepia} /> : (
            <Text style={st.navSaveText}>SAVE</Text>
          )}
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={st.scrollContent} showsVerticalScrollIndicator={false}>

        {/* ══════════════════════════════════════════
            HERO HEADER — matches .settings-hero
           ══════════════════════════════════════════ */}
        <AnimatedView entering={FadeInDown.duration(600)} style={st.hero}>
          {/* Top ornamental double rule */}
          <View style={st.heroRuleTop} />

          <View style={st.heroEyebrowRow}>
            <Sparkles size={7} color={colors.sepia} strokeWidth={2} />
            <Text style={st.heroEyebrow}>THE DOSSIER BUREAU</Text>
            <Sparkles size={7} color={colors.sepia} strokeWidth={2} />
          </View>

          <Text style={st.heroTitle}>Settings</Text>

          {/* EST badge */}
          <Text style={st.heroEst}>EST. 1924</Text>

          <Text style={st.heroDesc}>Configure your presence within The Society.</Text>

          {/* Bottom ornamental double rule */}
          <View style={st.heroRuleBottom} />
        </AnimatedView>

        {/* ══════════════════════════════════════════
            EDIT PROFILE — matches web "Edit Profile" link + inline
           ══════════════════════════════════════════ */}
        <AnimatedView entering={FadeInDown.duration(500).delay(50)}>
          <SectionCard>
            <SectionHead icon={User} label="EDIT PROFILE" />

            <View style={st.fieldWrap}>
              <Text style={st.fieldLabel}>USERNAME</Text>
              <TextInput style={st.fieldInput} value={username} onChangeText={setUsername}
                autoCapitalize="none" autoCorrect={false} placeholderTextColor={colors.ash} />
            </View>

            <View style={st.fieldWrap}>
              <Text style={st.fieldLabel}>DISPLAY NAME</Text>
              <TextInput style={st.fieldInput} value={displayName} onChangeText={setDisplayName}
                placeholderTextColor={colors.ash} />
            </View>

            <View style={st.fieldWrap}>
              <Text style={st.fieldLabel}>BIO</Text>
              <TextInput style={st.bioInput}
                value={bio} onChangeText={setBio} multiline maxLength={160}
                placeholderTextColor={colors.ash} placeholder="Write a brief transmission..." />
              <Text style={st.charCount}>{bio.length}/160</Text>
            </View>
          </SectionCard>
        </AnimatedView>

        <OrnamentalRule />

        {/* ══════════════════════════════════════════
            PATRONAGE & BILLING — matches web exactly
           ══════════════════════════════════════════ */}
        <AnimatedView entering={FadeInDown.duration(500).delay(100)}>
          <SectionCard>
            <SectionHead icon={Crown} label="PATRONAGE & BILLING" />

            {/* Current Tier */}
            <View style={st.fieldWrap}>
              <Text style={st.fieldLabel}>YOUR RANK</Text>
              <View style={st.rankRow}>
                <Text style={[
                  st.rankDisplay,
                  userRole === 'auteur' && st.rankAuteur,
                  userRole === 'archivist' && st.rankArchivist,
                  userRole !== 'auteur' && userRole !== 'archivist' && st.rankCinephile,
                ]}>
                  {userRole === 'auteur'
                    ? 'Auteur'
                    : userRole === 'archivist'
                      ? 'Archivist'
                      : 'Cinephile'}
                </Text>
                {userRole === 'auteur' && <Star size={12} color='#7d1f1f' strokeWidth={1.5} fill='#7d1f1f' />}
                {userRole === 'archivist' && <Sparkles size={12} color={colors.sepia} strokeWidth={1.5} />}
                {(userRole === 'auteur' || userRole === 'archivist') && (
                  <View style={st.activeBadge}><Text style={st.activeBadgeText}>ACTIVE</Text></View>
                )}
              </View>
            </View>

            {/* Divider + Upgrade/Manage */}
            <View style={st.dividerSpaced} />

            {(!userRole || userRole === 'cinephile' || userRole === 'free') ? (
              <View>
                <Text style={st.fieldBody}>Unlock The Editorial Desk, The Physical Archive, The Lounge, and more by upgrading your patronage.</Text>
                <TouchableOpacity style={st.primaryBtn} onPress={() => router.push('/membership')} activeOpacity={0.7}>
                  <Text style={st.primaryBtnText}>UPGRADE YOUR RANK</Text>
                </TouchableOpacity>
              </View>
            ) : userRole === 'archivist' ? (
              <View>
                <Text style={st.fieldBody}>You{'\u2019'}re an Archivist. Upgrade to Auteur for radar breakdowns, curatorial poster control, and the gold Dispatch badge.</Text>
                <TouchableOpacity style={st.primaryBtn} onPress={() => router.push('/membership')} activeOpacity={0.7}>
                  <Text style={st.primaryBtnText}>UPGRADE TO AUTEUR</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <Text style={st.fieldBody}>You hold the highest rank in The Society. All features are unlocked.</Text>
            )}

            <Text style={st.microNote}>PAYMENTS PROCESSED SECURELY VIA PAYTABS {'\u00B7'} MANAGE BILLING AT PATRONAGE</Text>
          </SectionCard>
        </AnimatedView>

        <OrnamentalRule />

        {/* ══════════════════════════════════════════
            ACCOUNT — matches web: username, email, password change
           ══════════════════════════════════════════ */}
        <AnimatedView entering={FadeInDown.duration(500).delay(150)}>
          <SectionCard>
            <SectionHead icon={Lock} label="ACCOUNT" />

            <View style={st.fieldWrap}>
              <Text style={st.fieldLabel}>USERNAME</Text>
              <View style={st.readonlyField}><Text style={st.readonlyText}>@{user.username}</Text></View>
            </View>

            <View style={st.fieldWrap}>
              <Text style={st.fieldLabel}>EMAIL</Text>
              <View style={st.readonlyField}><Text style={st.readonlyText}>{user.email}</Text></View>
            </View>

            {/* Password Change Toggle */}
            <TouchableOpacity
              style={st.actionBtnSpaced}
              onPress={() => setShowPasswordChange(!showPasswordChange)}
              activeOpacity={0.7}
            >
              <Lock size={12} color={colors.fog} />
              <Text style={st.actionBtnTextFlex}>CHANGE PASSWORD</Text>
              {showPasswordChange ? <ChevronUp size={12} color={colors.fog} /> : <ChevronDown size={12} color={colors.fog} />}
            </TouchableOpacity>

            {showPasswordChange && (
              <View style={st.passwordPanel}>
                <View style={st.fieldWrap}>
                  <Text style={st.fieldLabel}>NEW PASSWORD</Text>
                  <TextInput style={st.fieldInput} value={newPassword} onChangeText={setNewPassword}
                    secureTextEntry placeholder="Min. 8 characters" placeholderTextColor={colors.ash} />
                </View>
                <View style={st.fieldWrap}>
                  <Text style={st.fieldLabel}>CONFIRM PASSWORD</Text>
                  <TextInput style={st.fieldInput} value={confirmPassword} onChangeText={setConfirmPassword}
                    secureTextEntry placeholder="Repeat password" placeholderTextColor={colors.ash} />
                </View>
                <TouchableOpacity
                  style={[st.saveFieldBtn, (!newPassword || !confirmPassword) && st.disabledBtn]}
                  onPress={handlePasswordChange}
                  disabled={changingPassword || !newPassword || !confirmPassword}
                  activeOpacity={0.7}
                >
                  <Text style={st.saveFieldBtnText}>{changingPassword ? 'UPDATING...' : 'UPDATE PASSWORD'}</Text>
                </TouchableOpacity>
              </View>
            )}
          </SectionCard>
        </AnimatedView>

        <OrnamentalRule />

        {/* ══════════════════════════════════════════
            PRIVACY — matches web: 3 radio groups
           ══════════════════════════════════════════ */}
        <AnimatedView entering={FadeInDown.duration(500).delay(200)}>
          <SectionCard>
            <SectionHead icon={Eye} label="PRIVACY" />

            {/* Social Visibility */}
            <View style={st.privacyGroup}>
              <Text style={st.privacyGroupLabel}>SOCIAL VISIBILITY</Text>
              {[
                { value: 'public', label: 'Public \u2014 Visible to everyone' },
                { value: 'followers', label: 'Followers Only \u2014 Only your followers can see' },
                { value: 'private', label: 'Private \u2014 Only you can see your activity' },
              ].map(opt => (
                <RadioOption key={opt.value} selected={socialVisibility === opt.value}
                  label={opt.label} onPress={() => setSocialVisibility(opt.value)} />
              ))}
            </View>

            {/* Who Can Certify */}
            <View style={st.privacyGroup}>
              <Text style={st.privacyGroupLabel}>WHO CAN CERTIFY</Text>
              {[
                { value: 'everyone', label: 'Everyone' },
                { value: 'followers', label: 'Followers Only' },
                { value: 'nobody', label: 'Nobody' },
              ].map(opt => (
                <RadioOption key={opt.value} selected={privacyEndorsements === opt.value}
                  label={opt.label} onPress={() => setPrivacyEndorsements(opt.value)} />
              ))}
            </View>

            {/* Who Can Annotate */}
            <View style={st.privacyGroup}>
              <Text style={st.privacyGroupLabel}>WHO CAN ANNOTATE</Text>
              {[
                { value: 'everyone', label: 'Everyone' },
                { value: 'followers', label: 'Followers Only' },
                { value: 'nobody', label: 'Nobody' },
              ].map(opt => (
                <RadioOption key={opt.value} selected={privacyAnnotations === opt.value}
                  label={opt.label} onPress={() => setPrivacyAnnotations(opt.value)} />
              ))}
            </View>
          </SectionCard>
        </AnimatedView>

        <OrnamentalRule />

        {/* ══════════════════════════════════════════
            NOTIFICATIONS — matches web: 4 toggles + push section
           ══════════════════════════════════════════ */}
        <AnimatedView entering={FadeInDown.duration(500).delay(250)}>
          <SectionCard>
            <SectionHead icon={Bell} label="NOTIFICATIONS" />

            {[
              { label: 'New Followers', desc: 'When someone follows you', value: notifFollows, setter: setNotifFollows },
              { label: 'Certifications', desc: 'When someone certifies your log', value: notifEndorsements, setter: setNotifEndorsements },
              { label: 'Annotations', desc: 'When someone comments on your log', value: notifComments, setter: setNotifComments },
              { label: 'System Alerts', desc: 'Society announcements and updates', value: notifSystem, setter: setNotifSystem },
            ].map((item, idx, arr) => (
              <View key={item.label} style={[st.notifRow, idx === arr.length - 1 && st.notifRowLast]}>
                <View style={st.notifTextWrap}>
                  <Text style={st.notifLabel}>{item.label}</Text>
                  <Text style={st.notifDesc}>{item.desc}</Text>
                </View>
                <Toggle active={item.value} onToggle={() => item.setter(!item.value)} />
              </View>
            ))}

            {/* Mobile Integration — matches web's push section */}
            <View style={st.pushSection}>
              <View style={st.pushTitleRow}>
                <Smartphone size={10} color={colors.sepia} />
                <Text style={st.pushTitle}>MOBILE INTEGRATION</Text>
              </View>
              <Text style={st.pushDesc}>
                Receive immediate cinematic alerts directly to your device when the society interacts with your archive.
              </Text>
            </View>
          </SectionCard>
        </AnimatedView>

        {/* ══════════════════════════════════════════
            IMPORT & EXPORT — matches web section 4
           ══════════════════════════════════════════ */}
        <AnimatedView entering={FadeInDown.duration(500).delay(300)}>
          <SectionCard>
            <SectionHead icon={Download} label="IMPORT & EXPORT" />
            <DataVault />
          </SectionCard>
        </AnimatedView>

        <OrnamentalRule />

        {/* ══════════════════════════════════════════
            LEGAL — matches web section 5
           ══════════════════════════════════════════ */}
        <AnimatedView entering={FadeInDown.duration(500).delay(350)}>
          <SectionCard>
            <SectionHead icon={FileText} label="LEGAL" />
            <View style={st.legalActions}>
              <ActionBtn icon={Shield} label="PRIVACY POLICY"
                onPress={() => Linking.openURL('https://www.thereelhousesociety.com/privacy')} />
              <ActionBtn icon={FileText} label="TERMS OF SERVICE"
                onPress={() => Linking.openURL('https://www.thereelhousesociety.com/terms')} />
            </View>
          </SectionCard>
        </AnimatedView>

        {/* ══════════════════════════════════════════
            ACCOUNT ACTIONS — matches web section 6 (danger zone)
           ══════════════════════════════════════════ */}
        <AnimatedView entering={FadeInDown.duration(500).delay(400)}>
          <SectionCard danger>
            <SectionHead icon={Shield} label="ACCOUNT ACTIONS" danger />
            <View style={st.legalActions}>
              <ActionBtn icon={LogOut} label="SIGN OUT" onPress={handleSignOut} />
              <View style={st.divider} />
              <ActionBtn icon={Trash2} label="DELETE ACCOUNT" onPress={handleDeleteAccount} danger />
            </View>
          </SectionCard>
        </AnimatedView>

        {/* ── Heritage Footer ── */}
        <AnimatedView entering={FadeInDown.duration(500).delay(450)} style={st.heritageFooter}>
          <OrnamentalRule />

          {/* Save button */}
          <TouchableOpacity
            style={[st.globalSaveBtn, saving && st.disabledBtn]}
            onPress={handleSave} disabled={saving} activeOpacity={0.7}
          >
            <LinearGradient
              colors={['rgba(139,105,20,0.2)', 'rgba(139,105,20,0.1)']}
              start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
              style={StyleSheet.absoluteFillObject}
            />
            <View style={st.saveBtnContent}>
              {!saving && <Sparkles size={10} color={colors.sepia} strokeWidth={2} />}
              <Text style={st.globalSaveBtnText}>
                {saving ? 'ARCHIVING SETTINGS\u2026' : 'SAVE SETTINGS'}
              </Text>
              {!saving && <Sparkles size={10} color={colors.sepia} strokeWidth={2} />}
            </View>
          </TouchableOpacity>

          {/* Legal links */}
          <View style={st.legalFooter}>
            <TouchableOpacity onPress={() => Linking.openURL('https://www.thereelhousesociety.com/privacy')}>
              <Text style={st.legalFooterLink}>PRIVACY POLICY</Text>
            </TouchableOpacity>
            <View style={st.footerDot} />
            <TouchableOpacity onPress={() => Linking.openURL('https://www.thereelhousesociety.com/terms')}>
              <Text style={st.legalFooterLink}>TERMS OF SERVICE</Text>
            </TouchableOpacity>
          </View>

          {/* Member since */}
          <Text style={st.memberSince}>
            MEMBER SINCE {user.created_at ? new Date(user.created_at).toLocaleDateString('en-US', { month: 'long', year: 'numeric' }).toUpperCase() : 'THE BEGINNING'}
          </Text>

          {/* End mark */}
          <View style={st.endMarkRow}>
            <View style={st.endMarkLine} />
            <Sparkles size={8} color={colors.sepia} strokeWidth={1.5} />
            <View style={st.endMarkLine} />
          </View>
          <Text style={st.heritageMark}>EST. 1924 · THE REELHOUSE SOCIETY</Text>
          <Text style={st.heritageCopyright}>© 1924–2026 The ReelHouse Society. All dossiers are classified.</Text>
        </AnimatedView>

      </ScrollView>
    </View>
  );
}

// ═══════════════════════════════════════════════════════
//  STYLES — pixel-matched to web settings.css
// ═══════════════════════════════════════════════════════
const st = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.ink },
  scrollContent: { paddingBottom: 100 },
  ambientGlow: {
    position: 'absolute', top: 0, left: 0, right: 0, height: 350, zIndex: 0,
  },

  // ── Ornamental Rule ──
  ornRule: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    marginVertical: 8, marginHorizontal: 24, opacity: 0.4,
  },
  ornLine: { flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: colors.sepia },
  ornDiamond: {
    width: 5, height: 5, backgroundColor: colors.sepia,
    transform: [{ rotate: '45deg' }],
  },

  // ── Nav ──
  navBar: {
    paddingTop: Platform.OS === 'ios' ? 56 : 36,
    paddingHorizontal: 16, paddingBottom: 12,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.ash,
    backgroundColor: colors.ink, zIndex: 10,
  },
  navBackBtn: { width: 40, height: 40, justifyContent: 'center' },
  navSaveText: { fontFamily: fonts.uiBold, fontSize: 10, letterSpacing: 2, color: colors.sepia },

  // ── Hero — matches .settings-hero ──
  hero: {
    alignItems: 'center', paddingHorizontal: 24,
    marginTop: 20, marginBottom: 12,
    paddingBottom: 20,
  },
  heroRuleTop: {
    width: '80%', height: 6, marginBottom: 16,
    borderTopWidth: 3, borderTopColor: colors.sepia,
    borderBottomWidth: 1, borderBottomColor: 'rgba(139,105,20,0.25)',
    opacity: 0.5,
  },
  heroEyebrowRow: {
    flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8,
  },
  heroEyebrow: {
    fontFamily: fonts.ui, fontSize: 8, letterSpacing: 5,
    color: colors.sepia, opacity: 0.7,
  },
  heroTitle: {
    fontFamily: fonts.display, fontSize: 32, color: colors.parchment,
    lineHeight: 36, marginBottom: 6,
    ...effects.textGlowSepia,
    textShadowRadius: 25,
  },
  heroEst: {
    fontFamily: fonts.ui, fontSize: 7, letterSpacing: 4,
    color: colors.sepia, opacity: 0.4, marginBottom: 10,
  },
  heroDesc: {
    fontFamily: fonts.body, fontSize: 13, color: colors.bone,
    opacity: 0.5, fontStyle: 'italic', textAlign: 'center', lineHeight: 20,
    letterSpacing: 0.5, marginBottom: 16,
  },
  heroRuleBottom: {
    width: '80%', height: 6,
    borderTopWidth: 1, borderTopColor: 'rgba(139,105,20,0.25)',
    borderBottomWidth: 3, borderBottomColor: colors.sepia,
    opacity: 0.5,
  },

  // ── Section Card — matches .settings-section ──
  sectionCard: {
    marginHorizontal: 16, marginBottom: 16,
    padding: 20,
    backgroundColor: 'rgba(18,14,9,0.85)',
    borderWidth: 1, borderColor: 'rgba(139,105,20,0.12)',
    borderRadius: 4,
    overflow: 'hidden',
  },
  sectionCardDanger: { borderColor: 'rgba(162,36,36,0.15)' },
  sectionTopLine: {
    position: 'absolute', top: 0, left: 0, right: 0, height: 1,
  },

  // ── Section Header — matches .settings-section-header ──
  sectionHeaderWrap: {
    marginBottom: 18, paddingBottom: 10,
    borderBottomWidth: 1, borderBottomColor: 'rgba(139,105,20,0.08)',
  },
  sectionHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  sectionHeaderIcon: { opacity: 0.7 },
  sectionHeaderText: {
    fontFamily: fonts.ui, fontSize: 9, letterSpacing: 2.5, color: colors.sepia,
  },
  sectionHeaderTextDanger: { color: 'rgba(162,36,36,0.7)' },

  // ── Field — matches .settings-field + .settings-label + .settings-input ──
  fieldWrap: { marginBottom: 16 },
  fieldLabel: {
    fontFamily: fonts.ui, fontSize: 8, letterSpacing: 2,
    color: colors.sepia, marginBottom: 6,
  },
  fieldInput: {
    width: '100%',
    paddingHorizontal: 14, paddingVertical: 11,
    backgroundColor: 'rgba(10,7,3,0.6)',
    borderWidth: 1, borderColor: 'rgba(139,105,20,0.1)',
    borderRadius: 3,
    color: colors.parchment, fontFamily: fonts.body, fontSize: 14,
  },
  bioInput: {
    width: '100%',
    paddingHorizontal: 14, paddingVertical: 11,
    backgroundColor: 'rgba(10,7,3,0.6)',
    borderWidth: 1, borderColor: 'rgba(139,105,20,0.1)',
    borderRadius: 3,
    color: colors.parchment, fontFamily: fonts.body, fontSize: 14,
    height: 90, textAlignVertical: 'top', lineHeight: 20,
  },
  charCount: {
    fontFamily: fonts.ui, fontSize: 8, letterSpacing: 1,
    color: colors.ash, textAlign: 'right', marginTop: 4,
  },
  fieldBody: {
    fontFamily: fonts.body, fontSize: 13, color: colors.bone,
    lineHeight: 20, marginBottom: 12,
  },

  // ── Readonly — matches .settings-input--readonly ──
  readonlyField: {
    paddingHorizontal: 14, paddingVertical: 11,
    backgroundColor: 'rgba(10,7,3,0.6)',
    borderWidth: 1, borderColor: 'rgba(139,105,20,0.1)',
    borderRadius: 3, opacity: 0.45,
  },
  readonlyText: { fontFamily: fonts.body, fontSize: 14, color: colors.parchment },

  // ── Rank Display ──
  rankRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  rankDisplay: { fontFamily: fonts.display, fontSize: 16, textTransform: 'uppercase' },
  rankAuteur: { color: '#7d1f1f' },
  rankArchivist: { color: colors.sepia },
  rankCinephile: { color: colors.fog },
  activeBadge: {
    backgroundColor: 'rgba(196,150,26,0.08)',
    borderWidth: 1, borderColor: 'rgba(196,150,26,0.3)',
    paddingHorizontal: 8, paddingVertical: 2, borderRadius: 2,
  },
  activeBadgeText: { fontFamily: fonts.ui, fontSize: 7, letterSpacing: 1.5, color: colors.sepia },

  // ── Primary Button ──
  primaryBtn: {
    backgroundColor: colors.sepia, borderRadius: 3,
    paddingVertical: 12, alignItems: 'center',
  },
  primaryBtnText: { fontFamily: fonts.ui, fontSize: 11, letterSpacing: 2, color: colors.ink },

  // ── Action Button — matches .settings-action-btn ──
  actionBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingVertical: 10, paddingHorizontal: 14,
    borderWidth: 1, borderColor: 'rgba(139,105,20,0.08)',
    borderRadius: 3,
  },
  actionBtnDanger: { borderColor: 'rgba(162,36,36,0.15)' },
  actionBtnSpaced: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingVertical: 10, paddingHorizontal: 14,
    borderWidth: 1, borderColor: 'rgba(139,105,20,0.08)',
    borderRadius: 3, marginTop: 4,
  },
  actionBtnText: {
    fontFamily: fonts.ui, fontSize: 10, letterSpacing: 1.2, color: colors.fog,
  },
  actionBtnTextDanger: { color: 'rgba(162,36,36,0.7)' },
  actionBtnTextFlex: {
    fontFamily: fonts.ui, fontSize: 10, letterSpacing: 1.2, color: colors.fog, flex: 1,
  },
  disabledBtn: { opacity: 0.5 },

  // ── Password Panel — matches .settings-password-panel ──
  passwordPanel: {
    marginTop: 12, padding: 16,
    backgroundColor: 'rgba(10,7,3,0.5)',
    borderWidth: 1, borderColor: 'rgba(139,105,20,0.06)',
    borderRadius: 3,
  },
  saveFieldBtn: {
    backgroundColor: 'rgba(139,105,20,0.2)',
    borderWidth: 1, borderColor: 'rgba(139,105,20,0.3)',
    borderRadius: 3, paddingVertical: 12, alignItems: 'center', marginTop: 4,
  },
  saveFieldBtnText: { fontFamily: fonts.ui, fontSize: 10, letterSpacing: 2, color: colors.sepia },

  // ── Privacy — matches .settings-privacy-group + .settings-radio-option ──
  privacyGroup: { marginBottom: 18 },
  privacyGroupLabel: {
    fontFamily: fonts.ui, fontSize: 8, letterSpacing: 2,
    color: colors.sepia, marginBottom: 10,
  },
  radioOption: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingVertical: 8, paddingHorizontal: 8,
    marginBottom: 2, borderRadius: 3,
  },
  radioOptionActive: { backgroundColor: 'rgba(139,105,20,0.03)' },
  radioDot: {
    width: 14, height: 14, borderRadius: 7,
    borderWidth: 1.5, borderColor: colors.ash,
  },
  radioDotActive: { borderColor: colors.sepia, backgroundColor: colors.sepia },
  radioLabel: { fontFamily: fonts.body, fontSize: 13, color: colors.fog },
  radioLabelActive: { color: colors.parchment },

  // ── Notifications — matches .settings-notif-row ──
  notifRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: 'rgba(139,105,20,0.06)',
  },
  notifRowLast: { borderBottomWidth: 0 },
  notifTextWrap: { flex: 1, paddingRight: 12 },
  notifLabel: { fontFamily: fonts.body, fontSize: 14, color: colors.parchment },
  notifDesc: {
    fontFamily: fonts.ui, fontSize: 8, letterSpacing: 1,
    color: colors.fog, marginTop: 3,
  },

  // ── Push Section — matches .settings-push-section ──
  pushSection: {
    marginTop: 10, paddingTop: 14,
    borderTopWidth: 1, borderTopColor: 'rgba(139,105,20,0.06)',
  },
  pushTitleRow: {
    flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 10,
  },
  pushTitle: {
    fontFamily: fonts.ui, fontSize: 8, letterSpacing: 1.5, color: colors.sepia,
  },
  pushDesc: {
    fontFamily: fonts.ui, fontSize: 8, letterSpacing: 0.5,
    color: colors.ash, lineHeight: 13,
  },

  // ── Divider — matches .settings-divider ──
  divider: {
    height: 1, marginVertical: 10,
    backgroundColor: 'rgba(139,105,20,0.15)',
  },
  dividerSpaced: {
    height: 1, marginTop: 14, marginBottom: 10,
    backgroundColor: 'rgba(139,105,20,0.15)',
  },

  // ── Micro Note ──
  microNote: {
    fontFamily: fonts.ui, fontSize: 7, letterSpacing: 1,
    color: colors.fog, marginTop: 10, opacity: 0.5,
  },

  // ── Legal Actions ──
  legalActions: { gap: 8 },

  // ── Heritage Footer ──
  heritageFooter: {
    paddingHorizontal: 16, paddingTop: 8, paddingBottom: 40,
  },
  globalSaveBtn: {
    borderWidth: 1, borderColor: 'rgba(139,105,20,0.3)',
    borderRadius: 3, paddingVertical: 16,
    alignItems: 'center', overflow: 'hidden',
    ...effects.glowSepia,
    shadowRadius: 15, shadowOpacity: 0.15,
  },
  globalSaveBtnText: {
    fontFamily: fonts.uiBold, fontSize: 11, letterSpacing: 2.5, color: colors.sepia,
  },
  saveBtnContent: {
    flexDirection: 'row', alignItems: 'center', gap: 8, justifyContent: 'center',
  },
  legalFooter: {
    flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 16,
    marginTop: 24, paddingTop: 20,
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: 'rgba(139,105,20,0.12)',
  },
  footerDot: {
    width: 3, height: 3, borderRadius: 1.5,
    backgroundColor: colors.sepia, opacity: 0.3,
  },
  legalFooterLink: {
    fontFamily: fonts.ui, fontSize: 8, letterSpacing: 2,
    color: colors.fog, opacity: 0.5,
  },
  memberSince: {
    fontFamily: fonts.ui, fontSize: 7, letterSpacing: 2,
    color: colors.sepia, textAlign: 'center',
    marginTop: 20, opacity: 0.35,
  },
  endMarkRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    justifyContent: 'center', marginTop: 24,
  },
  endMarkLine: {
    width: 36, height: StyleSheet.hairlineWidth,
    backgroundColor: colors.sepia, opacity: 0.3,
  },
  heritageMark: {
    fontFamily: fonts.ui, fontSize: 7, letterSpacing: 3,
    color: colors.sepia, textAlign: 'center', opacity: 0.3,
    marginTop: 12,
  },
  heritageCopyright: {
    fontFamily: fonts.body, fontSize: 9, color: colors.bone,
    opacity: 0.2, textAlign: 'center', marginTop: 6,
    fontStyle: 'italic',
  },
});
