import React from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import Animated, { FadeIn, ReduceMotion } from 'react-native-reanimated';
import { colors, fonts, effects } from '@/src/theme/theme';
import PressableScale from '@/src/components/PressableScale';

interface Props {
  confirmedEmail: string;
  resending: boolean;
  onResend: () => void;
  onClose: () => void;
  resendCooldown?: number;
  onManualConfirm: () => void;
  submitting?: boolean;
}

export function EmailConfirmationScreen({ confirmedEmail, resending, onResend, onClose, resendCooldown = 0, onManualConfirm, submitting = false }: Props) {
  return (
    <View style={s.container}>
      <View style={s.confirmationWrap}>
        <Animated.View entering={FadeIn.duration(600).reduceMotion(ReduceMotion.Never)} style={s.confirmationContent}>
          {/* Close */}
          <PressableScale
            style={s.closeBtn}
            onPress={onClose}
            hitSlop={{ top: 15, right: 15, bottom: 15, left: 15 }}
            haptic="light"
          >
            <Text style={s.closeText}>✕</Text>
          </PressableScale>

          {/* Floating mail icon */}
          <View style={s.confirmIconWrap}>
            <Text style={s.confirmIconEmoji}>✉️</Text>
          </View>

          <Text style={s.confirmEyebrow} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>CLEARANCE PENDING</Text>
          <Text style={s.confirmTitle} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>Check Your Inbox.</Text>
          <Text style={s.confirmBody}>
            We sent a classified verification link to:
          </Text>
          <View style={s.confirmEmailBox}>
            <Text style={s.confirmEmailText}>{confirmedEmail}</Text>
          </View>
          <Text style={s.confirmInstructions}>
            CLICK THE LINK IN YOUR EMAIL TO COMPLETE YOUR ENROLLMENT.{"\n"}
            {/* eslint-disable-next-line react/no-unescaped-entities */}
            CHECK YOUR SPAM FOLDER IF IT DOESN'T ARRIVE WITHIN 2 MINUTES.
          </Text>

          {/* Manual Confirm Button */}
          <PressableScale
            style={[s.manualConfirmBtn, submitting && s.submitDisabled]}
            onPress={onManualConfirm}
            disabled={submitting}
            hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }}
            pressedScale={0.97}
          >
            {submitting ? (
              <View style={s.submitLoading}>
                <ActivityIndicator size="small" color={colors.ink} />
                <Text style={s.manualConfirmText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>VERIFYING...</Text>
              </View>
            ) : (
              <Text style={s.manualConfirmText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>I&apos;VE VERIFIED MY EMAIL</Text>
            )}
          </PressableScale>

          {/* Resend button */}
          <PressableScale
            style={[s.confirmResendBtn, (resending || resendCooldown > 0 || submitting) && s.submitDisabled]}
            onPress={onResend}
            disabled={resending || resendCooldown > 0 || submitting}
            hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }}
            pressedScale={0.97}
          >
            {resending ? (
              <View style={s.submitLoading}>
                <ActivityIndicator size="small" color={colors.bone} />
                <Text style={s.confirmResendText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>SENDING...</Text>
              </View>
            ) : resendCooldown > 0 ? (
              <Text style={s.confirmResendText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>RESEND IN {resendCooldown}s</Text>
            ) : (
              <Text style={s.confirmResendText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>↻  RESEND LINK</Text>
            )}
          </PressableScale>
        </Animated.View>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.ink,
  },
  confirmationWrap: {
    flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32,
  },
  confirmationContent: { alignItems: 'center', maxWidth: 360 },
  closeBtn: {
    position: 'absolute',
    top: -40,
    right: -20,
    zIndex: 10,
    padding: 8,
  },
  closeText: {
    color: colors.fog,
    fontSize: 20,
    fontFamily: fonts.ui,
    opacity: 0.8,
  },
  confirmIconWrap: {
    width: 64, height: 64, borderRadius: 32,
    backgroundColor: 'rgba(196, 150, 26, 0.1)',
    borderWidth: 1.5, borderColor: colors.sepia,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 20,
    ...effects.glowSepia,
  },
  confirmIconEmoji: { fontSize: 28 },
  confirmEyebrow: {
    fontFamily: fonts.ui, fontSize: 9, letterSpacing: 4,
    color: colors.sepia, marginBottom: 12,
  },
  confirmTitle: {
    fontFamily: fonts.display, fontSize: 28, color: colors.parchment,
    textAlign: 'center', lineHeight: 34, marginBottom: 16,
    ...effects.textShadowDeep,
  },
  confirmBody: {
    fontFamily: fonts.body, fontSize: 13, color: colors.bone,
    textAlign: 'center', lineHeight: 22, marginBottom: 12,
  },
  confirmEmailBox: {
    backgroundColor: colors.soot, borderWidth: 1, borderColor: colors.ash,
    borderRadius: 2, paddingVertical: 10, paddingHorizontal: 16,
    marginBottom: 20, alignSelf: 'stretch',
  },
  confirmEmailText: {
    fontFamily: fonts.ui, fontSize: 11, letterSpacing: 0.8,
    color: colors.flicker, textAlign: 'center',
  },
  confirmInstructions: {
    fontFamily: fonts.ui, fontSize: 8, letterSpacing: 1,
    color: colors.fog, textAlign: 'center', lineHeight: 16,
    marginBottom: 24,
  },
  manualConfirmBtn: {
    backgroundColor: colors.sepia,
    borderRadius: 3,
    paddingVertical: 14,
    paddingHorizontal: 24,
    alignItems: 'center',
    marginBottom: 16,
    alignSelf: 'stretch',
    ...effects.glowSepia,
  },
  manualConfirmText: {
    fontFamily: fonts.uiMedium, fontSize: 10, letterSpacing: 2,
    color: colors.ink, fontWeight: '700',
  },
  confirmResendBtn: {
    borderWidth: 1, borderColor: colors.ash, borderRadius: 2,
    paddingVertical: 10, paddingHorizontal: 20,
    flexDirection: 'row', alignItems: 'center', gap: 6,
    marginBottom: 20,
  },
  confirmResendText: {
    fontFamily: fonts.ui, fontSize: 10, letterSpacing: 1.5, color: colors.bone,
  },
  submitDisabled: {
    opacity: 0.5,
  },
  submitLoading: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
});
