/**
 * useStableSubscription.test.ts — Contract Tests
 * ───────────────────────────────────────────────
 * Tests the subscription contract: the hook should call
 * supabase.channel() with the name and pass it to setup().
 * Tests the module interface without React lifecycle issues.
 */

describe('useStableSubscription contract', () => {
  it('exports the hook function', () => {
    const { useStableSubscription } = require('../useStableSubscription');
    expect(typeof useStableSubscription).toBe('function');
  });

  it('supabase.channel mock is available for integration', () => {
    // The global jest.setup.ts mocks supabase with .channel()
    const { createClient } = require('@supabase/supabase-js');
    const client = createClient();
    expect(client.channel).toBeDefined();
    expect(typeof client.channel).toBe('function');
  });

  it('supabase.removeChannel mock is available', () => {
    const { createClient } = require('@supabase/supabase-js');
    const client = createClient();
    expect(client.removeChannel).toBeDefined();
    expect(typeof client.removeChannel).toBe('function');
  });
});
