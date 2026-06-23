/**
 * invariants.ts — Unit Tests
 * ────────────────────────────────────────────────────────
 * invariants.ts runs validation at MODULE LOAD time (no exported function to
 * call), so each scenario needs a fresh module instance with controlled
 * env vars — jest.resetModules() + jest.isolateModules() per the codebase's
 * existing pattern (see NewsService.test.ts).
 *
 * The module itself special-cases JEST_WORKER_ID to skip the throw in test
 * environments, so we delete it from process.env to simulate a real boot.
 */
describe('invariants', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('throws with a clear message when EXPO_PUBLIC_SUPABASE_URL is missing', () => {
    process.env.EXPO_PUBLIC_SUPABASE_URL = '';
    process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY = 'anon-key';
    delete process.env.JEST_WORKER_ID;
    expect(() => {
      jest.isolateModules(() => {
        require('../invariants');
      });
    }).toThrow(/EXPO_PUBLIC_SUPABASE_URL/);
  });

  it('throws with a clear message when EXPO_PUBLIC_SUPABASE_ANON_KEY is missing', () => {
    process.env.EXPO_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
    process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY = '   ';
    delete process.env.JEST_WORKER_ID;
    expect(() => {
      jest.isolateModules(() => {
        require('../invariants');
      });
    }).toThrow(/EXPO_PUBLIC_SUPABASE_ANON_KEY/);
  });

  it('lists every missing variable when both are absent', () => {
    delete process.env.EXPO_PUBLIC_SUPABASE_URL;
    delete process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
    delete process.env.JEST_WORKER_ID;
    let thrown: Error | undefined;
    try {
      jest.isolateModules(() => {
        require('../invariants');
      });
    } catch (e) {
      thrown = e as Error;
    }
    expect(thrown?.message).toContain('EXPO_PUBLIC_SUPABASE_URL');
    expect(thrown?.message).toContain('EXPO_PUBLIC_SUPABASE_ANON_KEY');
  });

  it('does not throw when both variables are set', () => {
    process.env.EXPO_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
    process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY = 'anon-key';
    delete process.env.JEST_WORKER_ID;
    expect(() => {
      jest.isolateModules(() => {
        require('../invariants');
      });
    }).not.toThrow();
  });

  it('skips the throw entirely under JEST_WORKER_ID even with missing vars', () => {
    delete process.env.EXPO_PUBLIC_SUPABASE_URL;
    delete process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
    process.env.JEST_WORKER_ID = '1';
    expect(() => {
      jest.isolateModules(() => {
        require('../invariants');
      });
    }).not.toThrow();
  });
});
