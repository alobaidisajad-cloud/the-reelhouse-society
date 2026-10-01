import React, { useState } from 'react';
import { View, Pressable, StyleSheet, ActivityIndicator, Modal } from 'react-native';
import { Text, TextInput } from '@/src/components/text';
import { KeyRound, X } from 'lucide-react-native';
import { colors, fonts, effects } from '@/src/theme/theme';
import PressableScale from '@/src/components/PressableScale';
import Animated from 'react-native-reanimated';
import { useModalKeyboardPadding } from '@/src/hooks/useModalKeyboardPadding';
import { SocietyEyebrow, HaloIcon, RegistrationBrackets } from './AuthChrome';
import { ToastHost } from '@/src/components/ToastHost';
import { e2eTrace } from '@/src/utils/e2eTrace';
import type { EmailLinkPurpose } from '@/src/hooks/useAuthFlow';

/** The sheet's words for each email it sends; the sheet itself is the same. */
const WORDS = {
  reset: {
    eyebrow: 'CREDENTIAL RECOVERY', title: 'Reset Password', close: 'Close recovery',
    ask: "Enter the email associated with your account and we'll send you a classified reset link.",
    sent: 'We sent a password reset link to', send: '✦  SEND RESET LINK',
  },
  confirm: {
    eyebrow: 'ADDRESS CONFIRMATION', title: 'Confirm Your Address', close: 'Close confirmation',
    ask: "Enter the email you joined with and we'll wire a fresh confirmation link.",
    sent: 'We sent a fresh confirmation link to', send: '✦  SEND CONFIRMATION LINK',
  },
} as const;

interface Props {
  visible: boolean;
  purpose: EmailLinkPurpose;
  forgotSent: boolean;
  forgotEmail: string;
  forgotLoading: boolean;
  onClose: () => void;
  onEmailChange: (val: string) => void;
  onSubmit: () => void;
  onBackToSignIn: () => void;
}

export function PasswordRecoveryModal({ visible, purpose, forgotSent, forgotEmail, forgotLoading, onClose, onEmailChange, onSubmit, onBackToSignIn }: Props) {
  const w = WORDS[purpose];
  // A Modal never resizes for the keyboard: padded by its height, on both platforms.
  const animatedOverlayStyle = useModalKeyboardPadding(24);
  // Ledger line warms to brass while the field is active
  const [emailFocused, setEmailFocused] = useState(false);

  return (
    <Modal
      statusBarTranslucent
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <Animated.View style={[s.modalOverlay, animatedOverlayStyle]} onAccessibilityEscape={onClose}>
        {/* The ground closes it for a finger; a screen reader has "Close recovery". */}
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={onClose}
          accessible={false}
          importantForAccessibility="no"
        />
        <View style={s.modalContent}>
          {/* Archival registration marks in the card corners */}
          <RegistrationBrackets />

          {/* Close */}
          <PressableScale
            style={s.modalCloseBtn}
            onPress={onClose}
            hitSlop={{ top: 15, right: 15, bottom: 15, left: 15 }}
            haptic="light"
            accessibilityLabel={w.close}
          >
            <X size={16} color={colors.bone} strokeWidth={2} />
          </PressableScale>

          {/* Header — the lost key, unframed in candlelight */}
          <View style={s.modalHeader}>
            <HaloIcon icon={KeyRound} iconSize={24} haloSize={104} style={s.iconWrap} />
            <SocietyEyebrow label={w.eyebrow} style={s.eyebrowWrap} />
            <Text style={s.modalTitle} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>
              {forgotSent ? 'Check Your Inbox' : w.title}
            </Text>
          </View>

          {forgotSent ? (
            <View>
              <Text style={s.modalBodyText}>
                {w.sent}{' '}
                <Text style={s.forgotEmailHighlight}>
                  {forgotEmail}
                </Text>
                .
              </Text>
              <Text style={s.modalSubText}>
                {/* eslint-disable-next-line react/no-unescaped-entities */}
                Check your spam folder if it doesn't arrive within 2 minutes.
              </Text>
              <PressableScale
                style={s.modalSubmitBtn}
                onPress={onBackToSignIn}
                hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }}
                pressedScale={0.97}
              >
                <Text style={s.modalSubmitText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>✦  BACK TO SIGN IN</Text>
              </PressableScale>
            </View>
          ) : (
            <View style={s.forgotFormBody}>
              <Text style={s.modalBodyText}>{w.ask}</Text>
              <View style={s.fieldGroup}>
                <Text style={[s.inputLabel, emailFocused && s.inputLabelFocused]}>EMAIL ADDRESS</Text>
                <TextInput
                  testID="recovery-email-input"
                  style={[s.input, emailFocused && s.inputFocused]}
                  placeholder="your@email.com"
                  placeholderTextColor={colors.fog}
                  value={forgotEmail}
                  onChangeText={(val) => {
                    // E2E only: how many characters reached the field, and when (never the text).
                    e2eTrace('auth.recovery.typed', { length: val.length });
                    onEmailChange(val);
                  }}
                  onFocus={() => setEmailFocused(true)}
                  onBlur={() => setEmailFocused(false)}
                  autoCapitalize="none"
                  keyboardType="email-address"
                  selectionColor={colors.sepia}
                  returnKeyType="go"
                  onSubmitEditing={onSubmit}
                  autoCorrect={false}
                  maxLength={254}
                  keyboardAppearance="dark"
                  accessibilityLabel="Recovery email address"
                  textContentType="emailAddress"
                  autoComplete="email"
                />
              </View>
              <PressableScale
                testID="recovery-submit-button"
                style={[s.modalSubmitBtn, forgotLoading && s.submitDisabled]}
                onPress={onSubmit}
                disabled={forgotLoading}
                hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }}
                pressedScale={0.97}
              >
                {forgotLoading ? (
                  <View style={s.submitLoading}>
                    <ActivityIndicator size="small" color={colors.ink} />
                    <Text style={s.modalSubmitText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>SENDING...</Text>
                  </View>
                ) : (
                  <Text style={s.modalSubmitText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>{w.send}</Text>
                )}
              </PressableScale>
            </View>
          )}
        </View>
      </Animated.View>
      <ToastHost />
    </Modal>
  );
}

const s = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: colors.inkwell,
    justifyContent: 'center',
    padding: 24,
  },
  modalContent: {
    backgroundColor: colors.ink,
    borderWidth: 1,
    borderColor: colors.sepiaBorder,
    borderRadius: 4,
    padding: 28,
    ...effects.glowSepia,
  },
  forgotFormBody: {
    gap: 16,
  },
  modalCloseBtn: {
    position: 'absolute',
    top: 16,
    right: 16,
    zIndex: 10,
    padding: 8,
  },
  modalHeader: {
    alignItems: 'center',
    marginBottom: 24,
  },
  iconWrap: {
    marginBottom: 14,
  },
  eyebrowWrap: {
    marginBottom: 10,
  },
  modalTitle: {
    fontFamily: fonts.display,
    fontSize: 24,
    color: colors.parchment,
    textAlign: 'center',
    ...effects.textShadowDeep,
  },
  modalBodyText: {
    fontFamily: fonts.body,
    fontSize: 13,
    color: colors.bone,
    lineHeight: 22,
    textAlign: 'center',
    marginBottom: 8,
  },
  modalSubText: {
    fontFamily: fonts.sub,
    fontSize: 10,
    letterSpacing: 0.8,
    color: colors.fog,
    textAlign: 'center',
    marginBottom: 20,
  },
  modalSubmitBtn: {
    backgroundColor: colors.sepia,
    borderRadius: 3,
    paddingVertical: 14,
    alignItems: 'center',
    ...effects.glowSepia,
  },
  modalSubmitText: {
    fontFamily: fonts.sub,
    fontSize: 11,
    letterSpacing: 2,
    color: colors.ink,
  },
  forgotEmailHighlight: {
    color: colors.parchment,
    fontFamily: fonts.bodyBold,
  },
  fieldGroup: {
    gap: 8,
  },
  inputLabel: {
    fontFamily: fonts.sub,
    fontSize: 10,
    letterSpacing: 2.5,
    color: colors.fog,
    textTransform: 'uppercase',
  },
  inputLabelFocused: {
    color: colors.sepia,
  },
  input: {
    backgroundColor: 'transparent',
    borderBottomWidth: 2,
    borderColor: colors.sepiaBorder,
    paddingVertical: 12,
    paddingHorizontal: 4,
    fontSize: 16,
    fontFamily: fonts.body,
    color: colors.parchment,
  },
  inputFocused: {
    borderColor: colors.sepiaBorderStrong,
  },
  submitDisabled: {
    opacity: 0.5,
    shadowOpacity: 0,
  },
  submitLoading: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
});
