/**
 * SaidText — words that appear because something happened (a refusal, an answer), spoken as
 * they appear, on both phones.
 *
 * `accessibilityLiveRegion` is ANDROID ONLY: on its own, a refused code or a failed save drawn
 * in red was never spoken to a VoiceOver member, whose focus stays on the button they pressed
 * (round 12: SECURITY VERIFICATION's "That code is invalid or has expired.", the Tribunal's
 * second key, Edit Profile's failed save). Android speaks the live region; on iOS the words are
 * announced when they are first drawn and again whenever they change.
 *
 * For what is about one field, FieldError and focusField stay the way (the member is sent to the
 * field). For a whole message that is neither a field's nor a toast's, this.
 */
import React, { useEffect } from 'react';
import { AccessibilityInfo, Platform } from 'react-native';
import { Text, type TextProps } from '@/src/components/text';

export function SaidText({ children, ...props }: Omit<TextProps, 'children' | 'accessibilityLiveRegion'> & { children: string }) {
  useEffect(() => {
    if (Platform.OS === 'ios' && children.trim()) AccessibilityInfo.announceForAccessibility(children);
  }, [children]);
  return <Text {...props} accessibilityLiveRegion="polite">{children}</Text>;
}
