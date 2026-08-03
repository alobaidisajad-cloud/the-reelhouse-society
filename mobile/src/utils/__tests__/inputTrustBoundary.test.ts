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
