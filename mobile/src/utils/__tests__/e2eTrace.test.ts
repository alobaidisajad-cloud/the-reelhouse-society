/**
 * e2eTrace.test.ts — the E2E build speaks to the device log; no other build does.
 */
const load = (extra: Record<string, unknown> | undefined) => {
  jest.resetModules();
  jest.doMock('expo-constants', () => ({ __esModule: true, default: { expoConfig: { extra } } }));
  return require('../e2eTrace').e2eTrace as (e: string, d?: Record<string, unknown>) => void;
};

let warn: jest.SpyInstance;
beforeEach(() => { warn = jest.spyOn(console, 'warn').mockImplementation(() => {}); });
afterEach(() => { warn.mockRestore(); jest.dontMock('expo-constants'); });

describe('e2eTrace', () => {
  it('is silent in a real build', () => {
    load(undefined)('darkroom.search.ask', { val: 'x' });
    load({})('darkroom.search.ask', { val: 'x' });
    load({ e2e: 'true' })('darkroom.search.ask', { val: 'x' }); // only the boolean counts
    expect(warn).not.toHaveBeenCalled();
  });

  it('in the E2E build, writes one warning line the run report lifts', () => {
    load({ e2e: true })('darkroom.search.answer', { val: 'the godfather', count: 5 });
    expect(warn).toHaveBeenCalledWith('[e2e] darkroom.search.answer {"val":"the godfather","count":5}');
  });

  it('a trace with no detail is its name alone', () => {
    load({ e2e: true })('darkroom.field');
    expect(warn).toHaveBeenCalledWith('[e2e] darkroom.field');
  });
});
