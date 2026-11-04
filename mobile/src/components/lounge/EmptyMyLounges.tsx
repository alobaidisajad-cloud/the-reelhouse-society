/**
 * The Lounge's states, on the house's soot: a member with no salon of their own (The Velvet Seats
 * Await), a search the directory has nothing for (worded truly when the member's own salons did
 * match), a corridor with no open salon, the salons not reachable, and the still frames shown
 * while they are read (nothing loops).
 */
import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Text } from '@/src/components/text';
import PressableScale from '@/src/components/PressableScale';
import { EmptyOffline } from '@/src/components/EmptyStates';
import { KeyRound } from 'lucide-react-native';
import { colors, fonts } from '@/src/theme/theme';
import { scaledTextProps, displayTextProps } from '@/src/constants/textScaling';
import { UNSPOKEN } from '@/src/components/dispatch/paper/paperMetrics';
import { useStateSaid } from '@/src/hooks/useStateSaid';
import { CORRIDOR } from './corridor';
import { FrameSides } from './PublicLoungeCard';

/** A state of the corridor: its title, a brass rule, what it means, and the one way on. */
export function CorridorState({ title, words, act }: {
  title: string;
  words: string;
  act?: { label: string; spoken: string; onPress: () => void; roped?: boolean };
}) {
  return (
    <View style={s.state}>
      <Text style={s.title} {...displayTextProps} accessibilityRole="header">{title}</Text>
      <View style={s.rule} {...UNSPOKEN} />
      <Text style={s.words} {...scaledTextProps}>{words}</Text>
      {act ? (
        <PressableScale style={s.button} onPress={act.onPress} haptic="medium" hitSlop={null} accessibilityRole="button" accessibilityLabel={act.spoken}>
          {act.roped ? <KeyRound size={13} color={colors.sepia} /> : null}
          <Text style={s.buttonWord} {...scaledTextProps}>{act.label}</Text>
        </PressableScale>
      ) : null}
    </View>
  );
}

/** No salon of the member's own: the way to open one, or the rope to it. */
export const EmptyMyLounges = React.memo(function EmptyMyLounges({ onEstablishPress, held }: { onEstablishPress: () => void; held: boolean }) {
  useStateSaid('empty', 'The Velvet Seats Await');
  return (
    <CorridorState
      title="The Velvet Seats Await"
      words="Every great filmmaker started with a conversation. Open your own screening room or take a seat in a public salon below."
      act={{
        label: '[ ESTABLISH SALON ]',
        spoken: held ? 'Establish salon' : 'Establish salon. The Archivist opens this. Opens the Society.',
        onPress: onEstablishPress,
        roped: !held,
      }}
    />
  );
});

/** The salons could not be read, and nothing is held: said, with TRY AGAIN. */
export const CorridorUnreached = React.memo(function CorridorUnreached({ onRetry }: { onRetry: () => void }) {
  return (
    <View style={[s.state, s.unreached]}>
      <EmptyOffline onRetry={onRetry} />
    </View>
  );
});

/** While the salons are read: three still cards on the rail, four still rows in the directory. */
export const RailReading = React.memo(function RailReading({ width }: { width: number }) {
  return (
    <View style={s.rail} {...UNSPOKEN}>
      {[0, 1, 2].map((i) => (
        <View key={i} style={[s.card, { width }]}>
          <View style={s.cover} />
          <View style={s.cardBody}>
            <View style={[s.bar, { height: 14, width: '80%' }]} />
            <View style={[s.bar, { height: 10, width: '50%' }]} />
          </View>
        </View>
      ))}
    </View>
  );
});

export const RowReading = React.memo(function RowReading() {
  return (
    <View style={s.row} {...UNSPOKEN}>
      <FrameSides />
      <View style={[s.bar, s.thumb]} />
      <View style={s.rowWords}>
        <View style={[s.bar, { height: 14, width: '60%' }]} />
        <View style={[s.bar, { height: 10, width: '85%', marginTop: 9 }]} />
        <View style={[s.bar, { height: 10, width: '40%', marginTop: 12 }]} />
      </View>
    </View>
  );
});

const s = StyleSheet.create({
  state: { marginTop: 12, backgroundColor: colors.soot, borderRadius: CORRIDOR.radius, paddingTop: 26, paddingHorizontal: 22, paddingBottom: 24, alignItems: 'center' },
  unreached: { marginTop: 24 },
  title: { fontFamily: fonts.display, fontSize: 19, lineHeight: 25, color: colors.parchment, textAlign: 'center' },
  rule: { width: 60, height: StyleSheet.hairlineWidth * 2, marginVertical: 12, backgroundColor: 'rgba(184,137,26,0.45)' },
  words: { fontFamily: fonts.bodyItalic, fontSize: 13, lineHeight: 20, color: colors.bone, textAlign: 'center' },
  button: {
    marginTop: 16, minHeight: 48, paddingHorizontal: 22, flexDirection: 'row', gap: 8, justifyContent: 'center', alignItems: 'center',
    borderWidth: 1, borderColor: colors.sepia, borderRadius: 3,
  },
  buttonWord: { fontFamily: fonts.sub, fontSize: 11, letterSpacing: 3, color: colors.sepia, includeFontPadding: false },
  rail: { flexDirection: 'row', gap: CORRIDOR.gap, marginTop: 12, overflow: 'hidden', marginRight: -CORRIDOR.page },
  card: { height: 206, backgroundColor: colors.soot, borderRadius: CORRIDOR.radius, overflow: 'hidden' },
  cover: { height: 105, backgroundColor: colors.surfaceRaised },
  cardBody: { padding: 11, gap: 8 },
  bar: { backgroundColor: colors.surfaceRaised, borderRadius: 2 },
  row: { flexDirection: 'row', gap: 12, paddingVertical: 14, paddingHorizontal: 20, backgroundColor: colors.soot },
  thumb: { width: 52, height: 52, borderRadius: 4 },
  rowWords: { flex: 1 },
});
