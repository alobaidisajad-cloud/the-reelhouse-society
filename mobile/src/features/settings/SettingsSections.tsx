import React, { useRef } from 'react';
import { View, Text, StyleSheet, TextInput, Switch, KeyboardAvoidingView, Platform } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import TactileEngine from '@/src/utils/TactileEngine';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { Crown, Lock, Eye, Bell, Smartphone, ChevronDown, ChevronUp, Star, Sparkles } from 'lucide-react-native';
import { colors, fonts, effects } from '@/src/theme/theme';
import PressableScale from '@/src/components/PressableScale';
import reelToast from '@/src/utils/reelToast';

import { Controller, Control } from 'react-hook-form';
import type { SettingsFormData } from '@/src/schemas/settings';
import { useSettingsStore } from '@/src/stores/settings';
import { useAuthStore } from '@/src/stores/auth';
import { AuthService } from '@/src/services/AuthService';
import { supabase } from '@/src/lib/supabase';
import { isAuteurPlusTier, isArchivistPlusTier, getDisplayTier } from '@/src/utils/tier';

const AnimatedView = Animated.createAnimatedComponent(View);
const HITSLOP_10 = { top: 10, bottom: 10, left: 10, right: 10 } as const;

// ═══ REUSABLE COMPONENTS ═══
export const SectionCard = ({ children, danger }: { children: React.ReactNode; danger?: boolean }) => (
  <View style={[st.sectionCard, danger && st.sectionCardDanger]}>
    <LinearGradient
      colors={danger ? ['transparent', 'rgba(162,36,36,0.2)', 'transparent'] : ['transparent', 'rgba(139,105,20,0.2)', 'transparent']}
      start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
      style={st.sectionTopLine}
    />
    <LinearGradient
      colors={danger ? ['rgba(162,36,36,0.05)', 'transparent'] : ['rgba(139,105,20,0.03)', 'transparent']}
      style={StyleSheet.absoluteFillObject}
    />
    {children}
  </View>
);

export const SectionHead = ({ icon: Icon, label, danger }: { icon: import('lucide-react-native').LucideIcon; label: string; danger?: boolean }) => (
  <View style={st.sectionHeaderWrap}>
    <View style={st.sectionHeaderRow}>
      <Icon size={14} color={danger ? 'rgba(162,36,36,0.7)' : colors.sepia} style={st.sectionHeaderIcon} />
      <Text style={[st.sectionHeaderText, danger && st.sectionHeaderTextDanger]}>{label}</Text>
    </View>
  </View>
);

export const Toggle = ({ active, onToggle, disabled }: { active: boolean; onToggle: () => void; disabled?: boolean }) => (
  <Switch
    value={active}
    disabled={disabled}
    onValueChange={() => { TactileEngine.selection(); onToggle(); }}
    trackColor={{ false: 'rgba(139,105,20,0.12)', true: colors.sepia }}
    thumbColor={active ? colors.parchment : colors.fog}
  />
);

export const RadioOption = ({ selected, label, onPress, disabled }: { selected: boolean; label: string; onPress: () => void; disabled?: boolean }) => (
  <PressableScale
    style={[st.radioOption, selected && st.radioOptionActive, disabled && { opacity: 0.5 }]}
    onPress={disabled ? undefined : onPress}
    disabled={disabled}
    hitSlop={HITSLOP_10}
    haptic="selection"
    pressedScale={0.96}
    accessibilityLabel={label}
    accessibilityRole="radio"
    accessibilityState={{ selected }}
  >
    <View style={[st.radioDot, selected && st.radioDotActive]} />
    <Text style={[st.radioLabel, selected && st.radioLabelActive]}>{label}</Text>
  </PressableScale>
);

export const ActionBtn = ({ icon: Icon, label, onPress, danger }: { icon: import('lucide-react-native').LucideIcon; label: string; onPress: () => void; danger?: boolean }) => (
  <PressableScale
    style={[st.actionBtn, danger && st.actionBtnDanger]}
    onPress={onPress}
    hitSlop={HITSLOP_10}
    haptic={danger ? 'heavy' : 'light'}
    pressedScale={0.95}
    accessibilityLabel={label}
    accessibilityRole="button"
  >
    <Icon size={12} color={danger ? 'rgba(162,36,36,0.7)' : colors.fog} />
    <Text style={[st.actionBtnText, danger && st.actionBtnTextDanger]}>{label}</Text>
  </PressableScale>
);

// ═══ SECTIONS ═══

export function PatronageSection({ userRole, onUpgrade }: { userRole: string; onUpgrade: () => void }) {
  return (
    <AnimatedView entering={FadeInDown.duration(500).delay(100)}>
      <SectionCard>
        <SectionHead icon={Crown} label="PATRONAGE & BILLING" />
        <View style={st.fieldWrap}>
          <Text style={st.fieldLabel}>YOUR RANK</Text>
          <View style={st.rankRow}>
            <Text style={[
              st.rankDisplay,
              isAuteurPlusTier(userRole) && st.rankAuteur,
              isArchivistPlusTier(userRole) && !isAuteurPlusTier(userRole) && st.rankArchivist,
              !isArchivistPlusTier(userRole) && st.rankCinephile,
            ]}>
              {getDisplayTier(userRole).charAt(0) + getDisplayTier(userRole).slice(1).toLowerCase()}
            </Text>
            {isAuteurPlusTier(userRole) && <Star size={12} color='#7d1f1f' strokeWidth={1.5} fill='#7d1f1f' />}
            {isArchivistPlusTier(userRole) && !isAuteurPlusTier(userRole) && <Sparkles size={12} color={colors.sepia} strokeWidth={1.5} />}
            {isArchivistPlusTier(userRole) && (
              <View style={st.activeBadge}><Text style={st.activeBadgeText}>ACTIVE</Text></View>
            )}
          </View>
        </View>
        <View style={st.dividerSpaced} />
        {!isArchivistPlusTier(userRole) ? (
          <View>
            <Text style={st.fieldBody}>Unlock The Editorial Desk, The Physical Archive, The Lounge, and more by upgrading your patronage.</Text>
            <PressableScale style={st.primaryBtn} onPress={onUpgrade} haptic="medium" pressedScale={0.96} accessibilityLabel="Upgrade your rank">
              <Text style={st.primaryBtnText}>UPGRADE YOUR RANK</Text>
            </PressableScale>
          </View>
        ) : !isAuteurPlusTier(userRole) ? (
          <View>
            {/* eslint-disable-next-line react/no-unescaped-entities */}
            <Text style={st.fieldBody}>You're an Archivist. Upgrade to Auteur for radar breakdowns, curatorial poster control, and the gold Dispatch badge.</Text>
            <PressableScale style={st.primaryBtn} onPress={onUpgrade} haptic="medium" pressedScale={0.96} accessibilityLabel="Upgrade to auteur">
              <Text style={st.primaryBtnText}>UPGRADE TO AUTEUR</Text>
            </PressableScale>
          </View>
        ) : (
          <Text style={st.fieldBody}>You hold the highest rank in The Society. All features are unlocked.</Text>
        )}
        <Text style={st.microNote}>IN-APP PURCHASE · SECURE CHECKOUT · MANAGE IN APP STORE</Text>
      </SectionCard>
    </AnimatedView>
  );
}

interface AccountSectionProps {
  user: { username: string; email?: string };
  control: Control<SettingsFormData>;
  saving: boolean;
}

export function PasswordChangePanel() {
  const [showPasswordChange, setShowPasswordChange] = React.useState(false);
  const [currentPassword, setCurrentPassword] = React.useState('');
  const [newPassword, setNewPassword] = React.useState('');
  const [confirmPassword, setConfirmPassword] = React.useState('');
  const [changingPassword, setChangingPassword] = React.useState(false);
  const [isOAuth, setIsOAuth] = React.useState(false);
  const newPasswordRef = useRef<TextInput>(null);
  const confirmPasswordRef = useRef<TextInput>(null);
  const isMountedRef = useRef(true);

  React.useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (isMountedRef.current && data.user?.identities && data.user.identities.length > 0) {
        const hasEmail = data.user.identities.some(id => id.provider === 'email');
        setIsOAuth(!hasEmail);
      }
    }).catch(() => {});
    return () => { isMountedRef.current = false; };
  }, []);

  const handlePasswordChange = async () => {
    if (!currentPassword) { reelToast.error('Current cipher required.'); return; }
    if (newPassword.length < 8) { reelToast.error('Cipher must be at least 8 characters.'); return; }
    if (newPassword !== confirmPassword) { reelToast.error('Ciphers do not match.'); return; }
    setChangingPassword(true);
    try {
      const { data: userAuth } = await supabase.auth.getUser();
      if (!userAuth.user?.email) throw new Error('User email not found.');
      const { error: verifyError } = await supabase.auth.signInWithPassword({
        email: userAuth.user.email,
        password: currentPassword
      });
      if (verifyError) throw new Error('Incorrect current cipher.');

      await AuthService.updatePassword(newPassword);
      reelToast.success('Credentials re-encrypted.');
      if (isMountedRef.current) {
        setShowPasswordChange(false);
      }
    } catch (e: unknown) {
      reelToast.error(e instanceof Error ? e.message : 'Re-encryption failed.');
    } finally {
      if (isMountedRef.current) {
        setChangingPassword(false);
        setCurrentPassword('');
        setNewPassword('');
        setConfirmPassword('');
      }
    }
  };

  return (
    <>
      <PressableScale style={st.actionBtnSpaced} onPress={() => setShowPasswordChange(!showPasswordChange)} haptic="selection" pressedScale={0.97} accessibilityLabel="Change password" accessibilityRole="button">
        <Lock size={12} color={colors.fog} />
        <Text style={st.actionBtnTextFlex}>CHANGE PASSWORD</Text>
        {showPasswordChange ? <ChevronUp size={12} color={colors.fog} /> : <ChevronDown size={12} color={colors.fog} />}
      </PressableScale>
      {showPasswordChange && (
        <View style={st.passwordPanel}>
          {isOAuth ? (
            <View style={st.oauthBanner}>
              <Text style={st.fieldBody}>You authenticated using a secure social provider. Authentication settings are managed externally.</Text>
            </View>
          ) : (
            <>
              <View style={st.fieldWrap}>
                <Text style={st.fieldLabel}>CURRENT PASSWORD</Text>
                <TextInput style={st.fieldInput} value={currentPassword} onChangeText={setCurrentPassword} secureTextEntry textContentType="password" returnKeyType="next" blurOnSubmit={false} onSubmitEditing={() => newPasswordRef.current?.focus()} placeholder="Your current password" placeholderTextColor={colors.ash} keyboardAppearance="dark" accessibilityLabel="Current password" />
              </View>
              <View style={st.fieldWrap}>
                <Text style={st.fieldLabel}>NEW PASSWORD</Text>
                <TextInput ref={newPasswordRef} style={st.fieldInput} value={newPassword} onChangeText={setNewPassword} secureTextEntry textContentType="newPassword" autoComplete="new-password" returnKeyType="next" blurOnSubmit={false} onSubmitEditing={() => confirmPasswordRef.current?.focus()} placeholder="Min. 8 characters" placeholderTextColor={colors.ash} keyboardAppearance="dark" accessibilityLabel="New password" />
              </View>
              <View style={st.fieldWrap}>
                <Text style={st.fieldLabel}>CONFIRM PASSWORD</Text>
                <TextInput ref={confirmPasswordRef} style={st.fieldInput} value={confirmPassword} onChangeText={setConfirmPassword} secureTextEntry textContentType="newPassword" autoComplete="new-password" returnKeyType="done" onSubmitEditing={handlePasswordChange} placeholder="Repeat password" placeholderTextColor={colors.ash} keyboardAppearance="dark" accessibilityLabel="Confirm password" />
              </View>
              <PressableScale style={[st.saveFieldBtn, (!currentPassword || !newPassword || !confirmPassword) && st.disabledBtn]} onPress={handlePasswordChange} disabled={changingPassword || !currentPassword || !newPassword || !confirmPassword} haptic="medium" pressedScale={0.96} accessibilityLabel="Update password">
                <Text style={st.saveFieldBtnText}>{changingPassword ? 'UPDATING...' : 'UPDATE PASSWORD'}</Text>
              </PressableScale>
            </>
          )}
        </View>
      )}
    </>
  );
}

export function AccountSection(props: AccountSectionProps) {
  const { user, control, saving } = props;
  return (
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
        
        <View style={st.fieldWrap}>
          <Text style={st.fieldLabel}>BIOMETRIC SECURITY</Text>
          <Text style={[st.notifDesc, { marginBottom: 12 }]}>Require Face ID / Touch ID for destructive actions</Text>
          <Controller
            control={control}
            name="biometricLock"
            render={({ field }) => (
              <Toggle active={field.value} onToggle={() => field.onChange(!field.value)} disabled={saving} />
            )}
          />
        </View>

        <PasswordChangePanel />
      </SectionCard>
    </AnimatedView>
  );
}

export function PrivacySection({ control, saving }: { control: Control<SettingsFormData>; saving: boolean }) {
  return (
    <AnimatedView entering={FadeInDown.duration(500).delay(200)}>
      <SectionCard>
        <SectionHead icon={Eye} label="PRIVACY" />
        <View style={st.privacyGroup}>
          <Text style={st.privacyGroupLabel}>SOCIAL VISIBILITY</Text>
          <Controller
            control={control}
            name="socialVisibility"
            render={({ field }) => (
              <>
                {[
                  { value: 'public', label: 'Public — Visible to everyone' },
                  { value: 'followers', label: 'Followers Only — Only your followers can see' },
                  { value: 'private', label: 'Private — Only you can see your activity' },
                ].map(opt => <RadioOption key={opt.value} selected={field.value === opt.value} label={opt.label} onPress={() => field.onChange(opt.value)} disabled={saving} />)}
              </>
            )}
          />
        </View>
        <View style={st.privacyGroup}>
          <Text style={st.privacyGroupLabel}>WHO CAN CERTIFY</Text>
          <Controller
            control={control}
            name="privacyEndorsements"
            render={({ field }) => (
              <>
                {[
                  { value: 'everyone', label: 'Everyone' },
                  { value: 'followers', label: 'Followers Only' },
                  { value: 'nobody', label: 'Nobody' },
                ].map(opt => <RadioOption key={opt.value} selected={field.value === opt.value} label={opt.label} onPress={() => field.onChange(opt.value)} disabled={saving} />)}
              </>
            )}
          />
        </View>
        <View style={st.privacyGroup}>
          <Text style={st.privacyGroupLabel}>WHO CAN ANNOTATE</Text>
          <Controller
            control={control}
            name="privacyAnnotations"
            render={({ field }) => (
              <>
                {[
                  { value: 'everyone', label: 'Everyone' },
                  { value: 'followers', label: 'Followers Only' },
                  { value: 'nobody', label: 'Nobody' },
                ].map(opt => <RadioOption key={opt.value} selected={field.value === opt.value} label={opt.label} onPress={() => field.onChange(opt.value)} disabled={saving} />)}
              </>
            )}
          />
        </View>
      </SectionCard>
    </AnimatedView>
  );
}

export function NotificationsSection({ control, saving }: { control: Control<SettingsFormData>; saving: boolean }) {
  return (
    <AnimatedView entering={FadeInDown.duration(500).delay(250)}>
      <SectionCard>
        <SectionHead icon={Bell} label="NOTIFICATIONS" />
        {[
          { name: 'notifFollows' as const, label: 'New Followers', desc: 'When someone follows you' },
          { name: 'notifEndorsements' as const, label: 'Certifications', desc: 'When someone certifies your log' },
          { name: 'notifComments' as const, label: 'Annotations', desc: 'When someone comments on your log' },
          { name: 'notifSystem' as const, label: 'System Alerts', desc: 'Society announcements and updates' },
        ].map((item, idx, arr) => (
          <View key={item.label} style={[st.notifRow, idx === arr.length - 1 && st.notifRowLast]}>
            <View style={st.notifTextWrap}>
              <Text style={st.notifLabel}>{item.label}</Text>
              <Text style={st.notifDesc}>{item.desc}</Text>
            </View>
            <Controller
              control={control}
              name={item.name}
              render={({ field }) => (
                <Toggle active={field.value} onToggle={() => field.onChange(!field.value)} disabled={saving} />
              )}
            />
          </View>
        ))}
        <View style={st.pushSection}>
          <View style={st.pushTitleRow}>
            <Smartphone size={10} color={colors.sepia} />
            <Text style={st.pushTitle}>MOBILE INTEGRATION</Text>
          </View>
          <Text style={st.pushDesc}>Receive immediate cinematic alerts directly to your device when the society interacts with your archive.</Text>
        </View>
      </SectionCard>
    </AnimatedView>
  );
}

export function ExperienceSection() {
  const { tactileAudioEnabled, setTactileAudioEnabled } = useSettingsStore();

  const handleTactileToggle = async (val: boolean) => {
    setTactileAudioEnabled(val); // Instant MMKV local state
    
    // Attempt Supabase sync (fire and forget)
    const authStore = useAuthStore.getState();
    if (authStore.user) {
      authStore.setPreference('tactile_audio_enabled', val).catch(() => {});
    }
  };

  return (
    <AnimatedView entering={FadeInDown.duration(500).delay(275)}>
      <SectionCard>
        <SectionHead icon={Smartphone} label="EXPERIENCE" />
        <View style={[st.notifRow, st.notifRowLast]}>
          <View style={st.notifTextWrap}>
            <Text style={st.notifLabel}>Tactile Feedback</Text>
            <Text style={st.notifDesc}>Haptic vibrations on buttons, tabs, and actions</Text>
          </View>
          <Toggle active={tactileAudioEnabled} onToggle={() => handleTactileToggle(!tactileAudioEnabled)} />
        </View>
      </SectionCard>
    </AnimatedView>
  );
}

const st = StyleSheet.create({
  sectionCard: { backgroundColor: '#110D0A', borderWidth: 1, borderColor: '#30261A', borderRadius: 6, marginHorizontal: 16, marginBottom: 16, overflow: 'hidden' },
  sectionCardDanger: { borderColor: 'rgba(162,36,36,0.5)', backgroundColor: 'rgba(162,36,36,0.03)' },
  sectionTopLine: { position: 'absolute', top: 0, left: 0, right: 0, height: 1, zIndex: 10 },
  sectionHeaderWrap: { padding: 16, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: 'rgba(139,105,20,0.15)' },
  sectionHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  sectionHeaderIcon: { marginTop: -1 },
  sectionHeaderText: { fontFamily: fonts.uiMedium, fontSize: 10, color: colors.sepia, letterSpacing: 2.5 },
  sectionHeaderTextDanger: { color: colors.bloodReel },
  fieldWrap: { padding: 16, borderBottomWidth: 1, borderBottomColor: 'rgba(139,105,20,0.1)' },
  fieldLabel: { fontFamily: fonts.ui, fontSize: 9, letterSpacing: 2, color: colors.fog, marginBottom: 8, textTransform: 'uppercase' },
  fieldBody: { fontFamily: fonts.body, fontSize: 13, color: colors.bone, lineHeight: 20, marginBottom: 16, paddingHorizontal: 16 },
  microNote: { fontFamily: fonts.ui, fontSize: 7, letterSpacing: 2, color: colors.fog, opacity: 0.6, textAlign: 'center', padding: 16, paddingBottom: 20, borderTopWidth: 1, borderTopColor: 'rgba(139,105,20,0.1)' },
  rankRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  rankDisplay: { fontFamily: fonts.display, fontSize: 18, color: colors.bone },
  rankCinephile: { color: colors.bone },
  rankArchivist: { color: colors.sepia, ...effects.textShadowDeep },
  rankAuteur: { color: colors.bloodReel, fontWeight: 'bold' },
  activeBadge: { borderWidth: 1, borderColor: 'green', backgroundColor: 'rgba(0,255,0,0.1)', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 2 },
  activeBadgeText: { fontFamily: fonts.uiBold, fontSize: 8, color: 'green', letterSpacing: 1 },
  primaryBtn: { backgroundColor: colors.sepia, paddingVertical: 14, marginHorizontal: 16, borderRadius: 2, alignItems: 'center', ...effects.glowSepia },
  primaryBtnText: { fontFamily: fonts.uiMedium, fontSize: 10, letterSpacing: 2.5, color: colors.ink, fontWeight: '700' },
  dividerSpaced: { height: 1, backgroundColor: 'rgba(139,105,20,0.15)', marginVertical: 16 },
  readonlyField: { backgroundColor: colors.soot, borderWidth: 1, borderColor: '#30261A', padding: 12, borderRadius: 2 },
  readonlyText: { fontFamily: fonts.mono, fontSize: 13, color: colors.fog },
  actionBtnSpaced: { flexDirection: 'row', alignItems: 'center', padding: 16, backgroundColor: 'rgba(139,105,20,0.03)' },
  actionBtnTextFlex: { fontFamily: fonts.ui, fontSize: 10, letterSpacing: 1.5, color: colors.bone, flex: 1, marginLeft: 10 },
  passwordPanel: { padding: 16, backgroundColor: '#0A0806', borderTopWidth: 1, borderTopColor: '#30261A', gap: 16 },
  oauthBanner: { backgroundColor: 'rgba(139,105,20,0.05)', padding: 16, borderRadius: 2, borderWidth: 1, borderColor: 'rgba(139,105,20,0.1)' },
  fieldInput: { backgroundColor: colors.ink, borderWidth: 1, borderColor: '#30261A', color: colors.parchment, fontFamily: fonts.mono, fontSize: 14, padding: 12, borderRadius: 2 },
  saveFieldBtn: { backgroundColor: 'transparent', borderWidth: 1, borderColor: colors.sepia, paddingVertical: 12, alignItems: 'center', borderRadius: 2, marginTop: 8 },
  saveFieldBtnText: { fontFamily: fonts.ui, fontSize: 10, letterSpacing: 2, color: colors.sepia },
  disabledBtn: { opacity: 0.5 },
  privacyGroup: { padding: 16, borderBottomWidth: 1, borderBottomColor: 'rgba(139,105,20,0.1)' },
  privacyGroupLabel: { fontFamily: fonts.ui, fontSize: 9, letterSpacing: 2, color: colors.fog, marginBottom: 12 },
  radioOption: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 },
  radioOptionActive: {},
  radioDot: { width: 14, height: 14, borderRadius: 7, borderWidth: 1, borderColor: colors.ash, backgroundColor: 'transparent' },
  radioDotActive: { borderColor: colors.sepia, backgroundColor: colors.sepia },
  radioLabel: { fontFamily: fonts.body, fontSize: 13, color: colors.bone },
  radioLabelActive: { color: colors.parchment },
  notifRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, borderBottomWidth: 1, borderBottomColor: 'rgba(139,105,20,0.1)' },
  notifRowLast: { borderBottomWidth: 0 },
  notifTextWrap: { flex: 1, paddingRight: 16 },
  notifLabel: { fontFamily: fonts.uiMedium, fontSize: 12, color: colors.bone, marginBottom: 4 },
  notifDesc: { fontFamily: fonts.body, fontSize: 12, color: colors.fog },
  pushSection: { backgroundColor: '#0A0806', padding: 16, borderTopWidth: 1, borderTopColor: '#30261A' },
  pushTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 },
  pushTitle: { fontFamily: fonts.uiMedium, fontSize: 9, letterSpacing: 2, color: colors.sepia },
  pushDesc: { fontFamily: fonts.bodyItalic, fontSize: 11, color: colors.fog, lineHeight: 16 },
  actionBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 16, borderBottomWidth: 1, borderBottomColor: 'rgba(139,105,20,0.1)' },
  actionBtnDanger: { borderBottomColor: 'transparent' },
  actionBtnText: { fontFamily: fonts.ui, fontSize: 10, letterSpacing: 1.5, color: colors.bone },
  actionBtnTextDanger: { color: colors.bloodReel },
});
