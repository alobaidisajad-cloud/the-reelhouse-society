import React, { memo } from 'react';
import { View, StyleSheet } from 'react-native';
import { Text } from '@/src/components/text';
import { colors, fonts } from '@/src/theme/theme';
import PressableScale from '@/src/components/PressableScale';
import { scaledTextProps, displayTextProps } from '@/src/constants/textScaling';
import { FRAME, FRAME_RADIUS } from '@/src/components/feed/frame/metrics';
import { ReelSection, FeedFilter } from './types';

// ══════════════════════════════════════════════════════════════
//  THE TITLE CARD — the Reel's first frame
//
//  The same stock as every frame below it, with the inset rule of a silent film's title card:
//  what the reel is, its name, and at its foot the two reels it holds. The section switch is the
//  card's own foot, the chosen half marked by a line along its top. Each list draws its own (both
//  stay mounted for the crossfade), and both draw the SAME elements, so the card is identical in
//  height on either tab and nothing below it jumps.
//
//  There is deliberately no count here. Both feeds are paginated: a length is a page, never the
//  society's total. The card carries state, not statistics.
// ══════════════════════════════════════════════════════════════
export const SharedReelHeader = memo(function SharedReelHeader({
  section, onTabSwitch,
}: {
  section: ReelSection;
  onTabSwitch: (t: ReelSection) => void;
}) {
  return (
    <View style={st.card}>
      <View style={st.rule} pointerEvents="none" />
      <Text style={st.kicker} {...scaledTextProps}>THE LIVING RECORD</Text>
      <Text style={st.title} {...displayTextProps} accessibilityRole="header">The Reel</Text>
      <View style={st.switch} accessibilityRole="tablist">
        <SwitchHalf label="LOGS" on={section === 'logs'} onPress={() => onTabSwitch('logs')} />
        <SwitchHalf label="STACKS" on={section === 'stacks'} onPress={() => onTabSwitch('stacks')} />
      </View>
    </View>
  );
});

const SwitchHalf = memo(function SwitchHalf({ label, on, onPress }: { label: string; on: boolean; onPress: () => void }) {
  // Two halves flush: a halo would reach the other half, so none.
  return (
    <PressableScale room hitSlop={null} style={st.half} onPress={onPress} haptic="light" testID={`reel-switch-${label.toLowerCase()}`}
      accessibilityRole="tab" accessibilityLabel={label === 'LOGS' ? 'Logs' : 'Stacks'} accessibilityState={{ selected: on }}>
      {on ? <View style={st.halfMark} /> : null}
      <Text style={[st.halfText, on && st.halfTextOn]} {...scaledTextProps}>{label}</Text>
    </PressableScale>
  );
});

// ══════════════════════════════════════════════════════════════
//  THE SELECTOR — which reel the frames below are cut from
//
//  Two words and a hairline under the card. The live lamp sits on the chosen one: the wire is
//  what's live, so the light belongs on it, lit and still (a lamp that blinked was noise).
// ══════════════════════════════════════════════════════════════
/** How each of the selector's words is said aloud. */
const SAID: Record<string, string> = { 'MAIN REEL': 'Main reel', 'ALL STACKS': 'All stacks', FOLLOWING: 'Following' };

export const ReelSelector = memo(function ReelSelector({ first, value, onChange }: {
  /** The house's whole reel: MAIN REEL on the logs, ALL STACKS on the stacks. */
  first: 'MAIN REEL' | 'ALL STACKS';
  value: FeedFilter;
  onChange: (f: FeedFilter) => void;
}) {
  return (
    <View style={st.selector} accessibilityRole="tablist">
      <SelectorWord label={first} on={value === 'all'} onPress={() => onChange('all')} />
      <View style={st.selectorRule} />
      <SelectorWord label="FOLLOWING" on={value === 'following'} onPress={() => onChange('following')} />
    </View>
  );
});

const SelectorWord = memo(function SelectorWord({ label, on, onPress }: { label: string; on: boolean; onPress: () => void }) {
  // Two words a hairline apart: a halo would reach the other word, so none; each is 48 tall.
  return (
    <PressableScale room hitSlop={null} style={st.word} onPress={onPress}
      accessibilityRole="tab" accessibilityLabel={SAID[label] ?? label} accessibilityState={{ selected: on }}>
      {on ? <View style={st.lamp} /> : null}
      <Text style={[st.wordText, on && st.wordTextOn]} {...scaledTextProps}>{label}</Text>
    </PressableScale>
  );
});

const st = StyleSheet.create({
  card: {
    marginHorizontal: FRAME.margin, marginTop: 8, paddingTop: 22, paddingHorizontal: 18,
    backgroundColor: colors.soot, borderRadius: FRAME_RADIUS, alignItems: 'center',
  },
  // The title card's inset rule, 6 in from the frame's edge.
  rule: {
    position: 'absolute', top: 6, left: 6, right: 6, bottom: 6,
    borderWidth: 1, borderColor: 'rgba(184,137,26,0.26)', borderRadius: 5,
  },
  kicker: { fontFamily: fonts.sub, fontSize: 10, letterSpacing: 5, color: colors.sepia, textAlign: 'center', includeFontPadding: false },
  title: { fontFamily: fonts.display, fontSize: 36, lineHeight: 42, color: colors.silverScreen, textAlign: 'center', marginTop: 6 },
  // The card's foot: the switch spans the inset rule's width, above its lower line.
  switch: {
    alignSelf: 'stretch', flexDirection: 'row', marginTop: 14, marginHorizontal: -12, paddingBottom: 6,
    borderTopWidth: 1, borderTopColor: 'rgba(184,137,26,0.16)',
  },
  half: { flex: 1, minHeight: 48, justifyContent: 'center', alignItems: 'center' },
  halfMark: { position: 'absolute', top: -1, left: 0, right: 0, height: 2, backgroundColor: colors.sepia },
  halfText: { fontFamily: fonts.sub, fontSize: 12, letterSpacing: 4, color: colors.fog, includeFontPadding: false },
  halfTextOn: { color: colors.sepia },

  selector: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', alignItems: 'center', marginHorizontal: FRAME.margin },
  selectorRule: { width: 1, height: 16, backgroundColor: 'rgba(184,137,26,0.25)' },
  word: { minHeight: 48, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', gap: 8 },
  lamp: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.sepia },
  wordText: { fontFamily: fonts.sub, fontSize: 11, letterSpacing: 2.4, color: colors.fog, includeFontPadding: false },
  wordTextOn: { color: colors.parchment },
});
