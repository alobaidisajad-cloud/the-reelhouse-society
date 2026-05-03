/**
 * React Native Style Extensions
 * 
 * Extends RN's style types to accept properties used by expo-image
 * and CSS-like layout that RN's StyleSheet.create doesn't natively type.
 */
import 'react-native';

declare module 'react-native' {
  interface ViewStyle {
    /** expo-image contentFit property — allowed in StyleSheet for Image components */
    contentFit?: 'cover' | 'contain' | 'fill' | 'none' | 'scale-down';
    /** CSS float equivalent — used for drop-cap text layout */
    float?: 'left' | 'right' | 'none';
  }

  interface ImageStyle {
    /** expo-image contentFit property */
    contentFit?: 'cover' | 'contain' | 'fill' | 'none' | 'scale-down';
  }

  interface TextStyle {
    /** CSS float equivalent — used for drop-cap text layout */
    float?: 'left' | 'right' | 'none';
  }
}
