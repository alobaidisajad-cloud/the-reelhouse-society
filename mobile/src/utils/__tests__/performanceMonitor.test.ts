/**
 * performanceMonitor.test.ts — Unit Tests for Performance Monitor
 * ────────────────────────────────────────────────────────────────
 * Tests Sentry-native telemetry wrapper: span timing, budget
 * breadcrumbs, measurement recording, and dataset size detection.
 *
 * _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6_
 */

import * as Sentry from '@sentry/react-native';

// ── Mock captureWarning from sentry lib ──
const mockCaptureWarning = jest.fn();
jest.mock('../../lib/sentry', () => ({
  captureWarning: (...args: any[]) => mockCaptureWarning(...args),
}));

// ── Extend Sentry mock with startSpan and setMeasurement ──
(Sentry as any).startSpan = jest.fn((options: any, fn: any) => fn());
(Sentry as any).setMeasurement = jest.fn();

// ── Helpers ──
const originalEnv = process.env.EXPO_PUBLIC_SENTRY_DSN;

function enableSentry() {
  process.env.EXPO_PUBLIC_SENTRY_DSN = 'https://fake@sentry.io/123';
}

function disableSentry() {
  process.env.EXPO_PUBLIC_SENTRY_DSN = '';
}

describe('performanceMonitor', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.restoreAllMocks();
    enableSentry();
  });

  afterAll(() => {
    process.env.EXPO_PUBLIC_SENTRY_DSN = originalEnv;
  });

  // We need to re-import the module for each test group that changes env,
  // since the SENTRY_DSN is read at module load time.
  function getMonitor() {
    // Clear module cache to re-evaluate with current env
    jest.resetModules();
    // Re-apply mocks after resetModules
    jest.mock('../../lib/sentry', () => ({
      captureWarning: (...args: any[]) => mockCaptureWarning(...args),
    }));
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const SentryMod = require('@sentry/react-native');
    SentryMod.startSpan = jest.fn((options: any, fn: any) => fn());
    SentryMod.setMeasurement = jest.fn();
    SentryMod.addBreadcrumb = jest.fn();

    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { performanceMonitor } = require('../performanceMonitor');
    return { performanceMonitor, SentryMod };
  }

  // ─────────────────────────────────────────────────────────────────
  // measure() — returns exact value
  // ─────────────────────────────────────────────────────────────────
  describe('measure', () => {
    it('returns exact same value as wrapped function', async () => {
      const { performanceMonitor } = getMonitor();
      const expected = { id: 42, name: 'test-result' };
      const fn = jest.fn().mockResolvedValue(expected);

      const result = await performanceMonitor.measure(
        { op: 'feed.load', name: 'test-measure' },
        fn,
      );

      expect(result).toBe(expected);
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('propagates exact same exception when fn throws', async () => {
      const { performanceMonitor } = getMonitor();
      const error = new Error('intentional failure');
      const fn = jest.fn().mockRejectedValue(error);

      await expect(
        performanceMonitor.measure({ op: 'feed.load', name: 'test-throw' }, fn),
      ).rejects.toBe(error);
    });

    it('adds breadcrumb when duration exceeds budget threshold', async () => {
      const { performanceMonitor, SentryMod } = getMonitor();

      // Mock Date.now to simulate time passing beyond budget
      // feed.load budget is 3000ms
      let callCount = 0;
      jest.spyOn(Date, 'now').mockImplementation(() => {
        callCount++;
        // First call (start) returns 0, subsequent calls return 4000 (exceeds 3000ms budget)
        return callCount === 1 ? 0 : 4000;
      });

      // Make startSpan call the fn and return its result
      SentryMod.startSpan.mockImplementation((_opts: any, fn: any) => fn());

      await performanceMonitor.measure(
        { op: 'feed.load', name: 'slow-feed' },
        () => Promise.resolve('done'),
      );

      expect(SentryMod.addBreadcrumb).toHaveBeenCalledWith(
        expect.objectContaining({
          category: 'performance',
          level: 'warning',
          message: expect.stringContaining('Budget exceeded'),
          data: expect.objectContaining({
            op: 'feed.load',
            budgetMs: 3000,
          }),
        }),
      );
    });

    it('does NOT add breadcrumb when duration is within budget', async () => {
      const { performanceMonitor, SentryMod } = getMonitor();

      // Mock Date.now to simulate time within budget
      // feed.load budget is 3000ms, simulate 500ms
      let callCount = 0;
      jest.spyOn(Date, 'now').mockImplementation(() => {
        callCount++;
        return callCount === 1 ? 0 : 500;
      });

      SentryMod.startSpan.mockImplementation((_opts: any, fn: any) => fn());

      await performanceMonitor.measure(
        { op: 'feed.load', name: 'fast-feed' },
        () => Promise.resolve('quick'),
      );

      expect(SentryMod.addBreadcrumb).not.toHaveBeenCalled();
    });
  });

  // ─────────────────────────────────────────────────────────────────
  // measureSync() — returns value and budget breadcrumb
  // ─────────────────────────────────────────────────────────────────
  describe('measureSync', () => {
    it('returns value and adds breadcrumb on budget exceeded', () => {
      const { performanceMonitor, SentryMod } = getMonitor();

      // validation.batch budget is 500ms, simulate 800ms
      let callCount = 0;
      jest.spyOn(Date, 'now').mockImplementation(() => {
        callCount++;
        return callCount === 1 ? 0 : 800;
      });

      SentryMod.startSpan.mockImplementation((_opts: any, fn: any) => fn());

      const result = performanceMonitor.measureSync(
        { op: 'validation.batch', name: 'slow-validation' },
        () => 'sync-result',
      );

      expect(result).toBe('sync-result');
      expect(SentryMod.addBreadcrumb).toHaveBeenCalledWith(
        expect.objectContaining({
          category: 'performance',
          level: 'warning',
          message: expect.stringContaining('Budget exceeded'),
          data: expect.objectContaining({
            op: 'validation.batch',
            budgetMs: 500,
          }),
        }),
      );
    });
  });

  // ─────────────────────────────────────────────────────────────────
  // recordMeasurement() — calls Sentry.setMeasurement
  // ─────────────────────────────────────────────────────────────────
  describe('recordMeasurement', () => {
    it('calls Sentry.setMeasurement with correct args', () => {
      const { performanceMonitor, SentryMod } = getMonitor();

      performanceMonitor.recordMeasurement('feed.ttfb', 245, 'millisecond');

      expect(SentryMod.setMeasurement).toHaveBeenCalledWith('feed.ttfb', 245, 'millisecond');
    });
  });

  // ─────────────────────────────────────────────────────────────────
  // checkDatasetSize() — breadcrumb + captureWarning when exceeded
  // ─────────────────────────────────────────────────────────────────
  describe('checkDatasetSize', () => {
    it('emits breadcrumb and captureWarning when count > threshold', () => {
      const { performanceMonitor, SentryMod } = getMonitor();

      performanceMonitor.checkDatasetSize('feed_items', 150, 100);

      expect(SentryMod.addBreadcrumb).toHaveBeenCalledWith(
        expect.objectContaining({
          category: 'performance',
          level: 'warning',
          message: expect.stringContaining('Large dataset: feed_items'),
          data: expect.objectContaining({
            label: 'feed_items',
            count: 150,
            threshold: 100,
            exceededBy: 50,
          }),
        }),
      );

      expect(mockCaptureWarning).toHaveBeenCalledWith(
        '[Perf] Large dataset: feed_items',
        expect.objectContaining({
          count: 150,
          threshold: 100,
          exceededBy: 50,
        }),
      );
    });

    it('is no-op when count <= threshold', () => {
      const { performanceMonitor, SentryMod } = getMonitor();

      performanceMonitor.checkDatasetSize('feed_items', 100, 100);

      expect(SentryMod.addBreadcrumb).not.toHaveBeenCalled();
      expect(mockCaptureWarning).not.toHaveBeenCalled();
    });

    it('is no-op when count < threshold', () => {
      const { performanceMonitor, SentryMod } = getMonitor();

      performanceMonitor.checkDatasetSize('feed_items', 50, 100);

      expect(SentryMod.addBreadcrumb).not.toHaveBeenCalled();
      expect(mockCaptureWarning).not.toHaveBeenCalled();
    });
  });

  // ─────────────────────────────────────────────────────────────────
  // Graceful no-op when SENTRY_DSN is empty
  // ─────────────────────────────────────────────────────────────────
  describe('when SENTRY_DSN is empty (disabled)', () => {
    beforeEach(() => {
      disableSentry();
    });

    it('measure still executes fn and returns value without Sentry calls', async () => {
      const { performanceMonitor, SentryMod } = getMonitor();
      const expected = { data: 'still works' };

      const result = await performanceMonitor.measure(
        { op: 'feed.load', name: 'no-sentry' },
        () => Promise.resolve(expected),
      );

      expect(result).toBe(expected);
      expect(SentryMod.startSpan).not.toHaveBeenCalled();
      expect(SentryMod.addBreadcrumb).not.toHaveBeenCalled();
    });

    it('measureSync still executes fn and returns value without Sentry calls', () => {
      const { performanceMonitor, SentryMod } = getMonitor();

      const result = performanceMonitor.measureSync(
        { op: 'validation.batch', name: 'no-sentry' },
        () => 42,
      );

      expect(result).toBe(42);
      expect(SentryMod.startSpan).not.toHaveBeenCalled();
      expect(SentryMod.addBreadcrumb).not.toHaveBeenCalled();
    });

    it('recordMeasurement is no-op without Sentry calls', () => {
      const { performanceMonitor, SentryMod } = getMonitor();

      performanceMonitor.recordMeasurement('test.metric', 100, 'none');

      expect(SentryMod.setMeasurement).not.toHaveBeenCalled();
    });

    it('checkDatasetSize still calls captureWarning but not Sentry breadcrumb', () => {
      const { performanceMonitor, SentryMod } = getMonitor();

      performanceMonitor.checkDatasetSize('items', 200, 100);

      // captureWarning is called regardless of Sentry DSN (it has its own guard)
      // But the Sentry.addBreadcrumb is guarded by isSentryEnabled()
      expect(SentryMod.addBreadcrumb).not.toHaveBeenCalled();
      // captureWarning from lib/sentry is still called — it handles its own DSN check
      expect(mockCaptureWarning).toHaveBeenCalledWith(
        '[Perf] Large dataset: items',
        expect.objectContaining({ count: 200, threshold: 100, exceededBy: 100 }),
      );
    });
  });
});
