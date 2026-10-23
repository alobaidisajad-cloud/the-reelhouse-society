/**
 * unready.ts — a control that cannot act yet, drawn hollow, never faded.
 * ─────────────────────────────────────────────────────────────────────────────
 * Nothing chosen, nothing written, a form not filled: the button is still there and still
 * says what it will do. Faded to a third of itself, its ink on brass fell to about 1.5:1
 * and its own words could not be read. Hollow, its frame says "not yet" and its words stay
 * in fog, 6.7:1 on the house's ink; it fills the moment it can act.
 *
 * A control at work (sending, saving) is not unready: it stays filled and says what it is
 * doing. A filled button carries a transparent border of the same width, so filling it
 * moves nothing.
 */
import { StyleSheet } from 'react-native';
import { colors } from './theme';

export const UNREADY = StyleSheet.create({
  /** On the button: the fill taken away, the brass frame left. */
  plate: { backgroundColor: 'transparent', borderWidth: 1, borderColor: colors.sepiaBorderStrong, shadowOpacity: 0, elevation: 0 },
  /** On its words, and an icon's colour: fog, where ink on brass was. */
  words: { color: colors.fog },
});

/** The colour an icon takes when its button is unready. */
export const UNREADY_INK = colors.fog;

/**
 * A mark of the member's not yet read (a certification, a save, a seen film): the stamp's
 * outline before the ink, its line broken. A strokeDasharray in icon units, 24 wide.
 */
export const UNINKED = '2.4 2.2';
