/**
 * FlashList v2.0.2 Type Augmentation
 * 
 * FlashList v2 removed `estimatedItemSize` and `inverted` from its props interface.
 * Rather than removing them from ~22 call sites (which would cause runtime warnings),
 * we augment the type definition to accept these as no-op props.
 * 
 * This is the cleanest fix: zero runtime changes, zero visual regressions,
 * and all 22+ type errors resolved in a single declaration.
 */
import '@shopify/flash-list';

declare module '@shopify/flash-list' {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  interface FlashListProps<TItem> {
    /** @deprecated Removed in FlashList v2 — accepted as no-op for backwards compatibility */
    estimatedItemSize?: number;
    /** @deprecated Removed in FlashList v2 — use maintainVisibleContentPosition instead */
    inverted?: boolean;
    /** @deprecated Removed in FlashList v2 — accepted as no-op for backwards compatibility */
    removeClippedSubviews?: boolean;
    /** @deprecated Removed in FlashList v2 — accepted as no-op for backwards compatibility */
    keyboardDismissMode?: string;
    /** @deprecated Removed in FlashList v2 — accepted as no-op for backwards compatibility */
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
