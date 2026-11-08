/**
 * e2eTrace — a line in the device log for the sealed E2E run, and nothing in any
 * other build: only the E2E APK sets extra.e2e (app.config.js, appConfig.guard).
 * Warning level, the level e2e/flow-screens.mjs lifts into a failed flow's report.
 */
import Constants from 'expo-constants';
import { useEffect, useRef } from 'react';
import type { LayoutChangeEvent } from 'react-native';

const ON = Constants.expoConfig?.extra?.e2e === true;

/** The sealed E2E build, and no other: see app.config.js. */
export const E2E_BUILD = ON;

/** The speed lab's builds, and no other (LAB=1 beside E2E=1: app.config.js). */
export const LAB_BUILD = ON && Constants.expoConfig?.extra?.lab === true;

type Measured = { measureInWindow?: (done: (x: number, y: number, w: number, h: number) => void) => void };

/** An onLayout writing where its view sits on screen (`${name}.at`); none outside the E2E build. */
export function e2eTraceAt(name: string): ((e: LayoutChangeEvent) => void) | undefined {
  if (!ON) return undefined;
  return (e) => (e.currentTarget as unknown as Measured)?.measureInWindow?.((x, y, w, h) =>
    e2eTrace(`${name}.at`, { x: Math.round(x), y: Math.round(y), w: Math.round(w), h: Math.round(h) }));
}

/** What the app decided (a search asked and answered, a state that hid something). */
export function e2eTrace(event: string, detail?: Record<string, unknown>): void {
  if (!ON) return;
  console.warn(`[e2e] ${event}${detail ? ` ${JSON.stringify(detail)}` : ''}`);
}

/**
 * A stage of a screen's opening, written once, in the effect of the first commit that draws it
 * (when `drawn`): the hero with its film, the rows below it. Between the request's answer and
 * screen.ready, these say where the phone's own time went (e2e/critical-path.mjs).
 */
export function useTraceDrawn(name: string, drawn = true): void {
  const told = useRef(false);
  useEffect(() => {
    if (!ON || told.current || !drawn) return;
    told.current = true;
    e2eTrace('drawn', { name });
  }, [name, drawn]);
}
