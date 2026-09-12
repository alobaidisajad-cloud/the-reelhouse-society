/**
 * theParagraphKnowsItsDirection.test.tsx — an Arabic filing, laid out backwards.
 * ─────────────────────────────────────────────────────────────────────────────
 * The Dispatch prints the kind in front of the sentence, inside the SAME <Text>:
 *
 *     TAKE — لا شيء في السينما اليابانية يضاهي تلك اللحظة…
 *
 * A paragraph's direction is decided by its first strong character, over the
 * whole concatenated string. That first strong character is the `T`.
 *
 * iOS was saved from this by `writingDirection: 'rtl'`, which sets the base
 * direction explicitly. Android never reads it — `ParagraphShadowNode.cpp` takes
 * the paragraph direction from the VIEW's layout direction, and
 * `TextLayoutManager` builds the layout without `setTextDirection`, so Android
 * falls back to first-strong and gets `T`. An Arabic member saw the kind label
 * stranded at the END of the first line and the full stop thrown to the far side
 * of the paragraph — measured in the browser against the real plate, where
 * forcing the correct base direction moved both back.
 *
 * ── WHY THIS IS NOT A SOURCE PIN ────────────────────────────────────────────
 * It renders each component, flattens the tree to the string a text engine would
 * actually receive, and runs FIRST-STRONG over it — the same rule Android runs.
 * So it fails for the reason the phone fails, not because a line of source
 * changed shape. Deleting the mark from any one site turns it red; that was
 * checked by deleting it.
 *
 * The ranges are written out again here on purpose. Importing `isRTLText` would
 * make the guard agree with the thing it is guarding: if those ranges were ever
 * wrong, the app and the test would be wrong together and this would still pass.
 */
import { render } from '@testing-library/react-native';
import React from 'react';

import { PaperPost, type PaperKind } from '@/src/components/dispatch/paper/PaperPost';
import { PaperBallot } from '@/src/components/dispatch/paper/PaperBallot';

/** A take, in Arabic, ending in a full stop — the case that was drawn wrong. */
const ARABIC = 'لا شيء في السينما اليابانية يضاهي تلك اللحظة التي تبقى فيها الغرفة فارغة بعد خروج الجميع.';
const ENGLISH = 'Stalker is not slow, it is patient, and the difference is the whole film.';

/**
 * Strong right-to-left: Hebrew, Arabic and friends — plus the two invisible
 * marks, which is the part that matters and the part this test got wrong first.
 *
 * U+200F RIGHT-TO-LEFT MARK does NOT live in the Hebrew or Arabic blocks; it
 * sits in General Punctuation, three thousand code points away. Written as the
 * script ranges alone, this said `ltr` for the very string the fix produces —
 * the guard would have failed a correct app. Android does not use ranges at
 * all: `Character.getDirectionality` reports U+200F as RIGHT_TO_LEFT, which is
 * the whole reason the mark works.
 */
const STRONG_RTL = /[֐-ࣿ‏؜יִ-﷿ﹰ-﻿]/;
/** Strong left-to-right: Latin, Greek, Cyrillic, and its own invisible mark. */
const STRONG_LTR = /[A-Za-zÀ-ʯͰ-֏‎]/;

/**
 * What a text engine is handed: every string in the tree, in document order.
 * Nested <Text> children are part of the same paragraph, which is the entire
 * reason this bug exists.
 */
const flatten = (node: unknown, out: string[] = []): string[] => {
  if (node == null || node === false) return out;
  if (typeof node === 'string') { out.push(node); return out; }
  if (Array.isArray(node)) { for (const n of node) flatten(n, out); return out; }
  const n = node as { children?: unknown };
  if (n.children != null) flatten(n.children, out);
  return out;
};

/**
 * The PARAGRAPH the member's words are in — which is the outermost <Text> that
 * contains them, because that is the unit a text engine lays out and decides a
 * direction for.
 *
 * Flattening the whole card instead was this test's second mistake: the margin
 * time and the byline come first in document order, so the card as a whole
 * always opened `ltr` and the test failed a correct fix. The card is not a
 * paragraph. The <Text> around the sentence is.
 */
const paragraphWith = (node: unknown, needle: string): string | null => {
  if (node == null || typeof node !== 'object') return null;
  const n = node as { type?: string; children?: unknown };
  const mine = flatten(n).join('');
  if (!mine.includes(needle)) return null;
  if (n.type === 'Text') return mine;
  if (Array.isArray(n.children)) {
    for (const c of n.children) {
      const hit = paragraphWith(c, needle);
      if (hit != null) return hit;
    }
  }
  return null;
};

/** Android's rule: the first character that is strongly one or the other wins. */
const firstStrong = (s: string): 'rtl' | 'ltr' | 'none' => {
  for (const ch of s) {
    if (STRONG_RTL.test(ch)) return 'rtl';
    if (STRONG_LTR.test(ch)) return 'ltr';
  }
  return 'none';
};

/** The same author shape the rest of the card tests build. */
const author = { name: 'ana', memberNo: 17, tier: 'free' as const, avatar: null };

/**
 * Every kind that prints its name INLINE with the member's writing. The list is
 * the point: `everyLeadInIsAccountedFor` fails if a tenth site appears in the
 * source and is not handled, and this fails if a site here stops working.
 */
const KINDS: PaperKind[] = ['take', 'seeking', 'wire', 'ballot', 'dossier'];

/**
 * The wire prints its HEADLINE inline with `WIRE — `, not its body, so the
 * member's words go into both — whichever the kind reads, it is the same
 * sentence and the same question about which way it runs.
 */
const draw = (kind: PaperKind, words: string) => render(
  <PaperPost
    kind={kind}
    author={author}
    body={words}
    headline={words}
    order="14"
    measureWidth={390}
    certifyCount={3}
    commentCount={2}
    onOpen={() => {}}
    onCritique={() => {}}
    onCertify={() => {}}
    onSave={() => {}}
    onShare={() => {}}
  />,
).toJSON();

describe('the paragraph knows its own direction', () => {
  describe('a feed card', () => {
    for (const kind of KINDS) {
      it(`a ${kind} written in Arabic opens right-to-left`, () => {
        // The sentence must actually be on the card — a component that rendered
        // nothing would otherwise pass this with a null paragraph.
        const para = paragraphWith(draw(kind, ARABIC), 'اليابانية');
        expect(`${kind} paragraph found: ${para != null}`).toBe(`${kind} paragraph found: true`);
        expect(`${kind}: ${firstStrong(para as string)}`).toBe(`${kind}: rtl`);
      });

      it(`a ${kind} written in English still opens left-to-right`, () => {
        const para = paragraphWith(draw(kind, ENGLISH), 'patient');
        expect(`${kind} paragraph found: ${para != null}`).toBe(`${kind} paragraph found: true`);
        // The mark must NOT be printed for English — an invisible RTL character
        // in front of an English sentence would turn the paragraph the wrong way.
        expect(para).not.toContain('‏');
        expect(`${kind}: ${firstStrong(para as string)}`).toBe(`${kind}: ltr`);
      });
    }
  });

  describe('the ballot sheet', () => {
    const options = [
      { title: 'Tokyo Story', year: 1953, posterPath: null, director: null, votes: 3 },
      { title: 'Stalker', year: 1979, posterPath: null, director: null, votes: 1 },
    ];

    it('an Arabic question opens right-to-left', () => {
      const r = render(
        <PaperBallot question={ARABIC} options={options} author={author} showKind closesLabel="closes in 2 days" />,
      );
      const para = paragraphWith(r.toJSON(), 'اليابانية');
      expect(`question paragraph found: ${para != null}`).toBe('question paragraph found: true');
      expect(firstStrong(para as string)).toBe('rtl');
    });

    it('and stays CENTRED — the sheet does not re-set it hard right', () => {
      const r = render(
        <PaperBallot question={ARABIC} options={options} author={author} showKind closesLabel="closes in 2 days" />,
      );
      // `rtlDirection`, not `rtlText`: turning the paragraph is the fix, moving
      // a deliberately centred question to the right margin is not.
      const json = JSON.stringify(r.toJSON());
      expect(json).toContain('"writingDirection":"rtl"');
      expect(json).not.toContain('"textAlign":"right"');
    });
  });

  it('the rule itself can say NO — it is not answering rtl to everything', () => {
    expect(firstStrong('TAKE — ' + ARABIC)).toBe('ltr');
    expect(firstStrong('‏' + 'TAKE — ' + ARABIC)).toBe('rtl');
    expect(firstStrong(ARABIC)).toBe('rtl');
    expect(firstStrong('1953 · ')).toBe('none');
  });
});
