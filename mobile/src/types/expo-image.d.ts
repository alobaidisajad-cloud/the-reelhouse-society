/**
 * expo-image Type Augmentation
 * 
 * Adds `sharedTransitionTag` prop support to expo-image's Animated wrapper.
 * This prop is used by react-native-reanimated's shared transitions API
 * but isn't typed in expo-image's declarations.
 */
import 'expo-image';

declare module 'expo-image' {
  interface ImageProps {
    /** react-native-reanimated shared element transition tag */
    sharedTransitionTag?: string;
    /** Recycling key for FlashList integration */
    recyclingKey?: string;
  }
}
