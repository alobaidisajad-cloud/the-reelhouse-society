/**
 * InColumn — a modal's contents in the page's reading column, its scrim across the window.
 *
 * Every page sits in the reading column (navMetrics). A React Native <Modal> is a window of its own,
 * so on a window wider than the column (an iPad, an unfolded phone) its sheet or card would span the
 * whole window, and whatever it placed by the page's edges would stand at the window's. Inside
 * InColumn it lays out exactly as on a phone, centred where the page is. Its SCRIM is the one part
 * that reaches the window's edges: the room's light fills the window around the column
 * (WideRoomHost), and a scrim stopped at the column dimmed the page and left the room lit around
 * it, the sheet's focus inverted. So the column here does not clip, and a scrim stands from the
 * window's left edge to its right: a modal's own (its box from useWindowFill, or held in InWindow),
 * or one InColumn draws for it (`scrim`: its colour, and the press that closes it). On a phone the
 * column is the window and nothing moves. everyModalHoldsTheColumn holds every <Modal> to it, and
 * every scrim in one to the window.
 */
import React, { type ReactNode } from 'react';
import { Pressable, View } from 'react-native';
import { readingColumn } from '@/src/components/layout/navMetrics';
import { useWideInset } from '@/src/components/atmosphere/RoomLight';

/** The reading column, letting what reaches past it (a scrim) be seen. */
const MODAL_COLUMN = { ...readingColumn, overflow: 'visible' } as const;

export function InColumn({ children, scrim }: {
  children: ReactNode;
  /** A scrim drawn across the window behind the modal: its colour, and the press on it that closes. */
  scrim?: { color: string; onPress?: () => void };
}) {
  const fill = useWindowFill();
  const ground = scrim ? [fill, { backgroundColor: scrim.color }] : null;
  return (
    <View style={MODAL_COLUMN} pointerEvents="box-none">
      {ground && scrim?.onPress ? (
        // A finger closes it on the ground; a screen reader has the modal's own named close.
        <Pressable testID="modal-scrim" style={ground} onPress={scrim.onPress} accessible={false} importantForAccessibility="no-hide-descendants" />
      ) : ground ? <View testID="modal-scrim" style={ground} pointerEvents="none" /> : null}
      {children}
    </View>
  );
}

/**
 * A scrim's box inside InColumn: the whole window, top to bottom and edge to edge, where an
 * absolute fill would stop at the column. On a phone it is the absolute fill.
 */
export function useWindowFill() {
  const { inset } = useWideInset();
  return { position: 'absolute' as const, top: 0, bottom: 0, left: inset ? -inset : 0, right: inset ? -inset : 0 };
}

/** What it holds (a blur, a dim), across the window: for a modal that cannot call the hook where it draws. */
export function InWindow({ children }: { children: ReactNode }) {
  return <View style={useWindowFill()} pointerEvents="box-none">{children}</View>;
}
