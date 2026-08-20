import React, { useRef } from 'react';
import { View, Text, StyleSheet, TextInput, Switch, Linking, Platform } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import TactileEngine from '@/src/utils/TactileEngine';
import Animated from 'react-native-reanimated';
import { enterDown } from '@/src/utils/enter';
import {
  Crown, Lock, Eye, Bell, ChevronDown, ChevronUp, Star, Sparkles,
  UserRound, AudioLines, BellOff, TriangleAlert,
} from 'lucide-react-native';
import { colors, fonts, effects } from '@/src/theme/theme';
import { scaledTextProps, displayTextProps, deckLabelProps } from '@/src/constants/textScaling';
import PressableScale from '@/src/components/PressableScale';
import reelToast from '@/src/utils/reelToast';
import { getPushPermissionState, requestPushPermission, type PushPermissionState } from '@/src/lib/pushNotifications';

import { Controller, Control } from 'react-hook-form';
import type { SettingsFormData } from '@/src/schemas/settings';
import { useSettingsStore } from '@/src/stores/settings';
import { useAuthStore } from '@/src/stores/auth';
import { AuthService } from '@/src/services/AuthService';
import { supabase } from '@/src/lib/supabase';
import { isAuteurPlusTier, isArchivistPlusTier, getDisplayTier } from '@/src/utils/tier';
import { getPasswordChecks, PW_CHECK_LABELS, getStrengthInfo } from '@/src/components/auth/PasswordStrengthMeter';

const AnimatedView = Animated.createAnimatedComponent(View);

// No hitSlop constants. Every control on this page reaches 48 by its own
// geometry now. A halo lives inside React Native's touch dispatch and is
// invisible to BOTH platforms' accessibility layers, so it buys reach and never
// compliance — and where controls stack, adjacent halos overlap and the later
// sibling wins the touch. On this page that meant the bottom of SIGN OUT
// pressing DELETE ACCOUNT.

/** The three standings, in order. `founding` displays as AUTEUR via getDisplayTier. */
const RANKS = ['CINEPHILE', 'ARCHIVIST', 'AUTEUR'] as const;

// ═══ REUSABLE COMPONENTS ═══
export const SectionCard = ({ children, danger }: { children: React.ReactNode; danger?: boolean }) => (
  <View style={[st.sectionCard, danger && st.sectionCardDanger]}>
    <LinearGradient
      colors={danger ? ['transparent', 'rgba(162,36,36,0.2)', 'transparent'] : ['transparent', 'rgba(184,137,26,0.2)', 'transparent']}
      start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
      style={st.sectionTopLine}
    />
    <LinearGradient
      colors={danger ? ['rgba(162,36,36,0.05)', 'transparent'] : ['rgba(184,137,26,0.03)', 'transparent']}
      style={StyleSheet.absoluteFillObject}
    />
    {children}
  </View>
);

export const SectionHead = ({ icon: Icon, label, danger }: { icon: import('lucide-react-native').LucideIcon; label: string; danger?: boolean }) => (
  <View style={st.sectionHeaderWrap}>
    <View style={st.sectionHeaderRow}>
      <Icon size={14} color={danger ? 'rgba(162,36,36,0.7)' : colors.sepia} style={st.sectionHeaderIcon} />
      <Text style={[st.sectionHeaderText, danger && st.sectionHeaderTextDanger]} {...scaledTextProps}>{label}</Text>
    </View>
  </View>
);

/**
 * A switch that looks the same on both platforms, and says its own name.
 *
 * ── ios_backgroundColor ──────────────────────────────────────────────────────
 * On iOS `trackColor.false` maps to UISwitch's `tintColor`, which colours the
 * OUTLINE only; the fill stays the system default. So an off switch rendered as
 * a bright light-grey pill on the app's darkest page, while the same switch on
 * Android was dark brass. `ios_backgroundColor` sets the actual fill, and the
 * two platforms finally agree.
 *
 * ── the label ────────────────────────────────────────────────────────────────
 * A Switch with no accessibilityLabel announces "off, switch" and never which
 * switch. Six of them on this page were anonymous.
 */
export const Toggle = ({ active, onToggle, disabled, label }: { active: boolean; onToggle: () => void; disabled?: boolean; label: string }) => (
  <Switch
    value={active}
    disabled={disabled}
    onValueChange={() => { TactileEngine.selection(); onToggle(); }}
    trackColor={{ false: 'rgba(184,137,26,0.12)', true: colors.sepia }}
    ios_backgroundColor={'rgba(184,137,26,0.12)'}
    thumbColor={active ? colors.parchment : colors.fog}
    accessibilityLabel={label}
    accessibilityRole="switch"
    accessibilityState={{ checked: active, disabled: !!disabled }}
  />
);

/**
 * One option in a group. 48 by geometry: these stack with no gap, so the old
 * 38pt row plus a 10pt halo overlapped its neighbour by 20 and the LOWER option
 * won — the bottom of every choice selected the one beneath it, on a privacy
 * control.
 */
export const RadioOption = ({ selected, label, description, onPress, disabled }: { selected: boolean; label: string; description?: string; onPress: () => void; disabled?: boolean }) => (
  <PressableScale
    style={[st.radioOption, disabled && st.dimmed]}
    onPress={disabled ? undefined : onPress}
    disabled={disabled}
    hitSlop={null}
    haptic="selection"
    pressedScale={0.96}
    accessibilityLabel={description ? `${label}. ${description}` : label}
    accessibilityRole="radio"
    accessibilityState={{ selected, disabled: !!disabled }}
  >
    <View style={[st.radioDot, selected && st.radioDotActive]} />
    <View style={st.radioTextWrap}>
      <Text style={[st.radioLabel, selected && st.radioLabelActive]} {...scaledTextProps}>{label}</Text>
      {!!description && <Text style={st.radioDesc} {...scaledTextProps}>{description}</Text>}
    </View>
  </PressableScale>
);

export const ActionBtn = ({ icon: Icon, label, onPress, danger }: { icon: import('lucide-react-native').LucideIcon; label: string; onPress: () => void; danger?: boolean }) => (
  <PressableScale
    style={[st.actionBtn, danger && st.actionBtnDanger]}
    onPress={onPress}
    hitSlop={null}
    haptic={danger ? 'heavy' : 'light'}
    pressedScale={0.95}
    accessibilityLabel={label}
    accessibilityRole="button"
  >
    <Icon size={12} color={danger ? 'rgba(162,36,36,0.7)' : colors.fog} />
    <Text style={[st.actionBtnText, danger && st.actionBtnTextDanger]} {...scaledTextProps}>{label}</Text>
  </PressableScale>
);

// ═══ SECTIONS ═══

/**
 * MEMBERSHIP & BILLING.
 *
 * ── THE CARD CALLED BILLING HAD NO BILLING ───────────────────────────────────
 * An Auteur — the member paying most — got a sentence and no control at all, so
 * there was no route from this page to cancelling or restoring. An Archivist
 * had to press UPGRADE to find CANCEL. One door now, at every rank, to the page
 * that already holds all three standings, MANAGE SUBSCRIPTION and RESTORE.
 *
 * ── AND IT DOES NOT NAME THE NEXT RANK ───────────────────────────────────────
 * The Society page shows all three side by side and you may go straight from
 * free to Auteur, so a button reading "RISE TO ARCHIVIST" would be a lie about
 * what happens next. CHOOSE is what you actually do.
 */
export function PatronageSection({ userRole, onUpgrade }: { userRole: string; onUpgrade: () => void }) {
  const display = getDisplayTier(userRole);
  const pretty = display.charAt(0) + display.slice(1).toLowerCase();
  const isAuteur = isAuteurPlusTier(userRole);
  const isArchivist = isArchivistPlusTier(userRole);

  const standingLine = !isArchivist
    ? 'The Editorial Desk, The Physical Archive and The Lounge open at Archivist.'
    : !isAuteur
      ? 'Radar breakdowns, curatorial poster control and the gold Dispatch badge open at Auteur.'
      : 'You hold the highest rank in The Society. Every room is open to you.';

  return (
    <AnimatedView entering={enterDown(100)}>
      <SectionCard>
        <SectionHead icon={Crown} label="MEMBERSHIP & BILLING" />
        <View style={st.fieldWrap}>
          <Text style={st.fieldLabel} {...scaledTextProps}>YOUR RANK</Text>
          <View style={st.rankRow}>
            <Text
              style={[
                st.rankDisplay,
                isAuteur && st.rankAuteur,
                isArchivist && !isAuteur && st.rankArchivist,
                !isArchivist && st.rankCinephile,
              ]}
              {...displayTextProps}
            >
              {pretty}
            </Text>
            {isAuteur && <Star size={12} color={colors.bloodReel} strokeWidth={1.5} fill={colors.bloodReel} />}
            {isArchivist && !isAuteur && <Sparkles size={12} color={colors.sepia} strokeWidth={1.5} />}
          </View>

          {/* The three standings, yours lit. It shows what the button opens —
              which is why it earns its line rather than decorating one. */}
          <View
            style={st.ladder}
            accessible
            accessibilityRole="text"
            accessibilityLabel={`Your rank is ${pretty}. The Society's ranks are Cinephile, Archivist and Auteur.`}
          >
            {RANKS.map((r, i) => (
              <React.Fragment key={r}>
                {i > 0 && <View style={st.ladderMark} />}
                <Text style={[st.ladderRank, r === display && st.ladderRankNow]} {...scaledTextProps}>{r}</Text>
              </React.Fragment>
            ))}
          </View>
        </View>

        <Text style={st.fieldBody} {...scaledTextProps}>{standingLine}</Text>
        <PressableScale
          style={st.primaryBtn}
          onPress={onUpgrade}
          hitSlop={null}
          haptic="medium"
          pressedScale={0.96}
          accessibilityRole="button"
          accessibilityLabel="Choose your rank. Opens The Society, where you can change or manage your membership."
        >
          {/* deckLabelProps, not a hand-rolled shrink: a label in a fixed
              control that must hold one line. It carries the 1.35 cap AND the
              shrink together, which is the app's existing answer to this exact
              shape — the card and record decks both read from it. */}
          <Text style={st.primaryBtnText} {...deckLabelProps}>CHOOSE YOUR RANK</Text>
        </PressableScale>
        <Text style={st.microNote} {...scaledTextProps}>IN-APP PURCHASE · APP STORE</Text>
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
    // Re-armed on mount, not only cleared on unmount. A ref that is only ever
    // set to false stays false after a Fast Refresh or a StrictMode double
    // invoke, and every guarded update below is then silently skipped.
    isMountedRef.current = true;
    supabase.auth.getUser().then(({ data }) => {
      if (isMountedRef.current && data.user?.identities && data.user.identities.length > 0) {
        const hasEmail = data.user.identities.some(id => id.provider === 'email');
        setIsOAuth(!hasEmail);
      }
    }).catch(() => {});
    return () => { isMountedRef.current = false; };
  }, []);

  /**
   * ── THE HOUSE HAS ONE STANDARD ───────────────────────────────────────────
   * Joining requires all five of `getPasswordChecks`. Changing a password here
   * required only `length >= 8`, so a member could join with a proper cipher and
   * then downgrade it to eight lowercase letters from inside the house — and the
   * placeholder advertised the weaker bar. Same checker, same meter, one rule.
   */
  const pwChecks = getPasswordChecks(newPassword);
  const pwPassed = Object.values(pwChecks).filter(Boolean).length;
  const pwStrong = pwPassed === PW_CHECK_LABELS.length;
  const strength = getStrengthInfo(pwPassed);
  const canSubmit = !!currentPassword && pwStrong && newPassword === confirmPassword;

  const handlePasswordChange = async () => {
    if (!currentPassword) { reelToast.error('Current cipher required.'); return; }
    if (!pwStrong) { reelToast.error('Your cipher does not meet Society encryption standards.'); return; }
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
      <PressableScale
        style={st.actionBtnSpaced}
        onPress={() => setShowPasswordChange(!showPasswordChange)}
        hitSlop={null}
        haptic="selection"
        pressedScale={0.97}
        accessibilityLabel="Change password"
        accessibilityRole="button"
        accessibilityState={{ expanded: showPasswordChange }}
      >
        <Lock size={12} color={colors.fog} />
        <Text style={st.actionBtnTextFlex} {...scaledTextProps}>CHANGE PASSWORD</Text>
        {showPasswordChange ? <ChevronUp size={12} color={colors.fog} /> : <ChevronDown size={12} color={colors.fog} />}
      </PressableScale>
      {showPasswordChange && (
        <View style={st.passwordPanel}>
          {isOAuth ? (
            <View style={st.oauthBanner}>
              <Text style={st.fieldBodyFlush} {...scaledTextProps}>You authenticated using a secure social provider. Authentication settings are managed externally.</Text>
            </View>
          ) : (
            <>
              <View style={st.panelField}>
                <Text style={st.fieldLabel} {...scaledTextProps}>CURRENT PASSWORD</Text>
                <TextInput style={st.fieldInput} value={currentPassword} onChangeText={setCurrentPassword} secureTextEntry textContentType="password" returnKeyType="next" blurOnSubmit={false} onSubmitEditing={() => newPasswordRef.current?.focus()} placeholder="Your current password" placeholderTextColor={colors.ash} selectionColor={colors.selection} keyboardAppearance="dark" accessibilityLabel="Current password" {...scaledTextProps} />
              </View>
              <View style={st.panelField}>
                <Text style={st.fieldLabel} {...scaledTextProps}>NEW PASSWORD</Text>
                <TextInput ref={newPasswordRef} style={st.fieldInput} value={newPassword} onChangeText={setNewPassword} secureTextEntry textContentType="newPassword" autoComplete="new-password" returnKeyType="next" blurOnSubmit={false} onSubmitEditing={() => confirmPasswordRef.current?.focus()} placeholder="Society encryption standard" placeholderTextColor={colors.ash} selectionColor={colors.selection} keyboardAppearance="dark" accessibilityLabel="New password" {...scaledTextProps} />
                {newPassword.length > 0 && (
                  <View style={st.pwMeter} accessible accessibilityRole="progressbar" accessibilityLabel={`Cipher strength: ${strength.label}`}>
                    <View style={st.pwBars}>
                      {PW_CHECK_LABELS.map(([key], i) => (
                        <View key={key} style={[st.pwBar, i < pwPassed && { backgroundColor: strength.color }]} />
                      ))}
                    </View>
                    <Text style={[st.pwStrength, { color: strength.color }]} {...scaledTextProps}>{strength.label}</Text>
                    <Text style={st.pwChecks} {...scaledTextProps}>
                      {PW_CHECK_LABELS.map(([key, text]) => (pwChecks[key] ? text : text)).join(' · ')}
                    </Text>
                  </View>
                )}
              </View>
              <View style={st.panelField}>
                <Text style={st.fieldLabel} {...scaledTextProps}>CONFIRM PASSWORD</Text>
                <TextInput ref={confirmPasswordRef} style={st.fieldInput} value={confirmPassword} onChangeText={setConfirmPassword} secureTextEntry textContentType="newPassword" autoComplete="new-password" returnKeyType="done" onSubmitEditing={handlePasswordChange} placeholder="Repeat password" placeholderTextColor={colors.ash} selectionColor={colors.selection} keyboardAppearance="dark" accessibilityLabel="Confirm password" {...scaledTextProps} />
                {confirmPassword.length > 0 && newPassword !== confirmPassword && (
                  <Text style={st.pwMismatch} {...scaledTextProps}>The two ciphers do not match.</Text>
                )}
              </View>
              <PressableScale
                style={[st.saveFieldBtn, !canSubmit && st.dimmed]}
                onPress={handlePasswordChange}
                disabled={changingPassword || !canSubmit}
                hitSlop={null}
                haptic="medium"
                pressedScale={0.96}
                accessibilityRole="button"
                accessibilityState={{ disabled: changingPassword || !canSubmit }}
                accessibilityLabel={canSubmit ? 'Update password' : 'Update password. Your new cipher must meet all five Society standards and be repeated exactly.'}
              >
                <Text style={st.saveFieldBtnText} {...scaledTextProps}>{changingPassword ? 'UPDATING…' : 'UPDATE PASSWORD'}</Text>
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
    <AnimatedView entering={enterDown(150)}>
      <SectionCard>
        <SectionHead icon={UserRound} label="ACCOUNT" />

        {/* Printed record lines, not input boxes. They were drawn as bordered
            fields you cannot type in — and the handle IS editable, in the
            profile editor, so the box was misleading twice over. */}
        <View style={st.fieldWrap}>
          <Text style={st.fieldLabel} {...scaledTextProps}>HANDLE</Text>
          <Text style={st.recordValue} {...scaledTextProps}>@{user.username}</Text>
          <Text style={st.recordNote} {...scaledTextProps}>CHANGED IN YOUR PROFILE</Text>
        </View>
        <View style={st.fieldWrap}>
          <Text style={st.fieldLabel} {...scaledTextProps}>EMAIL</Text>
          <Text style={st.recordValue} {...scaledTextProps}>{user.email}</Text>
        </View>

        <View style={st.fieldWrap}>
          <Text style={st.fieldLabel} {...scaledTextProps}>BIOMETRIC SECURITY</Text>
          {/* It said "for destructive actions", which is two thirds of the
              truth. Enabling it also puts a vault screen in front of the
              member's OWN Physical Archive, and nothing here warned them. */}
          <Text style={st.rowDesc} {...scaledTextProps}>
            Face ID or Touch ID to sign out, to delete your account, and to open your own Physical Archive.
          </Text>
          <View style={st.toggleUnderDesc}>
            <Controller
              control={control}
              name="biometricLock"
              render={({ field }) => (
                <Toggle active={field.value} onToggle={() => field.onChange(!field.value)} disabled={saving} label="Biometric security" />
              )}
            />
          </View>
        </View>

        <PasswordChangePanel />
      </SectionCard>
    </AnimatedView>
  );
}

export function PrivacySection({ control, saving }: { control: Control<SettingsFormData>; saving: boolean }) {
  return (
    <AnimatedView entering={enterDown(200)}>
      <SectionCard>
        <SectionHead icon={Eye} label="PRIVACY" />
        <View style={st.privacyGroup} accessibilityRole="radiogroup">
          <Text style={st.privacyGroupLabel} {...scaledTextProps}>SOCIAL VISIBILITY</Text>
          <Controller
            control={control}
            name="socialVisibility"
            render={({ field }) => (
              <>
                {/* Name, then explanation beneath — the pattern the notification
                    rows already use. An em-dash welding the two together forced
                    "Public — Anyone can see your activity" onto two ragged lines. */}
                {[
                  { value: 'public', label: 'Public', desc: 'Anyone can see your activity' },
                  { value: 'private', label: 'Private', desc: 'Only your approved followers' },
                ].map(opt => (
                  <RadioOption key={opt.value} selected={field.value === opt.value} label={opt.label} description={opt.desc} onPress={() => field.onChange(opt.value)} disabled={saving} />
                ))}
              </>
            )}
          />
        </View>
        <View style={st.privacyGroup} accessibilityRole="radiogroup">
          {/* Certify WHAT? The jargon needs its object, and it costs no height. */}
          <Text style={st.privacyGroupLabel} {...scaledTextProps}>WHO CAN CERTIFY YOUR LOGS</Text>
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
        <View style={[st.privacyGroup, st.privacyGroupLast]} accessibilityRole="radiogroup">
          <Text style={st.privacyGroupLabel} {...scaledTextProps}>WHO CAN ANNOTATE YOUR LOGS</Text>
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

/**
 * ── WHETHER THE PHONE WILL DELIVER ANY OF THIS ───────────────────────────────
 *
 * Four switches sat here saying what they would tell you about, above a
 * paragraph of prose, and the page never once said whether the operating system
 * permits alerts at all — so every switch could be on and the member hear
 * nothing. The prose is gone; this is in its place.
 *
 * Nothing is shown when the answer is "yes", because a permanent banner
 * announcing that all is well is noise. `unavailable` (a simulator, or the push
 * module absent) shows nothing either, rather than alarming someone about a
 * thing that cannot apply to them.
 */
function PushPermissionNotice() {
  const [state, setState] = React.useState<PushPermissionState | null>(null);
  const [asking, setAsking] = React.useState(false);
  const isMountedRef = useRef(true);

  React.useEffect(() => {
    isMountedRef.current = true;
    getPushPermissionState()
      .then(s => { if (isMountedRef.current) setState(s); })
      .catch(() => { if (isMountedRef.current) setState('unavailable'); });
    return () => { isMountedRef.current = false; };
  }, []);

  const ask = async () => {
    setAsking(true);
    try {
      const next = await requestPushPermission();
      if (isMountedRef.current) setState(next);
      // Denied at the system prompt is final on iOS; the only route left is the
      // system settings, which the `denied` notice below already offers.
      if (next === 'granted') TactileEngine.success();
    } finally {
      if (isMountedRef.current) setAsking(false);
    }
  };

  if (state === null || state === 'granted' || state === 'unavailable') return null;

  const denied = state === 'denied';
  return (
    <View style={st.permNotice}>
      <View style={st.permTitleRow}>
        {denied
          ? <TriangleAlert size={10} color={colors.sepia} strokeWidth={2.2} />
          : <BellOff size={10} color={colors.sepia} strokeWidth={2.2} />}
        <Text style={st.permTitle} {...scaledTextProps}>
          {denied ? 'THIS DEVICE IS WITHHOLDING ALERTS' : 'THIS DEVICE HAS NOT BEEN ASKED'}
        </Text>
      </View>
      <Text style={st.permText} {...scaledTextProps}>
        {denied
          ? 'Your switches are set, but the system is not delivering them.'
          : 'Nothing will reach your lock screen until you permit it.'}
      </Text>
      <PressableScale
        style={[st.permBtn, asking && st.dimmed]}
        onPress={denied ? () => { Linking.openSettings().catch(() => reelToast.error('Could not open system settings.')); } : ask}
        disabled={asking}
        hitSlop={null}
        haptic="medium"
        pressedScale={0.97}
        accessibilityRole="button"
        accessibilityLabel={denied ? 'Open system settings' : 'Allow alerts on this device'}
      >
        <Text style={st.permBtnText} {...scaledTextProps}>
          {asking ? 'ASKING…' : denied ? (Platform.OS === 'ios' ? 'OPEN SYSTEM SETTINGS' : 'OPEN APP SETTINGS') : 'ALLOW ALERTS'}
        </Text>
      </PressableScale>
    </View>
  );
}

export function NotificationsSection({ control, saving }: { control: Control<SettingsFormData>; saving: boolean }) {
  return (
    <AnimatedView entering={enterDown(250)}>
      <SectionCard>
        <SectionHead icon={Bell} label="NOTIFICATIONS" />
        {[
          { name: 'notifFollows' as const, label: 'New Followers', desc: 'When someone follows you' },
          { name: 'notifEndorsements' as const, label: 'Certifications', desc: 'When someone certifies your log' },
          { name: 'notifComments' as const, label: 'Annotations', desc: 'When someone annotates your log' },
          { name: 'notifSystem' as const, label: 'System Alerts', desc: 'Society announcements' },
        ].map((item, idx, arr) => (
          <View key={item.label} style={[st.notifRow, idx === arr.length - 1 && st.notifRowLast]}>
            <View style={st.notifTextWrap}>
              <Text style={st.notifLabel} {...scaledTextProps}>{item.label}</Text>
              <Text style={st.rowDesc} {...scaledTextProps}>{item.desc}</Text>
            </View>
            <Controller
              control={control}
              name={item.name}
              render={({ field }) => (
                <Toggle active={field.value} onToggle={() => field.onChange(!field.value)} disabled={saving} label={item.label} />
              )}
            />
          </View>
        ))}
        <PushPermissionNotice />
        {/* Says what the switches govern, so nobody fears their record is being
            erased along with the banner. */}
        <Text style={st.quietLine} {...scaledTextProps}>
          These govern what reaches your lock screen. Your notification list keeps everything either way.
        </Text>
      </SectionCard>
    </AnimatedView>
  );
}

/**
 * THIS DEVICE — formerly EXPERIENCE.
 *
 * Everything else on this page waits for SAVE; this one writes the instant it
 * is flipped, and nothing explained the difference. The name does: it is a
 * preference of the phone, not an amendment to the member's dossier. No note
 * needed, and it is a truer name than "Experience" ever was.
 */
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
    <AnimatedView entering={enterDown(275)}>
      <SectionCard>
        <SectionHead icon={AudioLines} label="THIS DEVICE" />
        <View style={[st.notifRow, st.notifRowLast]}>
          <View style={st.notifTextWrap}>
            <Text style={st.notifLabel} {...scaledTextProps}>Tactile Feedback</Text>
            <Text style={st.rowDesc} {...scaledTextProps}>Haptic response on buttons, tabs and actions</Text>
          </View>
          <Toggle active={tactileAudioEnabled} onToggle={() => handleTactileToggle(!tactileAudioEnabled)} label="Tactile feedback" />
        </View>
      </SectionCard>
    </AnimatedView>
  );
}

const st = StyleSheet.create({
  sectionCard: { backgroundColor: '#110D0A', borderWidth: 1, borderColor: '#30261A', borderRadius: 6, marginHorizontal: 16, marginBottom: 16, overflow: 'hidden' },
  sectionCardDanger: { borderColor: 'rgba(162,36,36,0.5)', backgroundColor: 'rgba(162,36,36,0.03)' },
  sectionTopLine: { position: 'absolute', top: 0, left: 0, right: 0, height: 1, zIndex: 10 },
  sectionHeaderWrap: { padding: 16, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: 'rgba(184,137,26,0.15)' },
  sectionHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  sectionHeaderIcon: { marginTop: -1 },
  sectionHeaderText: { fontFamily: fonts.sub, fontSize: 10, color: colors.sepia, letterSpacing: 2.5, includeFontPadding: false },
  sectionHeaderTextDanger: { color: colors.bloodReel },
  dimmed: { opacity: 0.5 },

  fieldWrap: { padding: 16, borderBottomWidth: 1, borderBottomColor: 'rgba(184,137,26,0.1)' },
  fieldLabel: { fontFamily: fonts.sub, fontSize: 9, letterSpacing: 2, color: colors.fog, marginBottom: 8, includeFontPadding: false },
  fieldBody: { fontFamily: fonts.body, fontSize: 13, color: colors.bone, lineHeight: 20, marginVertical: 16, paddingHorizontal: 16 },
  fieldBodyFlush: { fontFamily: fonts.body, fontSize: 13, color: colors.bone, lineHeight: 20 },
  // 7pt with 2pt tracking wrapped to two lines and crowded the card's edge; the
  // dropped clause ("SECURE CHECKOUT") was reassurance nobody had asked for.
  microNote: { fontFamily: fonts.sub, fontSize: 7.5, letterSpacing: 1.6, color: colors.fog, opacity: 0.6, textAlign: 'center', padding: 16, paddingBottom: 18, marginTop: 16, borderTopWidth: 1, borderTopColor: 'rgba(184,137,26,0.1)', includeFontPadding: false },

  rankRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  // The one line stating who you are in the house was set smaller than a
  // section heading.
  rankDisplay: { fontFamily: fonts.display, fontSize: 26, color: colors.bone },
  rankCinephile: { color: colors.bone },
  rankArchivist: { color: colors.sepia, ...effects.textShadowDeep },
  rankAuteur: { color: colors.bloodReel },
  ladder: { flexDirection: 'row', alignItems: 'center', marginTop: 12, flexWrap: 'wrap' },
  ladderRank: { fontFamily: fonts.sub, fontSize: 8.5, letterSpacing: 2, color: colors.fog, opacity: 0.42, includeFontPadding: false },
  ladderRankNow: { color: colors.sepia, opacity: 1 },
  ladderMark: { width: 4, height: 4, backgroundColor: colors.fog, opacity: 0.35, transform: [{ rotate: '45deg' }], marginHorizontal: 9 },

  primaryBtn: { backgroundColor: colors.sepia, minHeight: 48, alignItems: 'center', justifyContent: 'center', marginHorizontal: 16, borderRadius: 2, ...effects.glowSepia },
  primaryBtnText: { fontFamily: fonts.sub, fontSize: 10, letterSpacing: 2.5, color: colors.ink, fontWeight: '700', includeFontPadding: false },

  recordValue: { fontFamily: fonts.body, fontSize: 13, color: colors.parchment, paddingBottom: 9, borderBottomWidth: 1, borderBottomColor: 'rgba(184,137,26,0.15)' },
  recordNote: { fontFamily: fonts.sub, fontSize: 8, letterSpacing: 1.4, color: colors.fog, opacity: 0.75, marginTop: 7, includeFontPadding: false },
  toggleUnderDesc: { marginTop: 12, alignSelf: 'flex-start' },

  actionBtnSpaced: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, minHeight: 48, backgroundColor: 'rgba(184,137,26,0.03)' },
  actionBtnTextFlex: { fontFamily: fonts.sub, fontSize: 10, letterSpacing: 1.5, color: colors.bone, flex: 1, marginLeft: 10, includeFontPadding: false },
  passwordPanel: { padding: 16, backgroundColor: '#0A0806', borderTopWidth: 1, borderTopColor: '#30261A' },
  panelField: { marginBottom: 16 },
  oauthBanner: { backgroundColor: 'rgba(184,137,26,0.05)', padding: 16, borderRadius: 2, borderWidth: 1, borderColor: 'rgba(184,137,26,0.1)' },
  fieldInput: { backgroundColor: colors.ink, borderWidth: 1, borderColor: '#30261A', color: colors.parchment, fontFamily: fonts.body, fontSize: 14, padding: 12, borderRadius: 2 },
  pwMeter: { marginTop: 10 },
  pwBars: { flexDirection: 'row', gap: 5 },
  pwBar: { flex: 1, height: 3, backgroundColor: 'rgba(184,137,26,0.15)', borderRadius: 1 },
  pwStrength: { fontFamily: fonts.sub, fontSize: 8.5, letterSpacing: 1.6, marginTop: 8, includeFontPadding: false },
  pwChecks: { fontFamily: fonts.body, fontSize: 10.5, color: colors.fog, lineHeight: 16, marginTop: 6 },
  pwMismatch: { fontFamily: fonts.body, fontSize: 11, color: colors.crimson, marginTop: 8 },
  saveFieldBtn: { backgroundColor: 'transparent', borderWidth: 1, borderColor: colors.sepia, minHeight: 48, alignItems: 'center', justifyContent: 'center', borderRadius: 2 },
  saveFieldBtnText: { fontFamily: fonts.sub, fontSize: 10, letterSpacing: 2, color: colors.sepia, includeFontPadding: false },

  privacyGroup: { padding: 16, borderBottomWidth: 1, borderBottomColor: 'rgba(184,137,26,0.1)' },
  privacyGroupLast: { borderBottomWidth: 0 },
  privacyGroupLabel: { fontFamily: fonts.sub, fontSize: 9, letterSpacing: 2, color: colors.fog, marginBottom: 6, includeFontPadding: false },
  radioOption: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 48 },
  radioDot: { width: 14, height: 14, borderRadius: 7, borderWidth: 1, borderColor: colors.ash, backgroundColor: 'transparent' },
  radioDotActive: { borderColor: colors.sepia, backgroundColor: colors.sepia },
  radioTextWrap: { flex: 1 },
  radioLabel: { fontFamily: fonts.body, fontSize: 13, color: colors.bone },
  radioLabelActive: { color: colors.parchment },
  radioDesc: { fontFamily: fonts.body, fontSize: 11, color: colors.fog, marginTop: 2 },

  notifRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, minHeight: 48, borderBottomWidth: 1, borderBottomColor: 'rgba(184,137,26,0.1)' },
  notifRowLast: { borderBottomWidth: 0 },
  notifTextWrap: { flex: 1, paddingRight: 16 },
  notifLabel: { fontFamily: fonts.sub, fontSize: 12, color: colors.bone, marginBottom: 4, includeFontPadding: false },
  // 11, not 12. Label and description were the same size, so neither led.
  rowDesc: { fontFamily: fonts.body, fontSize: 11, color: colors.fog, lineHeight: 16 },
  quietLine: { fontFamily: fonts.body, fontSize: 11, color: colors.fog, lineHeight: 16, padding: 16, paddingTop: 14, borderTopWidth: 1, borderTopColor: 'rgba(184,137,26,0.1)' },

  // Brass, not blood: nothing has gone wrong, the phone simply has not been
  // asked, or has been told no. Red would have the member hunting for a mistake.
  permNotice: { marginHorizontal: 16, marginTop: 16, padding: 12, borderRadius: 4, backgroundColor: 'rgba(184,137,26,0.07)', borderWidth: 1, borderColor: colors.sepiaBorder },
  permTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 },
  permTitle: { fontFamily: fonts.sub, fontSize: 9, letterSpacing: 2, color: colors.sepia, flex: 1, includeFontPadding: false },
  permText: { fontFamily: fonts.body, fontSize: 11, color: colors.bone, lineHeight: 16 },
  permBtn: { marginTop: 11, minHeight: 48, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.sepia, borderRadius: 2 },
  permBtnText: { fontFamily: fonts.sub, fontSize: 9, letterSpacing: 2, color: colors.sepia, includeFontPadding: false },

  actionBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, minHeight: 48, borderBottomWidth: 1, borderBottomColor: 'rgba(184,137,26,0.1)' },
  actionBtnDanger: { borderBottomColor: 'transparent' },
  actionBtnText: { fontFamily: fonts.sub, fontSize: 10, letterSpacing: 1.5, color: colors.bone, includeFontPadding: false },
  actionBtnTextDanger: { color: colors.bloodReel },
});
