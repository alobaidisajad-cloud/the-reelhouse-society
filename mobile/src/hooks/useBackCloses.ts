/**
 * useBackCloses — Android's back closes an overlay drawn inside its screen, not the screen beneath.
 *
 * A `<Modal>` answers back by itself (onRequestClose). An overlay drawn in the screen gets no back
 * of its own: the press went past it and left the page, the work in the overlay with it. While
 * `open` holds, the press closes the overlay and goes no further; subscribed only then, so it never
 * swallows a back press otherwise. The newest subscriber is heard first, so an overlay over an
 * overlay closes from the top. `close` is read when the press comes, so a fresh one each render
 * does not subscribe again.
 *
 * Only while its screen is the one in front: a page pushed over it (a filing opened from the
 * Archive's film, a critic's file from a stack's critiques) left the subscription standing, newer
 * than the navigator's, so the first back on that page closed the overlay hidden beneath it and the
 * page stayed (review round 8).
 */
import { useEffect, useEffectEvent } from 'react';
import { BackHandler } from 'react-native';
import { useIsFocused } from 'expo-router/react-navigation';

export function useBackCloses(open: boolean, close: () => void): void {
  const shut = useEffectEvent(close);
  const inFront = useIsFocused();
  useEffect(() => {
    if (!open || !inFront) return undefined;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      shut();
      return true;
    });
    return () => sub.remove();
  }, [open, inFront]);
}
