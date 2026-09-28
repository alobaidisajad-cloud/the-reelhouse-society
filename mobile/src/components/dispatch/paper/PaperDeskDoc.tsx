/**
 * The document on a writing desk.
 *
 * The page fills the room between the desk's head and the keyboard — and when
 * what is on it is taller than that room, it SCROLLS. It used to clip: on an
 * iPhone SE at large type with the keyboard up, the body ran past the bottom
 * edge and took the wire's required SOURCE field with it, out of reach. (The
 * layout audit found it once the SE plate was drawn at the SE's own height.)
 * Where everything fits, nothing changes: the content still fills the page, so
 * the column rule and the space under the words are where they were.
 */
import { memo, type ReactNode } from 'react';
import { ScrollView, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import { p } from './paperStyles';

export const DeskDoc = memo(function DeskDoc({ style, children }: { style?: StyleProp<ViewStyle>; children?: ReactNode }) {
  // The padding belongs to the page's CONTENT, so it scrolls with the words
  // instead of framing a window over them.
  const { paddingHorizontal, paddingTop, ...frame } = StyleSheet.flatten([p.deskDoc, style]);
  return (
    <ScrollView
      style={frame}
      contentContainerStyle={{ flexGrow: 1, paddingHorizontal, paddingTop }}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    >
      {children}
    </ScrollView>
  );
});
