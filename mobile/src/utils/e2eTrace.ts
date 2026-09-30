/**
 * e2eTrace — a line in the device log for the sealed E2E run, and nothing in any
 * other build: only the E2E APK sets extra.e2e (app.config.js, appConfig.guard).
 * Warning level, the level e2e/flow-screens.mjs lifts into a failed flow's report.
 */
import Constants from 'expo-constants';

const ON = Constants.expoConfig?.extra?.e2e === true;

/** The sealed E2E build, and no other: see app.config.js. */
export const E2E_BUILD = ON;

/** What the app decided (a search asked and answered, a state that hid something). */
export function e2eTrace(event: string, detail?: Record<string, unknown>): void {
  if (!ON) return;
  console.warn(`[e2e] ${event}${detail ? ` ${JSON.stringify(detail)}` : ''}`);
}
