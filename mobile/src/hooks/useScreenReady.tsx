/**
 * useScreenReady — marks the moment a screen's content is in, not just its frame.
 *
 * Sentry measures each screen from the tap to its first frame by itself; this
 * adds the time until the screen shows what the member came for (`ready`),
 * each time the screen is focused. The E2E build also writes that time to the
 * device log, so every sealed run reports how long each screen took.
 *
 * Called at the top of a screen, before any early return; the mark it returns
 * goes in every tree the screen can return, so the clock survives a loading
 * branch giving way to the page.
 */
import React, { useCallback, useEffect, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
// The SDK itself, not src/lib/sentry: screens' tests replace that module whole.
import * as Sentry from '@sentry/react-native';
import { e2eTrace } from '@/src/utils/e2eTrace';

const FullDisplay = Sentry.createTimeToFullDisplay({ useFocusEffect });

export function useScreenReady(name: string, ready: boolean): React.ReactElement {
  // A wait begins at the first render (not the first focus, which comes after
  // it), at a return to the screen, or when its content goes back to loading
  // (a new search, a refresh) — whichever came last. Timed from the focus alone,
  // a search a minute into the Darkroom was reported as a 77-second load.
  const startedAt = useRef(Date.now());
  const mounted = useRef(false);
  const wasReady = useRef(ready);
  if (wasReady.current && !ready) startedAt.current = Date.now();
  wasReady.current = ready;
  useFocusEffect(useCallback(() => {
    if (mounted.current) startedAt.current = Date.now();
    mounted.current = true;
  }, []));
  useEffect(() => {
    if (ready) e2eTrace('screen.ready', { name, ms: Date.now() - startedAt.current });
  }, [ready, name]);
  // Out of the layout: a screen's gaps and spacing never count it.
  return (
    <View style={s.out} pointerEvents="none">
      <FullDisplay ready={ready} />
    </View>
  );
}

const s = StyleSheet.create({ out: { position: 'absolute', width: 0, height: 0 } });
