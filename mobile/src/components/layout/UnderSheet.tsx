/**
 * UnderSheet — a page with a sheet drawn over it, out of a screen reader's reach while it is.
 *
 * A sheet that is not a Modal (one opened from a modal route: a Modal over a Modal is the iOS
 * trap) is drawn over the page, but a screen reader still reaches the page beneath, and a member
 * who cannot see where the sheet ends wanders off it. Held in this, the page is hidden from both
 * screen readers while the sheet is up, and back when it closes. A list does not hand these to the
 * view it draws, so the page is held in a View of its own.
 */
import React from 'react';
import { View, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import { UNSPOKEN } from '@/src/components/dispatch/paper/paperMetrics';

export function UnderSheet({ open, style, children }: { open: boolean; style?: StyleProp<ViewStyle>; children: React.ReactNode }) {
  return <View style={[st.page, style]} {...(open ? UNSPOKEN : null)}>{children}</View>;
}

const st = StyleSheet.create({ page: { flex: 1 } });
