import React from 'react';
import { Text } from '@/src/components/text';
import PressableScale from '@/src/components/PressableScale';
import { s } from '@/src/components/profile/profileStyles';
import { scaledTextProps } from '@/src/constants/textScaling';

/**
 * One of the four figures on the member's plate.
 *
 * The rule between cells is a left border on every cell but the first (a
 * divider drawn between them drifts once the row's contents are conditional).
 *
 * No horizontal hitSlop: overlapping targets go to the LATER sibling, so slop
 * sideways would hand the edge of FOLLOWERS to FOLLOWING. The 56pt cell is a
 * comfortable target on its own; the slop is spent on height.
 */
export const StatCard = React.memo(function StatCard({
  label, value, onPress, rule,
}: {
  label: string;
  value: string | number;
  onPress?: () => void;
  /** Draw the hairline that separates this cell from the one before it. */
  rule?: boolean;
}) {
  return (
    <PressableScale
      style={[s.statCell, rule && s.statCellRule]}
      onPress={() => { if (onPress) onPress(); }}
      disabled={!onPress}
      hitSlop={{ top: 8, bottom: 8, left: 0, right: 0 }}
      accessibilityRole={onPress ? 'button' : undefined}
      // An em dash is a mark for the eye. Read aloud it is either silence or
      // the word "dash", so the spoken figure says what the dash means.
      accessibilityLabel={`${value === '—' ? 'no' : value} ${label.toLowerCase()}`}
      haptic
    >
      <Text {...scaledTextProps} style={s.statNum} adjustsFontSizeToFit numberOfLines={1} minimumFontScale={0.6}>
        {value}
      </Text>
      <Text {...scaledTextProps} style={s.statCap} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>
        {label}
      </Text>
    </PressableScale>
  );
});
