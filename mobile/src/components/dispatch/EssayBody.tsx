/**
 * An essay, set the way the design draws it and safe the way the app requires.
 * ─────────────────────────────────────────────────────────────────────────────
 * These two requirements pull against each other and both are non-negotiable:
 *
 *   THE DESIGN says the opening paragraph carries a drop cap, the body is
 *   Spectral 16.5/28, and a section break is a printed ornament rather than a
 *   heading. That is what makes a dossier read as a page and not as a post.
 *
 *   THE APP says member markdown passes through `capMarkdownForRender` (two
 *   markdown rules are quadratic; 25,000 characters is the measured ceiling)
 *   and every link goes through `onMarkdownLinkPress`, whose whole job is that
 *   `[text](tel:…)` and Android `intent://` links do not open.
 *
 * Rendering the drop-cap paragraph as plain text would have satisfied the first
 * and quietly broken the second — an italic in the first sentence would print
 * its asterisks. So the WHOLE body goes through the markdown renderer, and the
 * drop cap is a RULE inside it: the first paragraph is drawn by the design's own
 * `EssayOpening`, every later one as an `EssayPara`, and a horizontal rule
 * becomes the printed ornament.
 *
 * Nothing bypasses the guards, and nothing about the page changes.
 */
import { memo, useMemo } from 'react';
import { Text, View } from 'react-native';
import Markdown from 'react-native-markdown-display';

import { capMarkdownForRender, onMarkdownLinkPress } from '@/src/utils/markdownSafety';
import { colors, fonts } from '@/src/theme/theme';
import { scaledTextProps } from '@/src/constants/textScaling';
import {
  EssayBreak, EssayOpening, ESSAY_BODY, useEssayLeading, withLeading,
} from './paper/PaperEssay';

/**
 * The markdown renderer's own styles, aligned to the essay's typography so a
 * heading or a quotation inside a dossier still reads as part of the same page.
 * Only the shapes markdown can produce are listed; anything absent falls back to
 * `body`, which is the essay's measure.
 */
/**
 * A fenced block, rendered as the library renders it — including the trailing
 * newline the parser adds and it trims — with the one thing it does not set: a
 * ceiling on how far the type may grow.
 */
const fencedBlock = (styleKey: 'code_block' | 'fence') =>
  (node: any, _children: React.ReactNode, _parent: unknown, styles: any, inherited: object = {}) => {
    let content = node.content;
    if (typeof content === 'string' && content.charAt(content.length - 1) === '\n') {
      content = content.substring(0, content.length - 1);
    }
    return (
      <Text key={node.key} style={[inherited, styles[styleKey]]} {...scaledTextProps}>
        {content}
      </Text>
    );
  };

const essayMarkdown = {
  /** The essay's measure, from the one place it is defined. */
  body: { ...ESSAY_BODY },
  paragraph: { marginTop: 16, marginBottom: 0 },
  heading1: { fontFamily: fonts.display, fontSize: 21, lineHeight: 27, color: colors.parchment, marginTop: 26, marginBottom: 2 },
  heading2: { fontFamily: fonts.sub, fontSize: 11, letterSpacing: 1.8, color: colors.sepia, marginTop: 24, marginBottom: 2 },
  heading3: { fontFamily: fonts.sub, fontSize: 10, letterSpacing: 1.6, color: colors.bone, marginTop: 20, marginBottom: 2 },
  strong: { fontFamily: fonts.serifMedium, color: colors.parchment, opacity: 1 },
  em: { fontFamily: fonts.serifItalic },
  link: { color: colors.sepia, textDecorationLine: 'underline' as const },
  /** What stands where a pasted remote image was. Set as apparatus, not prose:
   *  it is the page saying something was here, not the member's own writing. */
  imageNote: {
    fontFamily: fonts.sub, fontSize: 10, letterSpacing: 1.4,
    color: colors.fog, marginTop: 16, includeFontPadding: false,
  },
  blockquote: {
    borderLeftWidth: 1.5, borderLeftColor: colors.sepiaBorder,
    paddingLeft: 14, marginTop: 18, marginLeft: 0,
    backgroundColor: 'transparent',
  },
  bullet_list: { marginTop: 12 },
  ordered_list: { marginTop: 12 },
  list_item: { marginTop: 6 },
  code_inline: { fontFamily: fonts.body, fontSize: 14, color: colors.bone, backgroundColor: 'transparent' },
  code_block: { fontFamily: fonts.body, fontSize: 13.5, color: colors.bone, backgroundColor: 'rgba(20,16,11,0.7)', padding: 12, marginTop: 16 },
  fence: { fontFamily: fonts.body, fontSize: 13.5, color: colors.bone, backgroundColor: 'rgba(20,16,11,0.7)', padding: 12, marginTop: 16 },
  hr: { height: 0, backgroundColor: 'transparent' },
};

/**
 * The paragraph's words, when the paragraph is nothing but words.
 *
 * ── WHY THIS IS NOT `node.children[0].content` ─────────────────────────────
 * Because that is `undefined`, always. `react-native-markdown-display` does not
 * hang text off a paragraph: it wraps every run of inline content in a
 * `textgroup` first, so the words live at `children[0].children[n].content`.
 * Reading one level too shallow returned null for every paragraph ever written,
 * the rule fell through to its ordinary branch, and the drop cap — the mark the
 * design uses to say the reading starts here — never once appeared in the app.
 *
 * It appeared in the mockups, which is how it survived: those call `EssayOpening`
 * directly and never go through this rule at all.
 *
 * Null when the paragraph carries anything but text — an emphasis, a link, a
 * code span. That is the existing intent: the cap needs a bare letter, and
 * breaking the markup to get one would print the asterisks.
 */
function plainTextOf(node: any): string | null {
  const kids = node?.children ?? [];
  if (kids.length !== 1 || kids[0]?.type !== 'textgroup') return null;
  const inner = kids[0].children ?? [];
  if (inner.length === 0) return null;
  if (inner.some((c: any) => c?.type !== 'text' || typeof c.content !== 'string')) return null;
  return inner.map((c: any) => c.content).join('');
}

export const EssayBody = memo(function EssayBody({ text }: { text: string }) {
  /**
   * The cap is applied ONCE per body rather than per render. It is a scan of up
   * to 25,000 characters, and this component re-renders whenever a critique
   * arrives underneath it.
   */
  const safe = useMemo(() => capMarkdownForRender(text), [text]);

  /**
   * A counter, reset on every render pass rather than held in state.
   *
   * `react-native-markdown-display` walks the tree top-down and calls the
   * paragraph rule in document order, so the first call is the first paragraph.
   * Held in state it would survive a re-render and the drop cap would migrate
   * down the essay; held in a ref it would never reset.
   *
   * ── AND IT MUST NOT BE MEMOISED ────────────────────────────────────────────
   * This sat inside a `useMemo` keyed on the body text, directly under the
   * paragraph above explaining why a surviving counter is wrong. The text does
   * not change, so the closure — and the counter in it — was reused on every
   * re-render, and the reader re-renders whenever a critique arrives. The cap
   * would have appeared once and then left the page.
   *
   * Rebuilt each render, which is what the paragraph above always described.
   */
  /**
   * The whole style map, with every leading opened to match the type.
   *
   * Applied to the MAP rather than to one style, because the library hands each
   * rule its own entry from it — a heading, a fenced block and a quotation all
   * fix a line height, and all of them crowd at the largest setting for the same
   * reason the body did. Memoised on the scale, so it is rebuilt when the member
   * changes their setting and not on every render of a long essay.
   */
  const lead = useEssayLeading();
  const scaled = useMemo(() => {
    const out: Record<string, unknown> = {};
    for (const [key, style] of Object.entries(essayMarkdown)) {
      out[key] = withLeading(style as { lineHeight?: number }, lead);
    }
    return out as typeof essayMarkdown;
  }, [lead]);

  let seen = 0;
  const rules = {
    paragraph: (node: any, children: React.ReactNode) => {
      const first = seen === 0;
      seen += 1;
      if (!first) {
        return (
          <Text key={node.key} style={[scaled.body, scaled.paragraph]} {...scaledTextProps}>
            {children}
          </Text>
        );
      }
      // The drop cap needs the letter as a STRING, and `children` here is a
      // React tree. When the first paragraph is plain text the design's own
      // opening is used; when it carries emphasis or a link, the cap is not
      // worth breaking the markup for, so it sets as an ordinary paragraph.
      const plain = plainTextOf(node);
      if (plain && plain.trim().length > 1) {
        return <EssayOpening key={node.key} text={plain} />;
      }
      return (
        <Text key={node.key} style={[scaled.body, scaled.paragraph]} {...scaledTextProps}>
          {children}
        </Text>
      );
    },
    /**
     * ── EVERY LEAF OF TEXT HAS A CEILING ────────────────────────────────────
     * React Native's default is to scale text with NO maximum. The paragraph
     * rule below sets one, so everything inside a paragraph — bold, italic, a
     * link, a quotation, inline code — inherits it. Everything the library
     * renders OUTSIDE a paragraph did not: a heading, a list item, a fenced
     * block and a table cell all grew without limit, and a member can type any
     * of them whether or not the toolbar offers it.
     *
     * Set on the LEAF rather than on seven container rules. The leaf is what
     * every shape passes through, so a shape nobody has thought of yet is
     * covered by construction rather than by remembering to add it.
     */
    text: (node: any, _children: React.ReactNode, _parent: unknown, styles: any, inherited: object = {}) => (
      <Text key={node.key} style={[inherited, styles.text]} {...scaledTextProps}>
        {node.content}
      </Text>
    ),

    /**
     * A fenced block renders its content directly rather than through a leaf,
     * so the rule above does not reach it. Both shapes the parser can produce
     * are covered; the body is the library's own, including the trailing
     * newline it trims, so only the ceiling is added.
     */
    code_block: fencedBlock('code_block'),
    fence: fencedBlock('fence'),

    // A rule between sections is the house's printed ornament, not a line.
    hr: (node: any) => <EssayBreak key={node.key} />,

    /**
     * ── AN ESSAY DOES NOT FETCH FROM STRANGERS ──────────────────────────────
     * `![](https://anywhere/x.png)` in a dossier reached the library's default
     * image rule, which renders an <Image> and loads the URL — automatically,
     * on render, with no tap and no allowlist.
     *
     * That is a tracking pixel. The author of an essay learns the address of
     * everybody who reads it, and the content at the far end can be changed
     * after the Tribunal has looked at the words. This app has a whole module
     * about exactly this risk for LINKS, whose docstring calls `safeOpenURL`
     * "the single choke-point every externally-sourced link must pass through"
     * — and an image is strictly worse, because a link at least needs a tap.
     *
     * The house's imagery is the STILL: attached to a film, from TMDB, chosen
     * from a picker. A pasted URL is outside that design and always was.
     *
     * So the alt text prints in its place. Nothing a member wrote is lost, the
     * reader is told something was there, and no device calls a stranger.
     */
    image: (node: any) => {
      const alt = String(node?.attributes?.alt ?? '').trim();
      return (
        <Text key={node.key} style={[scaled.body, scaled.imageNote]} {...scaledTextProps}>
          {alt ? `[image: ${alt}]` : '[image]'}
        </Text>
      );
    },
  };

  if (!safe.trim()) return null;

  return (
    <View>
      <Markdown style={scaled} rules={rules} onLinkPress={onMarkdownLinkPress}>
        {safe}
      </Markdown>
    </View>
  );
});
