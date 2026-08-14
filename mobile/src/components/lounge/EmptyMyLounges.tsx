// eslint-disable-next-line @typescript-eslint/no-unused-vars
import React, { useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { MessageCircle, Plus } from 'lucide-react-native';
import { colors, fonts } from '@/src/theme/theme';
import PressableScale from '@/src/components/PressableScale';
import { OrnamentalRule } from '@/src/components/theme/OrnamentalRule';
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { CreateLoungeSheet } from './CreateLoungeSheet';

export function EmptyMyLounges({ onEstablishPress }: { onEstablishPress: () => void }) {
  return (
    <Animated.View entering={FadeInDown.duration(600).delay(200)} style={s.emptyHero}>
      <View style={s.emptyCrestWrap}>
        <MessageCircle size={32} color={colors.sepia} strokeWidth={1} />
      </View>
      <Text style={s.emptyTitle}>The Velvet Seats Await</Text>
      <OrnamentalRule />
      <Text style={s.emptyDesc}>
        Every great filmmaker started with a conversation.{'\n'}
        Open your own screening room or take a seat{'\n'}
        in a public salon below.
      </Text>

      {/* Improvement #5: Add "Establish Salon" CTA directly to the empty state */}
      <PressableScale
        style={s.ctaBtn}
        onPress={onEstablishPress}
        haptic="medium"
        accessibilityRole="button"
        accessibilityLabel="Establish a new salon"
      >
        <Plus size={12} color={colors.ink} strokeWidth={2.5} />
        <Text style={s.ctaBtnText}>[ ESTABLISH SALON ]</Text>
      </PressableScale>
    </Animated.View>
  );
}

const s = StyleSheet.create({
  emptyHero: {
    alignItems: 'center',
    paddingHorizontal: 44,
    paddingVertical: 52,
    marginBottom: 8,
  },
  emptyCrestWrap: {
    width: 64,
    height: 64,
    borderRadius: 32,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(184,137,26,0.2)',
    backgroundColor: 'rgba(184,137,26,0.03)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 18,
  },
  emptyTitle: {
    fontFamily: fonts.display,
    fontSize: 15,
    color: colors.parchment,
    textAlign: 'center',
  },
  emptyDesc: {
    fontFamily: fonts.body,
    fontSize: 10,
    color: colors.fog,
    lineHeight: 16,
    textAlign: 'center',
    // 0.7 was 3.75:1. 0.8 = 4.59:1.
    opacity: 0.8,
    marginBottom: 24,
  },
  ctaBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    backgroundColor: colors.sepia,
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 2,
  },
  ctaBtnText: {
    fontFamily: fonts.sub,
    fontSize: 9,
    letterSpacing: 2.5,
    color: colors.ink,
    includeFontPadding: false,
  },
});
