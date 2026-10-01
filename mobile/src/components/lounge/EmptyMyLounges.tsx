import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Text } from '@/src/components/text';
import { MessageCircle, Plus } from 'lucide-react-native';
import { colors, fonts } from '@/src/theme/theme';
import PressableScale from '@/src/components/PressableScale';
import { OrnamentalRule } from '@/src/components/theme/OrnamentalRule';
import { Arrive } from '@/src/components/Arrive';

/**
 * `held`: the member may found a salon. Without it ESTABLISH opens the rope
 * (the caller's `onEstablishPress`), and says so before it is pressed.
 */
export function EmptyMyLounges({ onEstablishPress, held }: { onEstablishPress: () => void; held: boolean }) {
  return (
    <Arrive name="lounge.empty" duration={600} delay={200} style={s.emptyHero}>
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

      <PressableScale
        style={s.ctaBtn}
        onPress={onEstablishPress}
        haptic="medium"
        accessibilityRole="button"
        accessibilityLabel={held
          ? 'Establish a new salon'
          : 'Establish a new salon. The Archivist opens this. Opens the Society.'}
      >
        <Plus size={12} color={colors.ink} strokeWidth={2.5} />
        <Text style={s.ctaBtnText}>[ ESTABLISH SALON ]</Text>
      </PressableScale>
    </Arrive>
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
    color: colors.fogQuiet,
    lineHeight: 16,
    textAlign: 'center',
    // Solid, not dimmed: fog at 0.8 scraped 4.59:1 on the old black and failed
    // on a lit card. fogQuiet is the quieter tone as a colour of its own.
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
    fontSize: 10,
    letterSpacing: 2,
    color: colors.ink,
    includeFontPadding: false,
  },
});
