import React from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import Animated, { FadeIn, ReduceMotion } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Mail, X } from 'lucide-react-native';
import { colors, fonts, effects } from '@/src/theme/theme';
import PressableScale from '@/src/components/PressableScale';
import { AuthBackdrop, SocietyEyebrow, HaloIcon, Est1924 } from './AuthChrome';

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
  const insets = useSafeAreaInsets();
  return (
    <View style={s.container}>
      <AuthBackdrop />

      {/* Close — pinned top-right, clear of the notch */}
      <PressableScale
        style={[s.closeBtn, { top: insets.top + 10 }]}
        onPress={onClose}
        hitSlop={{ top: 15, right: 15, bottom: 15, left: 15 }}
        haptic="light"
        accessibilityLabel="Close"
      >
        <X size={18} color={colors.bone} strokeWidth={2} />
      </PressableScale>

      <View style={s.confirmationWrap}>
        <Animated.View entering={FadeIn.duration(600).reduceMotion(ReduceMotion.Never)} style={s.confirmationContent}>
          {/* The sealed letter, waiting in candlelight — unframed */}
          <HaloIcon icon={Mail} iconSize={30} haloSize={130} style={s.iconWrap} />

          <SocietyEyebrow label="CLEARANCE PENDING" style={s.eyebrowWrap} />
          <Text style={s.confirmTitle} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>Check Your Inbox.</Text>
          <Text style={s.confirmBody}>
            {/* eslint-disable-next-line react/no-unescaped-entities */}
            We've dispatched a sealed verification link to:
          </Text>
          <View style={s.confirmEmailBox}>
            <Text style={s.confirmEmailText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6}>{confirmedEmail}</Text>
          </View>
          <Text style={s.confirmInstructions}>
            OPEN THE LINK TO COMPLETE YOUR ENROLLMENT.{"\n"}
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
              <Text style={s.manualConfirmText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>✦  I&apos;VE VERIFIED MY EMAIL</Text>
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

          <Est1924 style={s.estMark} />
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
  confirmationContent: {
    alignItems: 'center',
    width: '100%',
    maxWidth: 360,
  },
  closeBtn: {
    position: 'absolute',
    right: 24,
    zIndex: 10,
    width: 44,
    height: 44,
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  iconWrap: {
    marginBottom: 18,
  },
  eyebrowWrap: {
    marginBottom: 14,
  },
  confirmTitle: {
    fontFamily: fonts.display, fontSize: 28, color: colors.parchment,
    textAlign: 'center', lineHeight: 34, marginBottom: 16,
    ...effects.textShadowDeep,
  },
  confirmBody: {
    fontFamily: fonts.bodyItalic, fontSize: 13, color: colors.bone,
    textAlign: 'center', lineHeight: 22, marginBottom: 12,
  },
  confirmEmailBox: {
    backgroundColor: colors.soot, borderWidth: 1, borderColor: colors.sepiaBorder,
    borderRadius: 2, paddingVertical: 10, paddingHorizontal: 16,
    marginBottom: 20, alignSelf: 'stretch',
  },
  confirmEmailText: {
    fontFamily: fonts.mono, fontSize: 12, letterSpacing: 0.8,
    color: colors.flicker, textAlign: 'center',
  },
  confirmInstructions: {
    fontFamily: fonts.sub, fontSize: 8, letterSpacing: 1,
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
    fontFamily: fonts.sub, fontSize: 11, letterSpacing: 2,
    color: colors.ink,
  },
  confirmResendBtn: {
    borderWidth: 1, borderColor: colors.ash, borderRadius: 2,
    paddingVertical: 10, paddingHorizontal: 20,
    flexDirection: 'row', alignItems: 'center', gap: 6,
    marginBottom: 24,
  },
  confirmResendText: {
    fontFamily: fonts.sub, fontSize: 10, letterSpacing: 1.5, color: colors.bone,
  },
  estMark: {
    marginTop: 4,
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
