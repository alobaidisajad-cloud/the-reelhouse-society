/**
 * FieldError — what is wrong with a field, drawn under it, said with it.
 *
 * A form refused at its button used to say why in a toast at the top of the
 * screen, or in red text a screen reader met only by swiping past the field.
 * Now the message sits under the field it is about, the field carries it as its
 * hint, and a refused form moves the member onto that field (focusField): the
 * keyboard opens there, and a screen reader lands there and hears what to put
 * right.
 */
import React, { useState } from 'react';
import { AccessibilityInfo, StyleSheet } from 'react-native';
import { Text, type TextInput } from '@/src/components/text';
import { scaledTextProps } from '@/src/constants/textScaling';
import { colors, fonts } from '@/src/theme/theme';

export function FieldError({ message }: { message?: string | null }) {
  if (!message) return null;
  return <Text {...scaledTextProps} style={st.text}>{message}</Text>;
}

/** The field a refused form sends the member to: its keyboard, and a screen reader's focus. */
export function focusField(input: TextInput | null | undefined): void {
  if (!input) return;
  input.focus();
  AccessibilityInfo.sendAccessibilityEvent(input, 'focus');
}

/**
 * A refused press, kept with the form it was made against: the reason stands
 * until the form changes, and the member is sent to the field it is about.
 */
export function useFieldRefusal<F extends string>(formNow: readonly unknown[], refs: Record<F, { current: TextInput | null }>) {
  const against = JSON.stringify(formNow);
  const [refusal, setRefusal] = useState<{ field: F; message: string; against: string } | null>(null);
  const standing = refusal && refusal.against === against ? refusal : null;
  return {
    refuse: (field: F, message: string) => {
      setRefusal({ field, message, against });
      focusField(refs[field].current);
    },
    wrongWith: (field: F) => (standing?.field === field ? standing.message : undefined),
  };
}

const st = StyleSheet.create({
  text: { fontFamily: fonts.sub, fontSize: 10, letterSpacing: 0.8, color: colors.crimsonInk, marginTop: 4 },
});
