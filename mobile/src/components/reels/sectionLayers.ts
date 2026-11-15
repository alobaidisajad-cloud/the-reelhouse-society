/**
 * sectionLayers — the Reels screen's two sections, logs and stacks, crossfaded.
 *
 * Both layers stay mounted; pointerEvents gives the touches to the chosen one at
 * once, and their opacity crossfades in CROSSFADE_MS. Once it is over, each layer
 * is drawn with SHOWN or HIDDEN, plain styles, so what a member sees is always
 * what they touch, whether or not the crossfade's animated style reached its view.
 */
export const CROSSFADE_MS = 300;
export const SHOWN = { opacity: 1 } as const;
export const HIDDEN = { opacity: 0 } as const;
/**
 * The layer not chosen is out of a screen reader's reach as well as out of sight: on Android an
 * unseen view (opacity 0, no touches) is still read, and TalkBack walked a second title, switch and
 * search field over the section shown.
 */
export const heardIf = (chosen: boolean) => (chosen
  ? { importantForAccessibility: 'auto' as const, accessibilityElementsHidden: false }
  : { importantForAccessibility: 'no-hide-descendants' as const, accessibilityElementsHidden: true });
