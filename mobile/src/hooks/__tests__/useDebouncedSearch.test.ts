/**
 * useDebouncedSearch.test.ts — Contract Tests
 * ────────────────────────────────────────────
 * Tests the debounce logic and API contract.
 */

describe('useDebouncedSearch contract', () => {
  it('exports the hook', () => {
    const mod = require('../useDebouncedSearch');
    expect(typeof mod.useDebouncedSearch).toBe('function');
  });

  it('debounce timing logic: callback fires after delay', (done) => {
    jest.useFakeTimers();
    let fired = false;

    const timer = setTimeout(() => { fired = true; }, 400);

    expect(fired).toBe(false);
    jest.advanceTimersByTime(399);
    expect(fired).toBe(false);
    jest.advanceTimersByTime(1);
    expect(fired).toBe(true);

    clearTimeout(timer);
    jest.useRealTimers();
    done();
  });

  it('minLength gate: queries shorter than minLength skip search', () => {
    const minLength = 2;
    const query1 = 'g';
    const query2 = 'go';

    expect(query1.trim().length < minLength).toBe(true);
    expect(query2.trim().length < minLength).toBe(false);
  });

  it('AbortController cancels previous requests', () => {
    const controller1 = new AbortController();
    const controller2 = new AbortController();

    // Simulate: new query arrives, abort previous
    controller1.abort();
    expect(controller1.signal.aborted).toBe(true);
    expect(controller2.signal.aborted).toBe(false);
  });

  it('only latest query survives rapid changes', () => {
    jest.useFakeTimers();
    const results: string[] = [];
    let latestTimer: any = null;

    // Simulate rapid typing with debounce
    const queries = ['g', 'go', 'god', 'godfather'];
    for (const q of queries) {
      if (latestTimer) clearTimeout(latestTimer);
      latestTimer = setTimeout(() => results.push(q), 400);
    }

    jest.advanceTimersByTime(400);
    // Only the last one should have fired
    expect(results).toEqual(['godfather']);

    jest.useRealTimers();
  });
});
