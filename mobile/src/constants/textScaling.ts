/**
 * textScaling.ts — iOS Dynamic Type Support
 * ─────────────────────────────────────────────
 * T3-15: Moved from hooks/useScaledFont.ts — not a hook, exports plain constants.
 *
 * 10/10 D-02: Respects iOS/Android accessibility font scaling settings
 * while preventing layout breakage with a max scale multiplier.
 *
 * Usage:
 *   import { scaledTextProps } from '@/src/constants/textScaling';
 *   <Text {...scaledTextProps}>Body text</Text>
 *
 *   // For decorative text (watermarks, stamps, tickers):
 *   import { decorativeTextProps } from '@/src/constants/textScaling';
 *   <Text {...decorativeTextProps}>REELHOUSE</Text>
 */

/** Props for text that should scale with system accessibility settings */
export const scaledTextProps = {
  allowFontScaling: true,
  maxFontSizeMultiplier: 1.35,  // Prevents layout breakage on max accessibility settings
} as const;

/** Props for decorative/atmospheric text (stamps, watermarks, tickers) that should NOT scale */
export const decorativeTextProps = {
  allowFontScaling: false,
} as const;

/** Props for large display text (titles, headings) with more conservative scaling */
export const displayTextProps = {
  allowFontScaling: true,
  maxFontSizeMultiplier: 1.2,  // Large text needs less scaling to remain accessible
} as const;
