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
  // From the first render, not the first focus (which comes after it).
  const startedAt = useRef(Date.now());
  const mounted = useRef(false);
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
