/**
 * theHousesPaceIsWaitedNotSaid.test.ts — utils/housePace.ts reads the house's pace for a
 * member's follows and certifications (rateLimitOf: RH429, the seconds to wait in its hint, what is
 * paced in its detail), and waits a short wait and asks again (atTheHousesPace), so the member sees
 * nothing (round 13). The house refused any second follow or certification within a second, and the
 * phone said "Failed to certify entry." for two hearts tapped a moment apart; now the house paces
 * only what a script does, says how long, and the phone waits that long and goes on. A wait longer
 * than the phone waits is handed back, for the caller to keep the write queued.
 */
import { atTheHousesPace, isRateLimited, PACE_WAIT_MAX_MS, rateLimitOf } from '../housePace';
import { isTransientError } from '../networkError';

const paced = (hint: string, details = 'member') => ({ code: 'RH429', message: 'RATE_LIMITED', hint, details });

describe('the house\'s pace, read', () => {
  it('names the seconds to wait and what is paced', () => {
    expect(rateLimitOf(paced('2'))).toEqual({ seconds: 2, scope: 'member' });
    expect(rateLimitOf(paced('3600', 'target'))).toEqual({ seconds: 3600, scope: 'target' });
  });

  it('waits at least a second when the hint is missing or not a number', () => {
    expect(rateLimitOf({ code: 'RH429', message: 'RATE_LIMITED' })).toEqual({ seconds: 1, scope: 'member' });
    expect(rateLimitOf(paced('soon'))).toEqual({ seconds: 1, scope: 'member' });
  });

  it('is not any other failure: a refusal, no signal, or the old floor\'s words', () => {
    for (const other of [
      { code: '42501', message: 'new row violates row-level security policy' },
      new Error('Network request failed'),
      { code: 'P0001', message: 'PGRST301: Too many requests. Please wait a moment.' },
      null, 'RH429',
    ]) {
      expect(rateLimitOf(other)).toBeNull();
      expect(isRateLimited(other)).toBe(false);
    }
  });

  it('is never a server fault the queue would spend a retry on', () => {
    expect(isTransientError(paced('5'))).toBe(false);
  });
});

describe('a write at the house\'s pace', () => {
  it('waits the seconds the house names and asks again, and lands', async () => {
    const waits: number[] = [];
    let asked = 0;
    const answer = await atTheHousesPace(async () => {
      asked += 1;
      if (asked === 1) throw paced('2');
      return 'landed';
    }, { wait: async (ms) => { waits.push(ms); } });
    expect([answer, asked, waits]).toEqual(['landed', 2, [2000]]);
  });

  it('hands back a wait longer than the phone waits, asking only once', async () => {
    let asked = 0;
    const wait = jest.fn(async () => undefined);
    await expect(atTheHousesPace(async () => { asked += 1; throw paced('3600', 'target'); }, { wait })).rejects.toMatchObject({ code: 'RH429' });
    expect([asked, wait.mock.calls.length]).toEqual([1, 0]);
  });

  it('waits no more than its limit in all', async () => {
    const waits: number[] = [];
    await expect(atTheHousesPace(async () => { throw paced('4'); }, { wait: async (ms) => { waits.push(ms); } })).rejects.toMatchObject({ code: 'RH429' });
    expect(waits.reduce((a, b) => a + b, 0)).toBeLessThanOrEqual(PACE_WAIT_MAX_MS);
    expect(waits).toEqual([4000, 4000]);
  });

  it('throws any other failure at once', async () => {
    const wait = jest.fn(async () => undefined);
    const refused = { code: '42501', message: 'refused' };
    await expect(atTheHousesPace(async () => { throw refused; }, { wait })).rejects.toBe(refused);
    expect(wait).not.toHaveBeenCalled();
  });

  it('waits on the clock when no wait is given', async () => {
    jest.useFakeTimers();
    try {
      let asked = 0;
      const going = atTheHousesPace(async () => { asked += 1; if (asked === 1) throw paced('1'); return 'landed'; });
      await Promise.resolve();
      await Promise.resolve();
      expect(asked).toBe(1);
      await jest.advanceTimersByTimeAsync(1000);
      await expect(going).resolves.toBe('landed');
      expect(asked).toBe(2);
    } finally {
      jest.useRealTimers();
    }
  });
});
