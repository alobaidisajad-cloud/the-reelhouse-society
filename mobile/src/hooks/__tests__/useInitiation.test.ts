/**
 * useInitiation.test.ts — locks the triple-guarantee of THE INITIATION trigger.
 *
 * The web version's plague was ceremonies/badges repeating. These tests make
 * the mobile guarantees permanent: a newborn account fires once; an existing
 * account (new device) never fires; a seen flag never fires again; garbage
 * data never fires.
 */
import { shouldInitiate, INITIATION_WINDOW_MS } from '../useInitiation';

jest.mock('@/src/stores/auth', () => ({ useAuthStore: jest.fn() }));
jest.mock('@/src/stores/mmkv-storage', () => ({ storage: { getBoolean: jest.fn(), set: jest.fn() } }));

const NOW = Date.parse('2026-07-10T12:00:00.000Z');
const minutesAgo = (m: number) => new Date(NOW - m * 60_000).toISOString();
const hoursAgo = (h: number) => new Date(NOW - h * 3_600_000).toISOString();

describe('shouldInitiate — the triple lock', () => {
  it('fires for a newborn account that has never seen it', () => {
    expect(shouldInitiate({ userId: 'u1', createdAt: minutesAgo(5), alreadySeen: false, now: NOW })).toBe(true);
  });

  it('fires even after long pre-signup wandering / late email confirmation (browse-first window)', () => {
    expect(shouldInitiate({ userId: 'u1', createdAt: hoursAgo(20), alreadySeen: false, now: NOW })).toBe(true);
    expect(shouldInitiate({ userId: 'u1', createdAt: hoursAgo(47), alreadySeen: false, now: NOW })).toBe(true);
  });

  it('NEVER fires for an existing account signing in on a new device (age gate)', () => {
    expect(shouldInitiate({ userId: 'u1', createdAt: hoursAgo(49), alreadySeen: false, now: NOW })).toBe(false);
    expect(shouldInitiate({ userId: 'u1', createdAt: hoursAgo(24 * 30), alreadySeen: false, now: NOW })).toBe(false);
  });

  it('NEVER fires once seen — no matter how new the account is', () => {
    expect(shouldInitiate({ userId: 'u1', createdAt: minutesAgo(1), alreadySeen: true, now: NOW })).toBe(false);
  });

  it('never fires for guests or corrupt data', () => {
    expect(shouldInitiate({ userId: null, createdAt: minutesAgo(5), alreadySeen: false, now: NOW })).toBe(false);
    expect(shouldInitiate({ userId: 'u1', createdAt: null, alreadySeen: false, now: NOW })).toBe(false);
    expect(shouldInitiate({ userId: 'u1', createdAt: 'not-a-date', alreadySeen: false, now: NOW })).toBe(false);
    // A created_at in the future is corrupt — refuse rather than trust it.
    expect(shouldInitiate({ userId: 'u1', createdAt: new Date(NOW + 60_000).toISOString(), alreadySeen: false, now: NOW })).toBe(false);
  });

  it('the window boundary is exact', () => {
    const atBoundary = new Date(NOW - INITIATION_WINDOW_MS).toISOString();
    const pastBoundary = new Date(NOW - INITIATION_WINDOW_MS - 1000).toISOString();
    expect(shouldInitiate({ userId: 'u1', createdAt: atBoundary, alreadySeen: false, now: NOW })).toBe(true);
    expect(shouldInitiate({ userId: 'u1', createdAt: pastBoundary, alreadySeen: false, now: NOW })).toBe(false);
  });
});
