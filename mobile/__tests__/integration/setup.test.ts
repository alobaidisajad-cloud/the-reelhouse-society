/**
 * setup.test.ts — Smoke test verifying integration test infrastructure compiles and works
 */

import {
    createMockNetwork,
    createMockSupabase,
    createMockUser,
    createSentrySpy,
    resetStores,
    setupSentryMock,
} from './setup';

describe('Integration Test Infrastructure', () => {
  it('createMockSupabase returns a chainable mock object', () => {
    const mock = createMockSupabase({ data: [{ id: '1' }] });

    // Verify chainable methods exist
    expect(mock.select).toBeDefined();
    expect(mock.insert).toBeDefined();
    expect(mock.update).toBeDefined();
    expect(mock.delete).toBeDefined();
    expect(mock.eq).toBeDefined();
    expect(mock.in).toBeDefined();
    expect(mock.or).toBeDefined();
    expect(mock.order).toBeDefined();
    expect(mock.limit).toBeDefined();
    expect(mock.single).toBeDefined();
    expect(mock.maybeSingle).toBeDefined();
    expect(mock.rpc).toBeDefined();

    // Verify chaining works
    const chained = mock.select().eq('id', '1').order('created_at').limit(10);
    expect(chained).toBe(mock);
  });

  it('createMockSupabase terminal methods resolve data', async () => {
    const data = [{ id: '1', name: 'test' }];
    const mock = createMockSupabase({ data });

    const singleResult = await mock.single();
    expect(singleResult).toEqual({ data, error: null });

    const maybeSingleResult = await mock.maybeSingle();
    expect(maybeSingleResult).toEqual({ data, error: null });
  });

  it('createMockSupabase _setData/_setError allow dynamic reconfiguration', async () => {
    const mock = createMockSupabase({ data: null });

    mock._setData([{ id: 'new' }]);
    const result = await mock.single();
    expect(result.data).toEqual([{ id: 'new' }]);

    mock._setError({ message: 'DB error' });
    const errorResult = await mock.single();
    expect(errorResult.error).toEqual({ message: 'DB error' });
  });

  it('resetStores resets auth, social, and notification stores', () => {
    // This should not throw
    resetStores();
  });

  it('createMockNetwork controller tracks online state', () => {
    const network = createMockNetwork();

    expect(network.isOnline()).toBe(true);
    network.setOnline(false);
    expect(network.isOnline()).toBe(false);
    network.setOnline(true);
    expect(network.isOnline()).toBe(true);
  });

  it('createSentrySpy provides mock functions', () => {
    setupSentryMock();
    const sentry = createSentrySpy();

    expect(sentry.captureException).toBeDefined();
    expect(sentry.captureMessage).toBeDefined();
    expect(sentry.startSpan).toBeDefined();
    expect(sentry.addBreadcrumb).toBeDefined();

    // Verify reset clears call history
    sentry.captureException(new Error('test'));
    expect(sentry.captureException).toHaveBeenCalledTimes(1);
    sentry.reset();
    expect(sentry.captureException).toHaveBeenCalledTimes(0);
  });

  it('createMockUser returns a valid user object with defaults', () => {
    const user = createMockUser();
    expect(user.id).toBeDefined();
    expect(user.username).toBe('testuser');
    expect(user.role).toBe('cinephile');
  });

  it('createMockUser accepts overrides', () => {
    const user = createMockUser({ username: 'custom', role: 'critic' });
    expect(user.username).toBe('custom');
    expect(user.role).toBe('critic');
  });
});
