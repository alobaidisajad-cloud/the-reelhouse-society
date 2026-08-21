/**
 * Toggle — the app's one switch.
 *
 * Lifted out of the settings feature when the profile's Dossier Bureau needed
 * its first switch. A second implementation would have drifted: this one
 * already carries two fixes that took finding.
 *
 * ── ios_backgroundColor ──────────────────────────────────────────────────────
 * On iOS `trackColor.false` maps to UISwitch's `tintColor`, which colours the
 * OUTLINE only; the fill stays the system default. So an off switch rendered as
 * a bright light-grey pill on the app's darkest surfaces, while the same switch
 * on Android was dark brass — two platforms, two different apps.
 * `ios_backgroundColor` sets the actual fill, and they finally agree.
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
