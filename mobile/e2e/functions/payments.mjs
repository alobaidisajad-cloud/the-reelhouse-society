#!/usr/bin/env node
/**
 * payments.mjs — the payments replay (WORKLIST P0.79), in the functions world.
 *
 * Each scenario of payments.json is a member's life with the store. Each step
 * sends a store event through the served revenuecat-webhook, as RevenueCat sends
 * it (its Authorization secret), or makes the app's own sync-entitlement call
 * as the member; the RevenueCat stand-in answers each member's record as the
 * step writes it, in RevenueCat's v1 subscriber shape. After each step: every
 * member the event names had their record read, and the house holds the rank,
 * the source, the founding seat and the count of the hundred the step expects.
 *
 * What it needs, and its means, are world.mjs's.
 */
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { SECRET, check, drain, everything, fn, literal, member, said, scriptStandIns, section, sql, verdict } from './world.mjs';

const { scenarios } = JSON.parse(readFileSync(new URL('./payments.json', import.meta.url), 'utf8'));

const DAY = 86_400_000;
/** A date `days` from now (null: none, a lifetime's end). */
const at = (days) => (days === null || days === undefined ? null : new Date(Date.now() + days * DAY).toISOString());

/**
 * RevenueCat's v1 answer for GET /subscribers/<id>, from a step's lines: each
 * entitlement with its product, its end and its grace; the subscription or
 * lifetime purchase behind it.
 */
const recordOf = (id, entitlements) => {
  const bought = at(-2);
  const subscriptions = {};
  const nonSubscriptions = {};
  for (const e of Object.values(entitlements)) {
    if (e.ends === null) {
      nonSubscriptions[e.product] = [{ id: `purchase-${e.product}`, is_sandbox: false, purchase_date: bought, store: 'app_store' }];
      continue;
    }
    subscriptions[e.product] = {
      billing_issues_detected_at: e.grace === undefined ? null : at(-1),
      expires_date: at(e.ends),
      grace_period_expires_date: e.grace === undefined ? null : at(e.grace),
      is_sandbox: false,
      original_purchase_date: bought,
      period_type: 'normal',
      purchase_date: bought,
      refunded_at: null,
      store: 'app_store',
      unsubscribe_detected_at: e.unsubscribed ? at(-1) : null,
    };
  }
  return {
    request_date: new Date().toISOString(),
    request_date_ms: Date.now(),
    subscriber: {
      entitlements: Object.fromEntries(Object.entries(entitlements).map(([name, e]) => [name, {
        expires_date: at(e.ends),
        grace_period_expires_date: e.grace === undefined ? null : at(e.grace),
        product_identifier: e.product,
        purchase_date: bought,
      }])),
      first_seen: bought,
      original_app_user_id: id,
      subscriptions,
      non_subscriptions: nonSubscriptions,
    },
  };
};

const holding = (id) => JSON.parse(sql(`SELECT json_build_object('tier', tier, 'source', entitlement_source, 'founding', coalesce(is_founding, false))
  FROM public.profiles WHERE id = ${literal(id)}`));
const seats = () => Number(sql('SELECT seats_claimed FROM public.founding_seat_counter WHERE id = 1'));

// The hundred's one counter, as production holds it.
sql('INSERT INTO public.founding_seat_counter (id, seats_claimed) VALUES (1, 0) ON CONFLICT (id) DO NOTHING');
await drain();

let made = 0;
for (const scenario of scenarios) {
  section(`payments — ${scenario.name}`);
  const who = {};
  for (const m of scenario.members) who[m] = await member(`fn_pay_${++made}_${m}`);
  for (const [m, tier] of Object.entries(scenario.manual ?? {})) {
    sql(`SELECT * FROM public.grant_entitlement(${literal(who[m].id)}, ${literal(tier)}, 'manual')`);
  }
  const seatsBefore = seats();

  for (const [i, step] of scenario.steps.entries()) {
    const e = step.event ?? {};
    const label = `step ${i + 1}, ${step.via === 'app' ? 'the app asks' : `${e.type}${e.cancel_reason ? ` (${e.cancel_reason})` : ''}`}`;
    await scriptStandIns({
      revenuecat: Object.fromEntries(Object.entries(step.records).map(([m, ents]) => [who[m].id, { body: recordOf(who[m].id, ents) }])),
    });

    let answer;
    let named;
    if (step.via === 'app') {
      named = [step.as];
      answer = await fn('sync-entitlement', { auth: who[step.as].token });
    } else {
      named = [e.app_user_id, ...(e.transferred_from ?? []), ...(e.transferred_to ?? [])].filter(Boolean);
      const event = {
        ...e,
        id: randomUUID(),
        event_timestamp_ms: Date.now(),
        environment: 'PRODUCTION',
        store: 'APP_STORE',
        ...(e.app_user_id ? { app_user_id: who[e.app_user_id].id, original_app_user_id: who[e.app_user_id].id } : {}),
        ...(e.transferred_from ? { transferred_from: e.transferred_from.map((m) => who[m].id) } : {}),
        ...(e.transferred_to ? { transferred_to: e.transferred_to.map((m) => who[m].id) } : {}),
      };
      answer = await fn('revenuecat-webhook', {
        body: { api_version: '1.0', event }, auth: null, apikey: null, headers: { Authorization: SECRET.webhook },
      });
    }
    const seen = await drain();

    check(answer.status === 200, `${label}: answered`, said(answer));
    check(named.every((m) => seen.some((r) => r.path === `/v1/subscribers/${who[m].id}` && r.headers.authorization === `Bearer ${SECRET.store}`)),
      `${label}: each member it names is read again from the store`, JSON.stringify(seen.map((r) => r.path)));
    for (const [m, want] of Object.entries(step.expect)) {
      if (m === 'seats') continue;
      const got = holding(who[m].id);
      const ok = got.tier === want.tier && got.source === want.source && (want.founding === undefined || got.founding === want.founding);
      const says = `${want.tier ?? 'no rank'}${want.source ? `, from ${want.source}` : ''}${want.founding === undefined ? '' : want.founding ? ', a founding seat' : ', no seat'}`;
      check(ok, `${label}: ${m} holds ${says}`, JSON.stringify(got));
    }
    if (step.expect.seats !== undefined) {
      const taken = seats() - seatsBefore;
      check(taken === step.expect.seats, `${label}: the hundred hold ${step.expect.seats} seat(s) more than before`, `${taken}`);
    }
  }
}

section('nowhere else');
check(everything.length > 0 && everything.every((r) => /^\/v1\/subscribers\/[^/]+$/.test(r.path)),
  `every one of the ${everything.length} requests the replay caused was for a member's record`,
  JSON.stringify(everything.filter((r) => !/^\/v1\/subscribers\//.test(r.path)).map((r) => `${r.method} ${r.path}`)));

verdict();
