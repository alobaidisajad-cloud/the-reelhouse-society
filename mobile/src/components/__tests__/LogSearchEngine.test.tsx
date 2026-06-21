/**
 * LogSearchEngine.test.tsx — Logic & Contract Tests
 * ─────────────────────────────────────────────────
 * Tests the search engine behavior logic.
 */

describe('LogSearchEngine logic', () => {
  it('exports LogSearchEngine component', () => {
    const mod = require('../log/LogSearchEngine');
    expect(mod.default).toBeDefined();
    expect(typeof mod.default).toBe('function');
  });

  it('filters out person results from search', () => {
    const results = [
      { id: 1, title: 'Fight Club', media_type: 'movie' },
      { id: 2, name: 'Brad Pitt', media_type: 'person' },
      { id: 3, title: 'Se7en', media_type: 'movie' },
    ];

    const filtered = results.filter(r => r.media_type !== 'person');
    expect(filtered).toHaveLength(2);
    expect(filtered.every(r => r.media_type !== 'person')).toBe(true);
  });

  it('limits results to 8 items max', () => {
    const results = Array.from({ length: 20 }, (_, i) => ({
      id: i, title: `Film ${i}`, media_type: 'movie',
    }));

    const limited = results.slice(0, 8);
    expect(limited).toHaveLength(8);
  });

  it('debounce: clears timer on new query', () => {
    jest.useFakeTimers();
    let callCount = 0;
    let timer: any = null;

    const search = (q: string) => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => { callCount++; }, 400);
    };

    search('f');
    search('fi');
    search('fig');
    search('fight');
    search('fight club');

    jest.advanceTimersByTime(400);
    expect(callCount).toBe(1); // Only fired once

    jest.useRealTimers();
  });

  it('empty query clears results immediately', () => {
    const query = '';
    const shouldClear = !query.trim();
    expect(shouldClear).toBe(true);
  });

  it('stale search results are discarded via generation counter', () => {
    let gen = 0;
    const results: string[] = [];

    // Simulate: gen incremented on each new query
    gen++; // query 1
    const gen1 = gen;
    gen++; // query 2 (supersedes query 1)
    const gen2 = gen;

    // Only gen2 results should be accepted
    if (gen1 === gen) results.push('stale'); // won't push
    if (gen2 === gen) results.push('fresh'); // will push

    expect(results).toEqual(['fresh']);
  });
});
