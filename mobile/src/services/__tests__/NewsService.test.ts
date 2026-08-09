/**
 * NewsService — Comprehensive Unit Tests
 * ────────────────────────────────────────────────────────────────────
 * Covers: happy path, failure (empty), timeout, external abort signal,
 * HTML entity decoding, empty RSS items, and pubDate sorting.
 *
 * Requirements: 1.2, 1.3, 1.4
 */

import * as fs from 'fs';
import * as path from 'path';

jest.mock('@/src/utils/logger', () => ({
  logger: { warn: jest.fn(), error: jest.fn(), info: jest.fn() },
}));

describe('NewsService (getNews) — Comprehensive', () => {
  let getNews: typeof import('@/src/services/NewsService').getNews;

  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    jest.useFakeTimers();
    process.env = { ...originalEnv, EXPO_PUBLIC_SUPABASE_URL: 'https://test.supabase.co' };
    getNews = require('@/src/services/NewsService').getNews;
  });

  afterEach(() => {
    jest.useRealTimers();
    process.env = originalEnv;
    jest.restoreAllMocks();
  });

  // ════════════════════════════════════════════════════════════════════
  // HAPPY PATH
  // ════════════════════════════════════════════════════════════════════

  describe('happy path — Edge Function returns data', () => {
    it('returns parsed, decoded, and sorted live items WITHOUT appending stale fallback', async () => {
      const rssItems = [
        {
          guid: 'item-1',
          title: 'Older Film &amp; News',
          description: '<p>Description one</p>',
          pubDate: '2024-01-01T10:00:00Z',
          link: 'https://example.com/1',
          categories: ['Reviews'],
          author: 'Jane Doe',
        },
        {
          guid: 'item-2',
          title: 'Newer Film News',
          description: '<b>Description two</b>',
          pubDate: '2024-06-15T14:00:00Z',
          link: 'https://example.com/2',
          categories: ['Festivals'],
          enclosure: { link: 'https://img.example.com/photo.jpg' },
        },
      ];

      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ items: rssItems }),
      });

      const promise = getNews();
      jest.runAllTimers();
      const result = await promise;

      // Live items only. The fabricated fallback that used to exist is gone (#41).
      expect(result.length).toBe(2);

      // Sorted by pubDate descending: item-2 (June) before item-1 (Jan)
      expect(result[0].id).toBe('item-2');
      expect(result[1].id).toBe('item-1');

      // Entity decoding
      expect(result[1].title).toBe('Older Film & News');

      // HTML tags stripped from excerpt
      expect(result[0].excerpt).not.toContain('<b>');
      expect(result[1].excerpt).not.toContain('<p>');

      // Category uppercased
      expect(result[0].category).toBe('FESTIVALS');

      // Image from enclosure
      expect(result[0].image).toBe('https://img.example.com/photo.jpg');

      // Every item came from the wire — nothing was manufactured to pad it out.
      //
      // This used to assert the two fabricated ids were absent. Once those were
      // deleted that could never fail, so it is replaced with a check that CAN:
      // the service must return exactly what the feed gave it, no more.
      expect(result).toHaveLength(2);
      expect(result.every((i) => Boolean(i.link) && i.link !== '#')).toBe(true);
    });
  });

  describe('#41 · the module carries no invented content', () => {
    it('no fabricated article, byline or dead link survives in the source', () => {
      // Read from source rather than exercised, because the point is ABSENCE —
      // a behavioural test cannot prove something is not there on some path it
      // did not happen to take.
      const src = fs.readFileSync(
        path.join(__dirname, '..', 'NewsService.ts'),
        'utf8',
      ).replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

      for (const ghost of ['FALLBACK_NEWS', 'relDate', 'fb1', 'fb2', 'THE ARCHIVIST', 'MIDNIGHT DEVOTEE']) {
        expect(`${ghost}:${src.includes(ghost)}`).toBe(`${ghost}:false`);
      }
      // Both failure exits return nothing.
      expect((src.match(/return \[\];/g) ?? []).length).toBeGreaterThanOrEqual(2);
    });

    it('a failed refresh does not blank a wire the member is reading', () => {
      // Returning nothing honestly is only an improvement if it does not ALSO
      // erase articles already on screen. News is not cached — it is fetched
      // into local state and overwrites — so an unconditional write would clear
      // the list the moment a reader loses signal. Their articles are real and
      // correctly dated; keeping them is both kinder and truer than blanking.
      //
      // A cold start still reaches the empty state: `prev` is empty there.
      const screen = fs.readFileSync(
        path.join(__dirname, '..', '..', '..', 'app', '(tabs)', 'dispatch.tsx'),
        'utf8',
      );
      expect(screen).toMatch(
        /setNews\(prev => \(mapped\.length === 0 && prev\.length > 0 \? prev : mapped\)\);/,
      );
      // And the honest empty state it exposes is still there to be reached.
      expect(screen).toMatch(/The wire is silent tonight\./);
      expect(screen).toMatch(/!newsLoading && news\.length === 0/);
    });
  });

  // ════════════════════════════════════════════════════════════════════
  // FAILURE PATH
  // ════════════════════════════════════════════════════════════════════

  describe('failure path — fetch rejects', () => {
    it('returns NOTHING — never invented articles', async () => {
      global.fetch = jest.fn().mockRejectedValue(new Error('Network error'));

      const promise = getNews();
      jest.runAllTimers();
      const result = await promise;

      // Nothing at all. These assertions used to check the SHAPE of the two
      // invented articles this path returned; there is no shape to check now,
      // which is the point.
      expect(result).toEqual([]);
    });

    it('returns nothing when the response is not ok', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: false,
        status: 500,
      });

      const promise = getNews();
      jest.runAllTimers();
      const result = await promise;

      expect(result).toEqual([]);
    });
  });

  // ════════════════════════════════════════════════════════════════════
  // TIMEOUT (4-second abort)
  // ════════════════════════════════════════════════════════════════════

  describe('timeout — 4-second AbortController', () => {
    it('aborts the fetch after 4000ms and returns nothing', async () => {
      // Simulate a fetch that never resolves until aborted
      let abortSignalUsed: AbortSignal | undefined;
      global.fetch = jest.fn().mockImplementation((_url, options) => {
        abortSignalUsed = options?.signal;
        return new Promise((_, reject) => {
          if (options?.signal) {
            options.signal.addEventListener('abort', () => {
              reject(new DOMException('The operation was aborted.', 'AbortError'));
            });
          }
        });
      });

      const promise = getNews();

      // Advance time to trigger the 4-second timeout
      jest.advanceTimersByTime(4000);

      const result = await promise;

      // Nothing, since the fetch was aborted
      expect(result).toEqual([]);
      expect(abortSignalUsed).toBeDefined();
    });

    it('clears timeout when fetch resolves before 4 seconds', async () => {
      const clearTimeoutSpy = jest.spyOn(global, 'clearTimeout');

      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          items: [{ guid: 'g1', title: 'Quick', pubDate: '2024-01-01T00:00:00Z', link: '#' }],
        }),
      });

      const promise = getNews();
      jest.runAllTimers();
      await promise;

      expect(clearTimeoutSpy).toHaveBeenCalled();
    });
  });

  // ════════════════════════════════════════════════════════════════════
  // EXTERNAL ABORT SIGNAL
  // ════════════════════════════════════════════════════════════════════

  describe('external AbortSignal — component unmount cancellation', () => {
    it('cancels fetch and returns nothing when the external signal is aborted', async () => {
      const externalController = new AbortController();

      global.fetch = jest.fn().mockImplementation((_url, options) => {
        return new Promise((_, reject) => {
          if (options?.signal) {
            options.signal.addEventListener('abort', () => {
              reject(new DOMException('The operation was aborted.', 'AbortError'));
            });
          }
        });
      });

      const promise = getNews(externalController.signal);

      // Simulate component unmount
      externalController.abort();
      jest.runAllTimers();

      const result = await promise;

      // Should gracefully return fallback, no unhandled errors
      expect(result).toEqual([]);
    });

    it('does not throw unhandled errors when external signal aborts mid-flight', async () => {
      const externalController = new AbortController();

      global.fetch = jest.fn().mockImplementation((_url, options) => {
        return new Promise((_, reject) => {
          options?.signal?.addEventListener('abort', () => {
            reject(new DOMException('Aborted', 'AbortError'));
          });
        });
      });

      // Should not throw — the error is caught internally
      const promise = getNews(externalController.signal);
      externalController.abort();
      jest.runAllTimers();

      await expect(promise).resolves.toBeDefined();
    });
  });

  // ════════════════════════════════════════════════════════════════════
  // ENTITY DECODING
  // ════════════════════════════════════════════════════════════════════

  describe('entity decoding — HTML entities converted to plain text', () => {
    it('decodes &amp; to &', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          items: [{ guid: 'e1', title: 'Rock &amp; Roll', pubDate: '2024-01-01T00:00:00Z', link: '#' }],
        }),
      });

      const promise = getNews();
      jest.runAllTimers();
      const result = await promise;
      expect(result[0].title).toBe('Rock & Roll');
    });

    it('decodes &lt; and &gt; to < and >', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          items: [{ guid: 'e2', title: '&lt;Film&gt; Review', pubDate: '2024-01-01T00:00:00Z', link: '#' }],
        }),
      });

      const promise = getNews();
      jest.runAllTimers();
      const result = await promise;
      expect(result[0].title).toBe('<Film> Review');
    });

    it('decodes &quot; to "', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          items: [{ guid: 'e3', title: 'The &quot;Best&quot; Film', pubDate: '2024-01-01T00:00:00Z', link: '#' }],
        }),
      });

      const promise = getNews();
      jest.runAllTimers();
      const result = await promise;
      expect(result[0].title).toBe('The "Best" Film');
    });

    it("decodes &#039; to '", async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          items: [{ guid: 'e4', title: "It&#039;s Alive", pubDate: '2024-01-01T00:00:00Z', link: '#' }],
        }),
      });

      const promise = getNews();
      jest.runAllTimers();
      const result = await promise;
      expect(result[0].title).toBe("It's Alive");
    });

    it('decodes multiple entities in a single string', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          items: [{
            guid: 'e5',
            title: '&lt;Film&gt; &amp; &quot;Art&#039;s&quot;',
            pubDate: '2024-01-01T00:00:00Z',
            link: '#',
          }],
        }),
      });

      const promise = getNews();
      jest.runAllTimers();
      const result = await promise;
      expect(result[0].title).toBe('<Film> & "Art\'s"');
    });
  });

  // ════════════════════════════════════════════════════════════════════
  // EMPTY ITEMS
  // ════════════════════════════════════════════════════════════════════

  describe('empty RSS items — returns nothing', () => {
    it('returns nothing when the items array is empty', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ items: [] }),
      });

      const promise = getNews();
      jest.runAllTimers();
      const result = await promise;

      expect(result).toEqual([]);
    });

    it('returns nothing when the response has no items field', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({}),
      });

      const promise = getNews();
      jest.runAllTimers();
      const result = await promise;

      expect(result).toEqual([]);
    });
  });

  // ════════════════════════════════════════════════════════════════════
  // SORTING
  // ════════════════════════════════════════════════════════════════════

  describe('sorting — items sorted by pubDate descending', () => {
    it('sorts multiple items newest first', async () => {
      const rssItems = [
        { guid: 'oldest', title: 'Oldest', pubDate: '2024-01-01T00:00:00Z', link: '#' },
        { guid: 'newest', title: 'Newest', pubDate: '2024-12-25T00:00:00Z', link: '#' },
        { guid: 'middle', title: 'Middle', pubDate: '2024-06-15T00:00:00Z', link: '#' },
      ];

      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ items: rssItems }),
      });

      const promise = getNews();
      jest.runAllTimers();
      const result = await promise;

      // Live items before fallback
      expect(result[0].id).toBe('newest');
      expect(result[1].id).toBe('middle');
      expect(result[2].id).toBe('oldest');
    });

    it('handles items with identical dates (stable order)', async () => {
      const rssItems = [
        { guid: 'a', title: 'A', pubDate: '2024-06-01T12:00:00Z', link: '#' },
        { guid: 'b', title: 'B', pubDate: '2024-06-01T12:00:00Z', link: '#' },
      ];

      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ items: rssItems }),
      });

      const promise = getNews();
      jest.runAllTimers();
      const result = await promise;

      // Both items present (order may vary for identical dates, but no crash)
      const liveIds = result.filter(i => i.id === 'a' || i.id === 'b').map(i => i.id);
      expect(liveIds).toHaveLength(2);
      expect(liveIds).toContain('a');
      expect(liveIds).toContain('b');
    });
  });
});
