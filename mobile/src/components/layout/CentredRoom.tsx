/**
 * CentredRoom — a page whose few lines stand in the middle of the screen.
 *
 * They centre in the room between what is drawn over the page: a tab's two
 * bars, or a pushed page's status bar and home indicator (navMetrics). When
 * they are taller than that room (the largest text sizes, a small phone) they
 * scroll, from below the top edge to above the foot, and never sit under either.
 *
 * The scroll fills the page, and only its content is padded: so the content
 * grows to the room (`flexGrow`), centres in it, and its padding is the first
 * and the last thing the scroll shows.
 */
import type { ReactNode } from 'react';
import { ScrollView, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import { usePushedRoomPadding, useTabRoomPadding } from './navMetrics';

export function CentredRoom({ kind, style, children }: {
  /** A tab, under the top bar and over the tab bar; or a pushed page, with neither. */
  kind: 'tab' | 'pushed';
  /** The content's own look: its sides, how it aligns. */
  style?: StyleProp<ViewStyle>;
  children: ReactNode;
}) {
  const tab = useTabRoomPadding();
  const pushed = usePushedRoomPadding();
  return (
    <ScrollView
      testID="centred-room"
      style={s.fill}
      contentContainerStyle={[s.centre, style, kind === 'tab' ? tab : pushed]}
      showsVerticalScrollIndicator={false}
      overScrollMode="never"
      keyboardShouldPersistTaps="handled"
    >
      {children}
    </ScrollView>
  );
}

const s = StyleSheet.create({
  fill: { flex: 1 },
  centre: { flexGrow: 1, justifyContent: 'center' },
});
