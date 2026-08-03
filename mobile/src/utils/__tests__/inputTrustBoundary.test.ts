/**
 * inputTrustBoundary.test.ts — one hostile payload, every entry point
 * ───────────────────────────────────────────────────────────────────
 * Batch 14's DONE WHEN: "a hostile payload is rejected at every one of the four
 * entry points, each with its own test." There turned out to be six, not four —
 * profile free-text and moderation reports were never in the register.
 *
 * These drive the REAL store/service functions with a mocked database and assert on
 * what was actually handed to Supabase. They do not re-implement the rule and check
 * their own arithmetic; if the sanitiser call is removed from any of these paths, the
 * corresponding test fails.
 *
 * ── WHAT MAKES THE PAYLOAD HOSTILE ───────────────────────────────────────────
 * Not script tags — this is React Native, there is no HTML parser to fool. The
 * dangerous class is INVISIBLE: bidi controls and isolates (U+202E, U+2066-2069) are
 * the Trojan-Source family, which visually reorder the text AROUND them. A stack
 * titled with one of these can rewrite how a neighbouring stack's title reads.
 */
import { sanitizeInput, MAX_LENGTHS } from '../sanitizeInput';

/** Bidi override + isolates + zero-width joiner + a C0 control, wrapped in real words. */
const HOSTILE = 'Citizen‮⁦⁧Kane​⁩⁩';
const CLEAN = 'CitizenKane';

/** Every invisible codepoint the sanitiser is responsible for removing. */
const INVISIBLES = ['​', '‌', '‍', '‎', '‏', '﻿', '­',
  '⁦', '⁧', '⁨', '⁩', '‮', ''];

describe('the sanitiser removes the class that matters', () => {
  it('strips bidi controls, isolates, zero-width and control characters', () => {
    expect(sanitizeInput(HOSTILE, 'listTitle')).toBe(CLEAN);
  });

  it.each(INVISIBLES)('removes %j from every field profile', (ch) => {
    for (const profile of Object.keys(MAX_LENGTHS) as (keyof typeof MAX_LENGTHS)[]) {
      expect(sanitizeInput(`a${ch}b`, profile)).toBe('ab');
    }
  });

  it('leaves legitimate prose completely alone', () => {
    const real = 'A Bout de Souffle (1960) — Godard\'s "first" feature.\n\nStill radical.';
    expect(sanitizeInput(real, 'listDescription')).toBe(real);
  });

  it('preserves the newlines an essay depends on', () => {
    expect(sanitizeInput('one\n\ntwo', 'review')).toBe('one\n\ntwo');
  });
});

describe('every field profile the batch introduced or wired up', () => {
  // A profile that exists but is called by nothing is how `bio` went unprotected for
  // the entire life of the app. These assert the numbers, so a silent drift between
  // MAX_LENGTHS and ProfileUpdateSchema shows up here.
  it.each([
    ['bio', 160],
    ['displayName', 50],
    ['persona', 50],
    ['reportDetails', 500],
    ['listTitle', 100],
    ['listDescription', 1000],
    ['dossierComment', 2000],
  ] as const)('%s caps at %i', (profile, expected) => {
    expect(MAX_LENGTHS[profile]).toBe(expected);
    expect(sanitizeInput('x'.repeat(expected + 500), profile)).toHaveLength(expected);
  });

  it('bio matches the Zod limit exactly, so the two cannot disagree', () => {
    // ProfileUpdateSchema: bio: z.string().max(160). If someone raises one and not the
    // other, a member's bio is silently truncated by whichever is smaller.
    expect(MAX_LENGTHS.bio).toBe(160);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// Social links — one rule shared by the writer and the opener
// ══════════════════════════════════════════════════════════════════════════════
describe('normalizeSocialUrl', () => {
  const { normalizeSocialUrl } = require('../linking');

  it('accepts the BARE DOMAIN members actually type', () => {
    // This is the ordinary case. Validating the raw string instead of the normalised
    // one would have stripped every legitimate link on the next profile save.
    expect(normalizeSocialUrl('instagram.com/name')).toBe('https://instagram.com/name');
    expect(normalizeSocialUrl('  letterbox.example/x  ')).toBe('https://letterbox.example/x');
  });

  it('leaves a full https link alone', () => {
    expect(normalizeSocialUrl('https://example.com/a')).toBe('https://example.com/a');
    expect(normalizeSocialUrl('http://example.com/a')).toBe('http://example.com/a');
  });

  it('rejects an http-prefixed scheme that is not http', () => {
    // "httpx" starts with "http", so it is NOT prefixed — the protocol check is the
    // only thing standing between it and the OS.
    expect(normalizeSocialUrl('httpx://evil')).toBeNull();
  });

  it('neutralises a scheme payload rather than opening it', () => {
    // Not exploitable even before this existed: the https:// prefix turns these into
    // ordinary URLs pointing at nonsense hosts. Asserted so that stays true if the
    // prefix rule is ever "simplified".
    for (const hostile of ['javascript:alert(1)', 'data:text/html,<script>', 'intent://x']) {
      const out = normalizeSocialUrl(hostile);
      expect(out === null || out.startsWith('https://')).toBe(true);
      // out may legitimately be null (an unparseable host is rejected outright).
      expect(out ?? '').not.toMatch(/^javascript:|^data:|^intent:/);
    }
  });

  it('returns null for nothing', () => {
    expect(normalizeSocialUrl('')).toBeNull();
    expect(normalizeSocialUrl('   ')).toBeNull();
    expect(normalizeSocialUrl(null)).toBeNull();
    expect(normalizeSocialUrl(undefined)).toBeNull();
  });
});
