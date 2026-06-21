import React from 'react';
import { View, Text, Pressable, StyleSheet, ActivityIndicator, Modal, TextInput, Platform } from 'react-native';
import { colors, fonts, effects } from '@/src/theme/theme';
import PressableScale from '@/src/components/PressableScale';
import Animated, { useAnimatedKeyboard, useAnimatedStyle } from 'react-native-reanimated';

interface Props {
  visible: boolean;
  forgotSent: boolean;
  forgotEmail: string;
  forgotLoading: boolean;
  onClose: () => void;
  onEmailChange: (val: string) => void;
  onSubmit: () => void;
  onBackToSignIn: () => void;
}

export function PasswordRecoveryModal({ visible, forgotSent, forgotEmail, forgotLoading, onClose, onEmailChange, onSubmit, onBackToSignIn }: Props) {
  const keyboard = useAnimatedKeyboard();
  const animatedOverlayStyle = useAnimatedStyle(() => ({
    paddingBottom: Platform.OS === 'ios' ? keyboard.height.value + 24 : 24,
  }));

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <Animated.View style={[s.modalOverlay, animatedOverlayStyle]}>
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={onClose}
        />
        <View style={s.modalContent}>
          {/* Close */}
          <PressableScale
            style={s.modalCloseBtn}
            onPress={onClose}
            hitSlop={{ top: 15, right: 15, bottom: 15, left: 15 }}
            haptic="light"
          >
            <Text style={s.modalCloseText}>✕</Text>
          </PressableScale>

          {/* Header */}
          <View style={s.modalHeader}>
            <View style={s.modalIconWrap}>
              <Text style={s.modalIcon}>🔒</Text>
            </View>
            <Text style={s.modalEyebrow} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>CREDENTIAL RECOVERY</Text>
            <Text style={s.modalTitle} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>
              {forgotSent ? 'Check Your Inbox' : 'Reset Password'}
            </Text>
          </View>

          {forgotSent ? (
            <View>
              <Text style={s.modalBodyText}>
                We sent a password reset link to{' '}
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
                <Text style={s.modalSubmitText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>BACK TO SIGN IN</Text>
              </PressableScale>
            </View>
          ) : (
            <View style={s.forgotFormBody}>
              <Text style={s.modalBodyText}>
                {/* eslint-disable-next-line react/no-unescaped-entities */}
                Enter the email associated with your account and we'll send you a classified reset link.
              </Text>
              <View style={s.inputWrap}>
                <TextInput
                  style={s.input}
                  placeholder="your@email.com"
                  placeholderTextColor={colors.fog}
                  value={forgotEmail}
                  onChangeText={onEmailChange}
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
                  <Text style={s.modalSubmitText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>SEND RESET LINK</Text>
                )}
              </PressableScale>
            </View>
          )}
        </View>
      </Animated.View>
    </Modal>
  );
}

const s = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(5, 3, 1, 0.95)',
    justifyContent: 'center',
    padding: 24,
  },
  modalContent: {
    backgroundColor: colors.ink,
    borderWidth: 1,
    borderColor: 'rgba(196,150,26,0.3)',
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
  modalCloseText: {
    color: colors.fog,
    fontSize: 16,
    fontFamily: fonts.ui,
  },
  modalHeader: {
    alignItems: 'center',
    marginBottom: 24,
  },
  modalIconWrap: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: 'rgba(196,150,26,0.08)',
    borderWidth: 1,
    borderColor: colors.sepiaBorder,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  modalIcon: {
    fontSize: 22,
  },
  modalEyebrow: {
    fontFamily: fonts.ui,
    fontSize: 8,
    letterSpacing: 4,
    color: colors.sepia,
    marginBottom: 8,
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
    fontFamily: fonts.ui,
    fontSize: 9,
    letterSpacing: 1,
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
    fontFamily: fonts.uiMedium,
    fontSize: 10,
    letterSpacing: 2,
    color: colors.ink,
    fontWeight: '700',
  },
  forgotEmailHighlight: {
    color: colors.parchment,
    fontFamily: fonts.bodyBold,
  },
  inputWrap: {
    position: 'relative',
  },
  input: {
    backgroundColor: 'transparent',
    borderBottomWidth: 2,
    borderColor: '#3A2E1C',
    paddingVertical: 12,
    paddingHorizontal: 4,
    fontSize: 16,
    fontFamily: fonts.mono,
    color: colors.parchment,
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
