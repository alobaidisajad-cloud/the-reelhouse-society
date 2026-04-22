import { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  Alert, ActivityIndicator, Linking, Platform,
} from 'react-native';
import Animated, { FadeInDown, useSharedValue, useAnimatedStyle, withRepeat, withTiming, Easing } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { ChevronLeft, LogOut, Trash2, Shield, FileText, Download, Sparkles } from 'lucide-react-native';

import { useAuthStore } from '@/src/stores/auth';
import reelToast from '@/src/utils/reelToast';
import { supabase } from '@/src/lib/supabase';
import { colors, fonts, effects } from '@/src/theme/theme';
import DataVault from '@/src/components/settings/DataVault';

const AnimatedView = Animated.createAnimatedComponent(View);

import { PatronageSection, AccountSection, PrivacySection, NotificationsSection, SectionCard, SectionHead, ActionBtn } from '@/src/components/settings/SettingsSections';

export default function SettingsScreen() {
  const router = useRouter();
  const { user, updateUser, logout } = useAuthStore();

  // ── Privacy ──
  const [socialVisibility, setSocialVisibility] = useState<string>('public');
  const [privacyEndorsements, setPrivacyEndorsements] = useState<string>('everyone');
  const [privacyAnnotations, setPrivacyAnnotations] = useState<string>('everyone');

  // ── Notifications ──
  const [notifFollows, setNotifFollows] = useState(true);
  const [notifEndorsements, setNotifEndorsements] = useState(true);
  const [notifComments, setNotifComments] = useState(true);
  const [notifSystem, setNotifSystem] = useState(true);

  // ── Password ──
  const [showPasswordChange, setShowPasswordChange] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [changingPassword, setChangingPassword] = useState(false);

  // ── General ──
  const [saving, setSaving] = useState(false);

  const userRole = (user?.role as string) ?? 'cinephile';

  useEffect(() => {
    if (!user) return;
    const p: Record<string, unknown> = (user.preferences ?? {}) as Record<string, unknown>;
    setSocialVisibility(p.social_visibility ?? (user.is_social_private ? 'private' : 'public'));
    setPrivacyEndorsements(p.privacy_endorsements ?? 'everyone');
    setPrivacyAnnotations(p.privacy_annotations ?? 'everyone');
    setNotifFollows(p.notif_follows !== undefined ? !!p.notif_follows : true);
    setNotifEndorsements(p.notif_endorsements !== undefined ? !!p.notif_endorsements : true);
    setNotifComments(p.notif_comments !== undefined ? !!p.notif_comments : true);
    setNotifSystem(p.notif_system !== undefined ? !!p.notif_system : true);
  }, [user?.id, user?.preferences]);

  const handleSave = async () => {
    if (!user) return;
    setSaving(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      await updateUser({
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
      reelToast.success('Your dossier has been amended.');
    } catch (err: unknown) {
      reelToast.error(err instanceof Error ? err.message : 'Amendment failed — please try again.');
    } finally {
      setSaving(false);
    }
  };

  const handlePasswordChange = async () => {
    if (newPassword.length < 8) { reelToast('Cipher must be at least 8 characters.'); return; }
    if (newPassword !== confirmPassword) { reelToast('Ciphers do not match.'); return; }
    setChangingPassword(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;
      reelToast.success('Credentials re-encrypted.');
      setNewPassword('');
      setConfirmPassword('');
      setShowPasswordChange(false);
    } catch (e: unknown) {
      reelToast.error(e instanceof Error ? e.message : 'Re-encryption failed.');
    } finally {
      setChangingPassword(false);
    }
  };

  const handleSignOut = () => {
    Alert.alert('Depart the Society', 'Your membership will remain. You may return at any time.', [
      { text: 'CANCEL', style: 'cancel' },
      { text: 'SIGN OUT', style: 'destructive', onPress: async () => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
        await logout();
        router.replace('/');
      }},
    ]);
  };

  const handleDeleteAccount = () => {
    Alert.alert(
      'Expunge All Records',
      'This will permanently destroy your dossier, all logs, stacks, and critiques. This action is irreversible.',
      [
        { text: 'CANCEL', style: 'cancel' },
        { text: 'DELETE', style: 'destructive', onPress: () => {
          Alert.alert('Contact Support', 'Account deletion requires admin intervention. Contact support@reelhouse.app');
        }},
      ]
    );
  };

  const glowOpacity = useSharedValue(0.04);
  useEffect(() => {
    glowOpacity.value = withRepeat(withTiming(0.08, { duration: 3000, easing: Easing.inOut(Easing.ease) }), -1, true);
  }, []);
  const glowStyle = useAnimatedStyle(() => ({ opacity: glowOpacity.value }));

  if (!user) return null;

  return (
    <View style={st.container}>
      <Animated.View style={[st.ambientGlow, glowStyle]}>
        <LinearGradient colors={['rgba(139,105,20,0.15)', 'transparent', 'transparent']} locations={[0, 0.4, 1]} style={StyleSheet.absoluteFillObject} />
      </Animated.View>
      <View style={st.navBar}>
        <TouchableOpacity onPress={() => router.back()} style={st.navBackBtn} activeOpacity={0.7} hitSlop={{top: 15, bottom: 15, left: 15, right: 15}}>
          <ChevronLeft size={22} color={colors.bone} />
        </TouchableOpacity>
        <TouchableOpacity onPress={handleSave} disabled={saving} activeOpacity={0.7} hitSlop={{top: 15, bottom: 15, left: 15, right: 15}}>
          {saving ? <ActivityIndicator size="small" color={colors.sepia} /> : <Text style={st.navSaveText}>SAVE</Text>}
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={st.scrollContent} showsVerticalScrollIndicator={false}>
        <AnimatedView entering={FadeInDown.duration(600)} style={st.hero}>
          <View style={st.heroRuleTop} />
          <View style={st.heroEyebrowRow}>
            <Sparkles size={7} color={colors.sepia} strokeWidth={2} />
            <Text style={st.heroEyebrow}>THE DOSSIER BUREAU</Text>
            <Sparkles size={7} color={colors.sepia} strokeWidth={2} />
          </View>
          <Text style={st.heroTitle}>Settings</Text>
          <Text style={st.heroEst}>EST. 1924</Text>
          <Text style={st.heroDesc}>Configure your presence within The Society.</Text>
          <View style={st.heroRuleBottom} />
        </AnimatedView>

        <PatronageSection userRole={userRole} router={router} />
        <View style={st.ornRule}><View style={st.ornLine} /><View style={st.ornDiamond} /><View style={st.ornLine} /></View>

        <AccountSection
          user={user} showPasswordChange={showPasswordChange} setShowPasswordChange={setShowPasswordChange}
          newPassword={newPassword} setNewPassword={setNewPassword}
          confirmPassword={confirmPassword} setConfirmPassword={setConfirmPassword}
          changingPassword={changingPassword} handlePasswordChange={handlePasswordChange}
        />
        <View style={st.ornRule}><View style={st.ornLine} /><View style={st.ornDiamond} /><View style={st.ornLine} /></View>

        <PrivacySection
          socialVisibility={socialVisibility} setSocialVisibility={setSocialVisibility}
          privacyEndorsements={privacyEndorsements} setPrivacyEndorsements={setPrivacyEndorsements}
          privacyAnnotations={privacyAnnotations} setPrivacyAnnotations={setPrivacyAnnotations}
        />
        <View style={st.ornRule}><View style={st.ornLine} /><View style={st.ornDiamond} /><View style={st.ornLine} /></View>

        <NotificationsSection
          notifFollows={notifFollows} setNotifFollows={setNotifFollows}
          notifEndorsements={notifEndorsements} setNotifEndorsements={setNotifEndorsements}
          notifComments={notifComments} setNotifComments={setNotifComments}
          notifSystem={notifSystem} setNotifSystem={setNotifSystem}
        />

        <AnimatedView entering={FadeInDown.duration(500).delay(300)}>
          <SectionCard>
            <SectionHead icon={Download} label="IMPORT & EXPORT" />
            <DataVault />
          </SectionCard>
        </AnimatedView>
        <View style={st.ornRule}><View style={st.ornLine} /><View style={st.ornDiamond} /><View style={st.ornLine} /></View>

        <AnimatedView entering={FadeInDown.duration(500).delay(350)}>
          <SectionCard>
            <SectionHead icon={FileText} label="LEGAL" />
            <View style={st.legalActions}>
              <ActionBtn icon={Shield} label="PRIVACY POLICY" onPress={() => Linking.openURL('https://www.thereelhousesociety.com/privacy')} />
              <ActionBtn icon={FileText} label="TERMS OF SERVICE" onPress={() => Linking.openURL('https://www.thereelhousesociety.com/terms')} />
            </View>
          </SectionCard>
        </AnimatedView>

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

        <AnimatedView entering={FadeInDown.duration(500).delay(450)} style={st.heritageFooter}>
          <View style={st.ornRule}><View style={st.ornLine} /><View style={st.ornDiamond} /><View style={st.ornLine} /></View>
          <TouchableOpacity style={[st.globalSaveBtn, saving && st.disabledBtn]} onPress={handleSave} disabled={saving} activeOpacity={0.7}>
            <LinearGradient colors={['rgba(139,105,20,0.2)', 'rgba(139,105,20,0.1)']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFillObject} />
            <View style={st.saveBtnContent}>
              {!saving && <Sparkles size={10} color={colors.sepia} strokeWidth={2} />}
              <Text style={st.globalSaveBtnText}>{saving ? 'ARCHIVING SETTINGS\u2026' : 'SAVE SETTINGS'}</Text>
              {!saving && <Sparkles size={10} color={colors.sepia} strokeWidth={2} />}
            </View>
          </TouchableOpacity>
          <View style={st.legalFooter}>
            <TouchableOpacity onPress={() => Linking.openURL('https://www.thereelhousesociety.com/privacy')}><Text style={st.legalFooterLink}>PRIVACY POLICY</Text></TouchableOpacity>
            <View style={st.footerDot} />
            <TouchableOpacity onPress={() => Linking.openURL('https://www.thereelhousesociety.com/terms')}><Text style={st.legalFooterLink}>TERMS OF SERVICE</Text></TouchableOpacity>
          </View>
          <Text style={st.memberSince}>MEMBER SINCE {user.created_at ? new Date(user.created_at).toLocaleDateString('en-US', { month: 'long', year: 'numeric' }).toUpperCase() : 'THE BEGINNING'}</Text>
          <View style={st.endMarkRow}>
            <View style={st.endMarkLine} /><Sparkles size={8} color={colors.sepia} strokeWidth={1.5} /><View style={st.endMarkLine} />
          </View>
          <Text style={st.heritageMark}>EST. 1924 · THE REELHOUSE SOCIETY</Text>
          <Text style={st.heritageCopyright}>© 1924–2026 The ReelHouse Society. All dossiers are classified.</Text>
        </AnimatedView>
      </ScrollView>
    </View>
  );
}

const st = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.ink },
  ambientGlow: { position: 'absolute', top: 0, left: 0, right: 0, height: 350, zIndex: 0 },
  navBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: Platform.OS === 'ios' ? 60 : 40, paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: 'rgba(139,105,20,0.1)', zIndex: 10, backgroundColor: 'rgba(5,3,1,0.85)' },
  navBackBtn: { padding: 4 },
  navSaveText: { fontFamily: fonts.uiMedium, fontSize: 10, letterSpacing: 2, color: colors.sepia },
  scrollContent: { paddingBottom: 100 },
  hero: { alignItems: 'center', paddingVertical: 40, paddingHorizontal: 24 },
  heroRuleTop: { width: 100, height: 2, borderTopWidth: 1, borderBottomWidth: 1, borderColor: colors.sepia, marginBottom: 16, opacity: 0.5 },
  heroRuleBottom: { width: 100, height: 2, borderTopWidth: 1, borderBottomWidth: 1, borderColor: colors.sepia, marginTop: 24, opacity: 0.5 },
  heroEyebrowRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  heroEyebrow: { fontFamily: fonts.ui, fontSize: 9, letterSpacing: 4, color: colors.sepia },
  heroTitle: { fontFamily: fonts.display, fontSize: 32, color: colors.parchment, marginBottom: 4, ...effects.textShadowDeep },
  heroEst: { fontFamily: fonts.uiBold, fontSize: 8, letterSpacing: 3, color: colors.sepia, marginBottom: 16, opacity: 0.8 },
  heroDesc: { fontFamily: fonts.bodyItalic, fontSize: 13, color: colors.bone, textAlign: 'center', maxWidth: 260 },
  ornRule: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 24, paddingHorizontal: 40, opacity: 0.5 },
  ornLine: { flex: 1, height: 1, backgroundColor: colors.sepia },
  ornDiamond: { width: 6, height: 6, backgroundColor: colors.sepia, transform: [{ rotate: '45deg' }], marginHorizontal: 12 },
  legalActions: { flexDirection: 'column' },
  divider: { height: 1, backgroundColor: 'rgba(139,105,20,0.1)' },
  heritageFooter: { marginTop: 40, paddingHorizontal: 24, alignItems: 'center', paddingBottom: 40 },
  globalSaveBtn: { backgroundColor: 'transparent', borderWidth: 1, borderColor: colors.sepia, width: '100%', paddingVertical: 18, alignItems: 'center', borderRadius: 2, marginBottom: 32, ...effects.glowSepia },
  disabledBtn: { opacity: 0.5 },
  saveBtnContent: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  globalSaveBtnText: { fontFamily: fonts.uiMedium, fontSize: 11, letterSpacing: 3, color: colors.sepia, fontWeight: '700' },
  legalFooter: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 24 },
  legalFooterLink: { fontFamily: fonts.ui, fontSize: 9, letterSpacing: 1.5, color: colors.fog, textDecorationLine: 'underline', textDecorationColor: colors.fog },
  footerDot: { width: 3, height: 3, borderRadius: 1.5, backgroundColor: colors.fog },
  memberSince: { fontFamily: fonts.uiBold, fontSize: 9, letterSpacing: 2, color: colors.parchment, marginBottom: 32 },
  endMarkRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 16 },
  endMarkLine: { width: 30, height: 1, backgroundColor: colors.sepia, opacity: 0.3 },
  heritageMark: { fontFamily: fonts.ui, fontSize: 9, letterSpacing: 2, color: colors.sepia, marginBottom: 8 },
  heritageCopyright: { fontFamily: fonts.bodyItalic, fontSize: 10, color: colors.fog },
});
