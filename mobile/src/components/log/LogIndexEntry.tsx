import React from 'react';
import { View } from 'react-native';
import { Text } from '@/src/components/text';
import { KeyRound } from 'lucide-react-native';

import { colors } from '@/src/theme/theme';
import PressableScale from '@/src/components/PressableScale';
import { scaledTextProps } from '@/src/constants/textScaling';
import { st } from './LogModalStyles';

/**
 * One line in the record's index.
 *
 * The clerical half of this page is a catalogue: each entry states what it
 * HOLDS and opens in place, so the page at rest reads as the record's own index
 * rather than a form.
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

/** The MARK's colour — the key and the dot. Pigment reads as a shape. */
const TINT = {
  base: colors.parchmentDim,
  archivist: colors.sepia,
  auteur: colors.crimson,
} as const;

/**
 * The WORDS' colour — the entry's name and what it is locked to: the inks of
 * the same families, which clear on the card where the crimson PIGMENT (2.78:1)
 * would not.
 */
const INK = {
  base: colors.parchmentDim,
  archivist: colors.sepia,
  auteur: colors.crimsonInk,
} as const;

export default React.memo(function LogIndexEntry({
  name, value, origin = 'base', lockedTo, open, onPress, children,
}: LogIndexEntryProps) {
  const tint = TINT[origin];
  const ink = INK[origin];
  const locked = !!lockedTo;

  return (
    <View>
      <PressableScale
        style={st.idxEntry}
        onPress={onPress}
        // The rows are FLUSH — a hairline between them and no gap at all — so an
        // entry claims nothing vertically; there is no space to halve, and any
        // claim would land on the row above or below, where the later one wins.
        // Its reach is its own box: `idxEntry` carries minHeight: 48, since
        // neither accessibility layer can see a halo.
        hitSlop={{ top: 0, bottom: 0, left: 20, right: 20 }}
        haptic="selection"
        pressedScale={0.99}
        accessibilityRole="button"
        accessibilityState={{ expanded: !!open }}
        // A value of blank space marks an entry that holds something it will not
        // show (the Vault): said as "holds something", never read as nothing.
        accessibilityLabel={locked ? `${name}. Opens with ${lockedTo}.`
          : value?.trim() ? `${name}, ${value}` : value ? `${name}, holds something` : `${name}, empty`}
      >
        {locked ? (
          <KeyRound size={11} color={tint} strokeWidth={2} />
        ) : (
          <View style={[st.idxDot, { borderColor: tint }, !!value && { backgroundColor: tint }]} />
        )}
        <Text style={[st.idxName, { color: ink }]} numberOfLines={1} {...scaledTextProps}>{name}</Text>
        <Text
          style={[st.idxValue, locked && { color: ink }]}
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
