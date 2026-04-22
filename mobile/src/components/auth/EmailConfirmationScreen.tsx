import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import Animated, { FadeIn, ReduceMotion } from 'react-native-reanimated';
import { colors, fonts, effects } from '@/src/theme/theme';

interface Props {
  confirmedEmail: string;
  resending: boolean;
  onResend: () => void;
  onClose: () => void;
}

export function EmailConfirmationScreen({ confirmedEmail, resending, onResend, onClose }: Props) {
  return (
    <View style={s.container}>
      <View style={s.confirmationWrap}>
        <Animated.View entering={FadeIn.duration(600).reduceMotion(ReduceMotion.Never)} style={s.confirmationContent}>
          {/* Close */}
          <TouchableOpacity
            style={s.closeBtn}
            onPress={onClose}
            hitSlop={{ top: 15, right: 15, bottom: 15, left: 15 }}
          >
            <Text style={s.closeText}>✕</Text>
          </TouchableOpacity>

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
            CHECK YOUR SPAM FOLDER IF IT DOESN'T ARRIVE WITHIN 2 MINUTES.
          </Text>

          {/* Resend button */}
          <TouchableOpacity
            style={[s.confirmResendBtn, resending && s.submitDisabled]}
            onPress={onResend}
            disabled={resending}
            activeOpacity={0.7} hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }}
          >
            {resending ? (
              <View style={s.submitLoading}>
                <ActivityIndicator size="small" color={colors.bone} />
                <Text style={s.confirmResendText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>SENDING...</Text>
              </View>
            ) : (
              <Text style={s.confirmResendText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>↻  RESEND LINK</Text>
            )}
          </TouchableOpacity>

          <Text style={s.confirmAutoNote}>
            THIS SCREEN WILL AUTOMATICALLY LOG YOU IN ONCE CONFIRMED.
          </Text>
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
  confirmResendBtn: {
    borderWidth: 1, borderColor: colors.ash, borderRadius: 2,
    paddingVertical: 10, paddingHorizontal: 20,
    flexDirection: 'row', alignItems: 'center', gap: 6,
    marginBottom: 20,
  },
  confirmResendText: {
    fontFamily: fonts.ui, fontSize: 10, letterSpacing: 1.5, color: colors.bone,
  },
  confirmAutoNote: {
    fontFamily: fonts.ui, fontSize: 7, letterSpacing: 1,
    color: colors.fog, textAlign: 'center', opacity: 0.6,
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
