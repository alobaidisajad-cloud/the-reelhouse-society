/**
 * The room the keyboard takes.
 * ─────────────────────────────────────────────────────────────────────────────
 * Every desk ended with this:
 *
 *     <View style={p.kbd}><Text style={p.kbdLabel}>KEYBOARD</Text></View>
 *
 * — a 210pt block with the word KEYBOARD in it. That is a DRAWING device: it
 * exists so a mockup shows the composer at the height it really occupies. Two
 * of the four desks that render it are mounted by the app, so the app shipped a
 * dark rectangle labelled KEYBOARD.
 *
 * A contrast sweep found it at 2.71:1 and I went looking for why a label was
 * that quiet; it was quiet because it was never meant to be read by anybody.
 *
 * ── AND IT WAS NOT DOING THE JOB EITHER ────────────────────────────────────
 * A fixed 210pt is not keyboard avoidance. The keyboard is a system overlay of
 * a height nobody can know in advance, so a constant either leaves a gap or
 * leaves the tool rail underneath it. On these desks the rail carries FILM,
 * STILL, SPOILER and the character counter — everything except FILE IT, which
 * lives in the header and is why this was survivable rather than obvious.
 *
 * So in the app this reserves the keyboard's REAL height, the same way
 * `compose.tsx` already does for the dossier, and in the harness — where there
 * is no keyboard and no handler — it draws the block the design expects.
 */
import { memo } from 'react';
import { Platform, Text, View } from 'react-native';
import Animated, { useAnimatedKeyboard, useAnimatedStyle } from 'react-native-reanimated';

import { p } from './paperStyles';
import { decorativeTextProps } from '@/src/constants/textScaling';

export const PaperKeyWell = memo(function PaperKeyWell({ drawn }: { drawn?: boolean }) {
  // Hooks run unconditionally; only what is RENDERED differs.
  const keyboard = useAnimatedKeyboard();
  const room = useAnimatedStyle(() => ({
    // iOS only, matching `compose.tsx`: Android's window resize handles the
    // keyboard natively, and padding for it there would double the inset.
    height: Platform.OS === 'ios' ? keyboard.height.value : 0,
  }));

  if (drawn) {
    return (
      <View style={p.kbd}>
        <Text style={p.kbdLabel} {...decorativeTextProps}>KEYBOARD</Text>
      </View>
    );
  }
  return <Animated.View style={room} pointerEvents="none" />;
});
