/**
 * raceDeadline.test.ts — an answer or a refusal, and no deadline left waiting
 * after either.
 */
import { raceDeadline } from '../raceDeadline';

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

describe('a promise raced against its deadline', () => {
  it('answers with the promise when it is in time, and the deadline goes with it', async () => {
    await expect(raceDeadline(Promise.resolve('signed out'), 5000)).resolves.toBe('signed out');
    expect(jest.getTimerCount()).toBe(0);
  });

  it('passes on the promise’s own refusal, and the deadline goes with it', async () => {
    await expect(raceDeadline(Promise.reject(new Error('refused')), 5000)).rejects.toThrow('refused');
    expect(jest.getTimerCount()).toBe(0);
  });

  it('refuses once the time has passed, and not a moment before', async () => {
    const never = new Promise<string>(() => {});
    const raced = raceDeadline(never, 4000);
    const settled = jest.fn();
    raced.then(settled, settled);

    await jest.advanceTimersByTimeAsync(3999);
    expect(settled).not.toHaveBeenCalled();
    await jest.advanceTimersByTimeAsync(1);
    await expect(raced).rejects.toThrow('timeout after 4000ms');
    expect(jest.getTimerCount()).toBe(0);
  });
});
