/**
 * useScreenReady — marks the moment a screen's content is in, not just its frame.
 *
 * Sentry measures each screen from the tap to its first frame by itself; this
 * adds the time until the screen shows what the member came for, each time the
 * screen is focused. The screen says where its read stands: 'reading', 'ready',
 * or 'failed' (the read reached nothing, and the screen says so). The E2E build
 * writes the time to the device log as screen.ready, or as screen.failed, so a
 * screen that could not read is never counted as loaded (e2e/screen-times.mjs).
 * The first screen also writes the phone's runtime (e2eRuntime).
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
import { traceRuntimeOnce } from '@/src/utils/e2eRuntime';

/** Where a screen's read stands. */
export type ScreenRead = 'reading' | 'ready' | 'failed';

const FullDisplay = Sentry.createTimeToFullDisplay({ useFocusEffect });

export function useScreenReady(name: string, read: ScreenRead): React.ReactElement {
  // Settled: the screen shows its content, or says its read failed.
  const ready = read !== 'reading';
  // A wait begins at the first render (not the first focus, which comes after
  // it), at a return to the screen, or when its content goes back to loading
  // (a new search, a refresh) — whichever came last. Timed from the focus alone,
  // a search a minute into the Darkroom was reported as a 77-second load.
  const startedAt = useRef(Date.now());
  const mounted = useRef(false);
  const wasReady = useRef(ready);
  // One component can be two screens (the welcome becomes the Lobby on sign-in):
  // a new name is a new wait. Its content already in, the Lobby was timed from
  // when the welcome opened, and reported a minute of typing as a 74 s load.
  const timedAs = useRef(name);
  if ((wasReady.current && !ready) || timedAs.current !== name) startedAt.current = Date.now();
  wasReady.current = ready;
  timedAs.current = name;
  useFocusEffect(useCallback(() => {
    if (mounted.current) startedAt.current = Date.now();
    mounted.current = true;
  }, []));
  useEffect(() => { traceRuntimeOnce(); }, []);
  useEffect(() => {
    if (read === 'reading') return;
    e2eTrace(read === 'ready' ? 'screen.ready' : 'screen.failed', { name, ms: Date.now() - startedAt.current });
  }, [read, name]);
  // Sentry is handed the moment the screen settled, a failed read too.
  // Out of the layout: a screen's gaps and spacing never count it.
  return (
    <View style={s.out} pointerEvents="none">
      <FullDisplay ready={ready} />
    </View>
  );
}

const s = StyleSheet.create({ out: { position: 'absolute', width: 0, height: 0 } });
