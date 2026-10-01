/**
 * Toggle — the app's one switch, so no second one drifts from it.
 *
 * ── ios_backgroundColor ──────────────────────────────────────────────────────
 * On iOS `trackColor.false` maps to UISwitch's `tintColor`, which colours the
 * OUTLINE only: an off switch would be a bright grey pill on the darkest
 * surfaces while Android's is dark brass. `ios_backgroundColor` sets the fill,
 * so the two platforms agree.
 *
 * ── the label ────────────────────────────────────────────────────────────────
 * A Switch with no accessibilityLabel announces "off, switch" and never WHICH
 * switch. The label is required here for that reason, not optional.
 */
import { Switch } from 'react-native';
import TactileEngine from '@/src/utils/TactileEngine';
import { colors } from '@/src/theme/theme';

const OFF_TRACK = 'rgba(184,137,26,0.12)';

export function Toggle({ active, onToggle, disabled, label }: {
  active: boolean;
  onToggle: () => void;
  disabled?: boolean;
  /** Required: a nameless switch is unusable to a screen reader. */
  label: string;
}) {
  return (
    <Switch
      value={active}
      disabled={disabled}
      onValueChange={() => { TactileEngine.selection(); onToggle(); }}
      trackColor={{ false: OFF_TRACK, true: colors.sepia }}
      ios_backgroundColor={OFF_TRACK}
      thumbColor={active ? colors.parchment : colors.fog}
      accessibilityLabel={label}
      accessibilityRole="switch"
      accessibilityState={{ checked: active, disabled: !!disabled }}
    />
  );
}

export default Toggle;
