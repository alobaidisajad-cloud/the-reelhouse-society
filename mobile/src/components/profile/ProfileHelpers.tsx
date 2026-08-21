import React from 'react';
import { Text } from 'react-native';
import PressableScale from '@/src/components/PressableScale';
import { s } from '@/src/components/profile/profileStyles';

/**
 * One of the four figures on the member's plate.
 *
 * ── THE RULE MOVED FROM A SIBLING TO A BORDER ────────────────────────────────
 * The divider used to be a 1.5pt View emitted BETWEEN cards from inside a
 * fragment, driven by an `isLast` flag. That works right up until the row's
 * contents become conditional, at which point "last" and "actually last" part
 * company. A left border on every cell but the first cannot drift.
 *
 * ── WHY THERE IS NO HORIZONTAL hitSlop ───────────────────────────────────────
 * PressableScale gives 15pt on every side when the prop is absent, and adjacent
 * touch targets that overlap resolve in favour of the LATER sibling. Four cells
 * in a row meant the right-hand 15pt of FOLLOWERS actually belonged to
 * FOLLOWING — a member tapping the edge of one count opened the other list. The
 * cell is 56pt tall and already a comfortable target on its own; the slop is
 * spent on height, where there is nothing to collide with.
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
      <Text style={s.statNum} adjustsFontSizeToFit numberOfLines={1} minimumFontScale={0.6}>
        {value}
      </Text>
      <Text style={s.statCap} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>
        {label}
      </Text>
    </PressableScale>
  );
});
