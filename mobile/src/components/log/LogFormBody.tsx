import React from 'react';
import { View, Text } from 'react-native';

import { st } from './LogModalStyles';

/**
 * The four registration brackets that mark the docket.
 *
 * Pulled out because they are drawn twice (the record's head, and step 0's
 * search field) and because four absolutely-positioned corners inline make the
 * form harder to read than the thing they decorate.
 */
export const Brackets = React.memo(function Brackets() {
  return (
    <>
      <View style={[st.bracket, st.bracketTL]} pointerEvents="none" />
      <View style={[st.bracket, st.bracketTR]} pointerEvents="none" />
      <View style={[st.bracket, st.bracketBL]} pointerEvents="none" />
      <View style={[st.bracket, st.bracketBR]} pointerEvents="none" />
    </>
  );
});

/** A label above a ruled field — the filing half of the page has no boxes. */
export const FieldLabel = React.memo(function FieldLabel({ children }: { children: React.ReactNode }) {
  return <Text style={st.fieldLabel}>{children}</Text>;
});
