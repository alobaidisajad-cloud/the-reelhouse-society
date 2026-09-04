/**
 * FlashList v2.0.2 Type Augmentation
 *
 * FlashList v2 dropped several props from its own interface. Rather than editing
 * ~22 call sites, this re-declares them so those sites still typecheck.
 *
 * ── THIS FILE USED TO CALL ALL OF THEM "NO-OPS", AND THAT WAS WRONG ─────────
 * Three of them still work. `RecyclerView.js` destructures the props it handles
 * itself and spreads EVERYTHING ELSE onto its inner ScrollView:
 *
 *     <CompatScrollView {...rest} horizontal ref onScroll … />
 *
 * So `keyboardShouldPersistTaps`, `keyboardDismissMode` and
 * `removeClippedSubviews` reach a real ScrollView and do exactly what they say.
 * That matters: `CinematicFlashList` sets `keyboardShouldPersistTaps="handled"`
 * to fix a live double-tap bug — with the default 'never', a tap on a search
 * result only dismisses the keyboard and is then swallowed. Anyone who believed
 * the old comment would have deleted that fix as pointless and put the bug back.
 *
 * Only two are genuinely inert: `estimatedItemSize`, which reaches a ScrollView
 * that has never heard of it, and `inverted`, which nothing in this app passes.
 *
 * Verified against the installed 2.0.2, not from the changelog.
 */
import '@shopify/flash-list';

declare module '@shopify/flash-list' {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  interface FlashListProps<TItem> {
    /** @deprecated Removed in FlashList v2. Genuinely inert — reaches the inner ScrollView, which ignores it. */
    estimatedItemSize?: number;
    /** @deprecated Removed in FlashList v2 — use maintainVisibleContentPosition instead. Nothing here passes it. */
    inverted?: boolean;
    /** Forwarded to the inner ScrollView and FUNCTIONAL, despite being off FlashList's own interface. */
    removeClippedSubviews?: boolean;
    /** Forwarded to the inner ScrollView and FUNCTIONAL. */
    keyboardDismissMode?: string;
    /** Forwarded to the inner ScrollView and FUNCTIONAL — this is what fixes the double tap. */
    keyboardShouldPersistTaps?: string;
    /** ScrollView-inherited prop — type bridge for FlashList v2 */
    contentContainerStyle?: import('react-native').StyleProp<import('react-native').ViewStyle> | Record<string, any>;
    /** ScrollView-inherited prop */
    scrollEventThrottle?: number;
    /** ScrollView-inherited prop */
    bounces?: boolean;
    /** ScrollView-inherited prop */
    overScrollMode?: 'auto' | 'always' | 'never';
    /** ScrollView-inherited prop */
    decelerationRate?: 'normal' | 'fast' | number;
  }
}
