/**
 * useBackCloses — Android's back closes an overlay drawn inside its screen, not the screen beneath.
 *
 * A `<Modal>` answers back by itself (onRequestClose). An overlay drawn in the screen gets no back
 * of its own: the press went past it and left the page, the work in the overlay with it. While
 * `open` holds, the press closes the overlay and goes no further; subscribed only then, so it never
 * swallows a back press otherwise. The newest subscriber is heard first, so an overlay over an
 * overlay closes from the top. `close` is read when the press comes, so a fresh one each render
 * does not subscribe again.
 */
import { useEffect, useEffectEvent } from 'react';
import { BackHandler } from 'react-native';

export function useBackCloses(open: boolean, close: () => void): void {
  const shut = useEffectEvent(close);
  useEffect(() => {
    if (!open) return undefined;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      shut();
      return true;
    });
    return () => sub.remove();
  }, [open]);
}
