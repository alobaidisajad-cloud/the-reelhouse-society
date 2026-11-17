/**
 * The choice beside DELETE ACCOUNT: whether what the member wrote for others goes with the account.
 *
 * Off unless the member turns it on, every time Settings opens (it is never kept): left off, the
 * critiques, filings and salon messages stay, unsigned; on, the house takes them down in the same
 * act (request_account_deletion's p_erase_writing). It is a checkbox, not the app's switch, because
 * it is no setting that stays: it says what the next DELETE includes, and nothing until then.
 * The whole row is the control, 48 tall at least, and says its name and whether it is checked.
 */
import { View, StyleSheet } from 'react-native';
import { Check } from 'lucide-react-native';
import { Text } from '@/src/components/text';
import PressableScale from '@/src/components/PressableScale';
import { colors, fonts } from '@/src/theme/theme';
import { scaledTextProps } from '@/src/constants/textScaling';
import { ERASE_CHOICE_DESC, ERASE_CHOICE_LABEL } from '@/src/features/settings/deleteAccountWords';

export function EraseWritingChoice({ checked, onToggle }: { checked: boolean; onToggle: () => void }) {
  return (
    <PressableScale
      style={es.row}
      onPress={onToggle}
      hitSlop={null}
      haptic="selection"
      pressedScale={0.98}
      accessibilityRole="checkbox"
      accessibilityLabel={ERASE_CHOICE_LABEL}
      accessibilityHint={ERASE_CHOICE_DESC}
      accessibilityState={{ checked }}
    >
      <View style={es.words}>
        <Text style={es.label} {...scaledTextProps}>{ERASE_CHOICE_LABEL}</Text>
        <Text style={es.desc} {...scaledTextProps}>{ERASE_CHOICE_DESC}</Text>
      </View>
      <View style={[es.box, checked && es.boxOn]}>
        {checked && <Check size={13} color={colors.ink} strokeWidth={3} />}
      </View>
    </PressableScale>
  );
}

export const es = StyleSheet.create({
  // The row's own geometry reaches 48: no halo, which no screen reader reads.
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 16, paddingHorizontal: 16, paddingVertical: 14, minHeight: 48,
    borderBottomWidth: 1, borderBottomColor: 'rgba(184,137,26,0.1)',
  },
  words: { flex: 1 },
  label: { fontFamily: fonts.sub, fontSize: 12, color: colors.bone, marginBottom: 4, includeFontPadding: false },
  desc: { fontFamily: fonts.body, fontSize: 11, color: colors.fog, lineHeight: 16 },
  // Drawn in fog, so the empty box stands out from the card (6.68:1 on ink); checked, in the
  // danger card's crimson, the colour of what it adds to the deletion.
  box: { width: 22, height: 22, borderWidth: 1.5, borderColor: colors.fog, borderRadius: 3, alignItems: 'center', justifyContent: 'center' },
  boxOn: { backgroundColor: colors.crimsonInk, borderColor: colors.crimsonInk },
});
