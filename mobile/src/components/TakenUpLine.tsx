/**
 * TakenUpLine — the line over words the member did not just type: a draft the room took up.
 *
 * Quiet: it is not an alert and it is not chrome the room keeps; the room lets it go on the
 * first keystroke. `space-between` so START CLEAN sits at the measure's edge, where every other
 * trailing act in this app sits. One line for every writing room (the Dispatch's desks, Edit
 * Profile), so a draft taken up reads the same wherever it was kept.
 */
import React from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { Text } from '@/src/components/text';
import PressableScale from '@/src/components/PressableScale';
import { WEEKDAYS, hourLabel } from '@/src/components/dispatch/dayLabel';
import { scaledTextProps } from '@/src/constants/textScaling';
import { colors, fonts } from '@/src/theme/theme';

/**
 * When a draft was kept, as the room says it: `TUESDAY · 21:40`, from the app's own tables.
 * Empty for a time that cannot be read: the line names none rather than inventing one.
 *
 * NEVER `Intl` — it is not in Hermes and this app ships no polyfill, so a
 * `toLocaleString` would work in every test and throw on a device.
 */
export const whenKept = (iso: string): string => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${WEEKDAYS[d.getDay()]} · ${hourLabel(iso)}`;
};

export function TakenUpLine({ savedAt, unreadable = false, onStartClean, style }: {
  /** When the draft was kept; null or empty for a draft kept with no time. */
  savedAt?: string | null;
  /** What was kept could not be read, and the room has cleared it: said, with nothing to undo. */
  unreadable?: boolean;
  onStartClean: () => void;
  style?: StyleProp<ViewStyle>;
}) {
  const when = savedAt ? whenKept(savedAt) : '';
  return (
    <View
      style={[s.row, style]}
      accessible
      accessibilityRole="summary"
      accessibilityLabel={unreadable
        ? 'What was here could not be read. The room has cleared it.'
        : `Taken up where you left it${when ? `, ${when}` : ''}.`}
    >
      <Text style={[s.text, unreadable && s.lost]} {...scaledTextProps}>
        {unreadable ? 'WHAT WAS HERE COULD NOT BE READ' : `TAKEN UP WHERE YOU LEFT IT${when ? ` · ${when}` : ''}`}
      </Text>
      {unreadable ? null : (
        <PressableScale
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          haptic="selection"
          onPress={onStartClean}
          accessibilityRole="button"
          accessibilityLabel="Start clean, and discard what was here"
        >
          <Text style={s.act} {...scaledTextProps}>START CLEAN</Text>
        </PressableScale>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  row: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    gap: 12, marginBottom: 14, paddingBottom: 10, paddingHorizontal: 24,
    borderBottomWidth: 1, borderBottomColor: 'rgba(184,137,26,0.16)',
  },
  text: {
    flexShrink: 1, fontFamily: fonts.sub, fontSize: 10, letterSpacing: 1.2,
    color: colors.sepia, includeFontPadding: false,
  },
  /** Crimson, because this one is a loss rather than a courtesy. */
  lost: { color: colors.crimsonInk },
  act: {
    fontFamily: fonts.sub, fontSize: 10, letterSpacing: 1.2,
    color: colors.parchment, includeFontPadding: false,
  },
});
