/**
 * revenuecatWebhookDecide.test.ts
 * ───────────────────────────────
 * Every decision the RevenueCat webhook makes, exercised as a pure function.
 *
 * This exists because the webhook itself cannot be run here — no Deno, no RevenueCat
 * — so its behaviour would otherwise be reasoned about and never observed. The
 * subtleties in RevenueCat's event semantics are exactly where money is lost:
 * stripping a member who has paid through the period, or leaving a refunded member
 * on a paid rank for a year.
 */
import { decide, tierFromEvent, isAccountId } from '../../../supabase/functions/revenuecat-webhook/decide';

const UID = '11111111-1111-4111-8111-111111111111';
const NOW = 1_800_000_000_000;
const ev = (o: Record<string, unknown>) => ({ app_user_id: UID, ...o });

describe('granting events', () => {
  it.each(['INITIAL_PURCHASE', 'RENEWAL', 'UNCANCELLATION', 'NON_RENEWING_PURCHASE'])(
    '%s grants the entitlement it carries', (type) => {
      const a = decide(ev({ type, entitlement_ids: ['auteur'] }), NOW);
      expect(a).toMatchObject({ kind: 'grant', tier: 'auteur' });
    });

  it('grants the founding seat from a lifetime purchase', () => {
    expect(decide(ev({ type: 'NON_RENEWING_PURCHASE', product_id: 'founding_lifetime' }), NOW))
      .toMatchObject({ kind: 'grant', tier: 'founding' });
  });

  it('is case-insensitive about the event name', () => {
    expect(decide(ev({ type: 'renewal', entitlement_ids: ['archivist'] }), NOW))
      .toMatchObject({ kind: 'grant', tier: 'archivist' });
  });

  it('ignores a grant carrying no recognisable tier rather than guessing', () => {
    expect(decide(ev({ type: 'RENEWAL', entitlement_ids: ['mystery'] }), NOW).kind).toBe('ignore');
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// The two that cost money if read naively
// ══════════════════════════════════════════════════════════════════════════════
describe('CANCELLATION is decided by the clock, not the name', () => {
  it('does NOT end access when the member is still paid up', () => {
    // The naive reading. Acting here strips a paying member days or weeks early.
    const a = decide(ev({ type: 'CANCELLATION', expiration_at_ms: NOW + 86_400_000 }), NOW);
    expect(a.kind).toBe('ignore');
    expect(a.reason).toMatch(/still paid up/i);
  });

  it('DOES end access on a refund, where expiry is already past', () => {
    // The opposite mistake: blanket-ignoring CANCELLATION lets a refunded annual
    // subscriber keep a paid rank for up to a year.
    expect(decide(ev({ type: 'CANCELLATION', expiration_at_ms: NOW - 1 }), NOW).kind).toBe('end');
  });

  it('does not end access when there is no timestamp to justify it', () => {
    expect(decide(ev({ type: 'CANCELLATION' }), NOW).kind).toBe('ignore');
    expect(decide(ev({ type: 'CANCELLATION', expiration_at_ms: null }), NOW).kind).toBe('ignore');
    expect(decide(ev({ type: 'CANCELLATION', expiration_at_ms: 0 }), NOW).kind).toBe('ignore');
  });
});

describe('EXPIRATION', () => {
  it('ends access when the expiry has passed', () => {
    expect(decide(ev({ type: 'EXPIRATION', expiration_at_ms: NOW - 1000 }), NOW).kind).toBe('end');
  });

  it('ends access when no timestamp is given — the event means it ended', () => {
    expect(decide(ev({ type: 'EXPIRATION' }), NOW).kind).toBe('end');
  });

  it('IGNORES an expiry in the future — overtaken by a renewal', () => {
    // RevenueCat does not guarantee ordering. An EXPIRATION for an old subscription
    // can arrive after the renewal that replaced it; acting would demote someone who
    // is currently paying.
    const a = decide(ev({ type: 'EXPIRATION', expiration_at_ms: NOW + 60_000 }), NOW);
    expect(a.kind).toBe('ignore');
    expect(a.reason).toMatch(/stale|future/i);
  });
});

describe('PRODUCT_CHANGE must not act early', () => {
  it('is ignored even when it carries a lower tier', () => {
    // RevenueCat fires this when a change is SCHEDULED; for a downgrade it does not
    // take effect until the next renewal. Acting would drop an Auteur to Archivist
    // while they are still paid up. RENEWAL carries the product that actually applies.
    const a = decide(ev({ type: 'PRODUCT_CHANGE', entitlement_ids: ['archivist'] }), NOW);
    expect(a.kind).toBe('ignore');
  });

  it('is ignored when it carries a higher tier too — the app already synced that', () => {
    expect(decide(ev({ type: 'PRODUCT_CHANGE', entitlement_ids: ['auteur'] }), NOW).kind).toBe('ignore');
  });
});

describe('events that carry no entitlement change', () => {
  it.each(['BILLING_ISSUE', 'SUBSCRIPTION_PAUSED', 'SUBSCRIBER_ALIAS', 'TRANSFER', 'TEST'])(
    '%s is acknowledged, never acted on', (type) => {
      expect(decide(ev({ type, entitlement_ids: ['auteur'] }), NOW).kind).toBe('ignore');
    });

  it('an event type invented after this was written is acknowledged, not retried forever', () => {
    const a = decide(ev({ type: 'SOME_FUTURE_EVENT' }), NOW);
    expect(a.kind).toBe('ignore');
    expect(a.reason).toMatch(/unhandled/i);
  });

  it('a malformed event with no type is ignored', () => {
    expect(decide({}, NOW).kind).toBe('ignore');
    expect(decide(null, NOW).kind).toBe('ignore');
  });
});

describe('identity is required before anything acts on an account', () => {
  it('ignores an anonymous RevenueCat id', () => {
    expect(decide({ type: 'RENEWAL', app_user_id: '$RCAnonymousID:abc123', entitlement_ids: ['auteur'] }, NOW).kind)
      .toBe('ignore');
  });

  it('ignores a missing id', () => {
    expect(decide({ type: 'RENEWAL', entitlement_ids: ['auteur'] }, NOW).kind).toBe('ignore');
  });

  it('will not END anything for an unrecognised id either', () => {
    // The dangerous direction: an expiry that cannot be attributed must never be
    // applied to some other account by accident.
    expect(decide({ type: 'EXPIRATION', app_user_id: 'not-a-uuid', expiration_at_ms: NOW - 1 }, NOW).kind)
      .toBe('ignore');
  });

  it('accepts a real account id', () => {
    expect(isAccountId(UID)).toBe(true);
    expect(isAccountId('$RCAnonymousID:abc')).toBe(false);
    expect(isAccountId(undefined)).toBe(false);
    expect(isAccountId(12345)).toBe(false);
  });
});

describe('tier resolution', () => {
  it('takes the highest entitlement when several are held', () => {
    expect(tierFromEvent({ entitlement_ids: ['archivist', 'auteur'] })).toBe('auteur');
    expect(tierFromEvent({ entitlement_ids: ['auteur', 'founding'] })).toBe('founding');
  });

  it('falls back to the product id when entitlement ids are unset', () => {
    // Entitlement ids are dashboard configuration and may simply not be set.
    expect(tierFromEvent({ product_id: 'auteur_annual' })).toBe('auteur');
    expect(tierFromEvent({ product_id: 'archivist_monthly' })).toBe('archivist');
  });

  it('accepts the singular entitlement_id shape', () => {
    expect(tierFromEvent({ entitlement_id: 'archivist' })).toBe('archivist');
  });

  it('is case-insensitive', () => {
    expect(tierFromEvent({ entitlement_ids: ['AUTEUR'] })).toBe('auteur');
    expect(tierFromEvent({ product_id: 'FOUNDING_LIFETIME' })).toBe('founding');
  });

  it('returns null rather than guessing', () => {
    expect(tierFromEvent({})).toBeNull();
    expect(tierFromEvent({ entitlement_ids: [], product_id: 'gift_card' })).toBeNull();
  });
});
