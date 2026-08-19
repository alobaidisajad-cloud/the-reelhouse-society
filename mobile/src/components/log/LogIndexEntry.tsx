import React from 'react';
import { View, Text } from 'react-native';
import { KeyRound } from 'lucide-react-native';

import { colors } from '@/src/theme/theme';
import PressableScale from '@/src/components/PressableScale';
import { scaledTextProps } from '@/src/constants/textScaling';
import { st } from './LogModalStyles';

/**
 * One line in the record's index.
 *
 * The clerical half of this page used to be twelve permanently-unfolded fields.
 * Each is now a catalogue entry that states what it HOLDS and opens in place —
 * so the page at rest reads as the record's own index rather than a form.
 *
 * ── THE MARK ────────────────────────────────────────────────────────────────
 * One glyph carries two facts:
 *   · a dot, hollow when the entry is empty and filled when it holds something
 *   · a KEY when the member's rank does not open it
 * and its COLOUR is the rank the capability comes from, never the rank of the
 * member looking — brass is Archivist, crimson is Auteur, parchment is the
 * record itself. The Vault is brass whether you hold it or not.
 *
 * ── WHY A KEY AND NOT A PADLOCK ─────────────────────────────────────────────
 * The app already decided: `KeyRound` marks a thing you lack clearance for in
 * the nav bar, the film row and the feed deck. A members' club has keys.
 */
export interface LogIndexEntryProps {
  name: string;
  /** What it holds, shown at the right. Empty string when it holds nothing. */
  value?: string;
  /** The rank this capability comes from — decides the colour, always. */
  origin?: 'base' | 'archivist' | 'auteur';
  /** The rank's name, when the member cannot open it. */
  lockedTo?: string;
  open?: boolean;
  onPress: () => void;
  children?: React.ReactNode;
}

const TINT = {
  base: colors.parchmentDim,
  archivist: colors.sepia,
  auteur: colors.crimson,
} as const;

export default React.memo(function LogIndexEntry({
  name, value, origin = 'base', lockedTo, open, onPress, children,
}: LogIndexEntryProps) {
  const tint = TINT[origin];
  const locked = !!lockedTo;

  return (
    <View>
      <PressableScale
        style={st.idxEntry}
        onPress={onPress}
        // The rows are FLUSH — a hairline between them and no gap at all — so an
        // entry claims nothing vertically; there is no space to halve, and any
        // claim would land on the row above or below, where the later one wins.
        //
        // (This comment used to say the rows were "44pt apart". They never were:
        // the row was 37pt tall and butted against its neighbours. The number
        // was an assumption, and it hid the real defect — 37pt of reach, under
        // both platforms' floors. `idxEntry` now carries minHeight: 48, which is
        // the only fix, since neither accessibility layer can see a halo.)
        hitSlop={{ top: 0, bottom: 0, left: 20, right: 20 }}
        haptic="selection"
        pressedScale={0.99}
        accessibilityRole="button"
        accessibilityState={{ expanded: !!open }}
        accessibilityLabel={locked ? `${name}. Opens with ${lockedTo}.` : `${name}${value ? `, ${value}` : ', empty'}`}
      >
        {locked ? (
          <KeyRound size={11} color={tint} strokeWidth={2} />
        ) : (
          <View style={[st.idxDot, { borderColor: tint }, !!value && { backgroundColor: tint }]} />
        )}
        <Text style={[st.idxName, { color: tint }]} numberOfLines={1} {...scaledTextProps}>{name}</Text>
        <Text
          style={[st.idxValue, locked && { color: tint, opacity: 0.8 }]}
          numberOfLines={1}
          {...scaledTextProps}
        >
          {locked ? lockedTo : (value || '—')}
        </Text>
      </PressableScale>
      {open && children}
    </View>
  );
});
