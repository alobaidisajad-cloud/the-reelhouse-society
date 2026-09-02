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
import { EssayBreak, EssayOpening } from './paper/PaperEssay';

/**
 * The markdown renderer's own styles, aligned to the essay's typography so a
 * heading or a quotation inside a dossier still reads as part of the same page.
 * Only the shapes markdown can produce are listed; anything absent falls back to
 * `body`, which is the essay's measure.
 */
const essayMarkdown = {
  body: { fontFamily: fonts.serif, fontSize: 16.5, lineHeight: 28, color: colors.parchment, opacity: 0.94 },
  paragraph: { marginTop: 16, marginBottom: 0 },
  heading1: { fontFamily: fonts.display, fontSize: 21, lineHeight: 27, color: colors.parchment, marginTop: 26, marginBottom: 2 },
  heading2: { fontFamily: fonts.sub, fontSize: 11, letterSpacing: 1.8, color: colors.sepia, marginTop: 24, marginBottom: 2 },
  heading3: { fontFamily: fonts.sub, fontSize: 10, letterSpacing: 1.6, color: colors.bone, marginTop: 20, marginBottom: 2 },
  strong: { fontFamily: fonts.serifMedium, color: colors.parchment, opacity: 1 },
  em: { fontFamily: fonts.serifItalic },
  link: { color: colors.sepia, textDecorationLine: 'underline' as const },
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
   * down the essay; held in a ref it would never reset. A `let` closed over by
   * the rules object, rebuilt each render, is the only version that is right
   * every time.
   */
  const rules = useMemo(() => {
    let seen = 0;
    return {
      paragraph: (node: any, children: React.ReactNode) => {
        const first = seen === 0;
        seen += 1;
        if (!first) {
          return (
            <Text key={node.key} style={[essayMarkdown.body, essayMarkdown.paragraph]} {...scaledTextProps}>
              {children}
            </Text>
          );
        }
        // The drop cap needs the letter as a STRING, and `children` here is a
        // React tree. When the first paragraph is plain text the design's own
        // opening is used; when it carries emphasis or a link, the cap is not
        // worth breaking the markup for, so it sets as an ordinary paragraph.
        const plain = typeof node?.children?.[0]?.content === 'string' && node.children.length === 1
          ? (node.children[0].content as string)
          : null;
        if (plain && plain.trim().length > 1) {
          return <EssayOpening key={node.key} text={plain} />;
        }
        return (
          <Text key={node.key} style={[essayMarkdown.body, essayMarkdown.paragraph]} {...scaledTextProps}>
            {children}
          </Text>
        );
      },
      // A rule between sections is the house's printed ornament, not a line.
      hr: (node: any) => <EssayBreak key={node.key} />,
    };
  }, [safe]);

  if (!safe.trim()) return null;

  return (
    <View>
      <Markdown style={essayMarkdown} rules={rules} onLinkPress={onMarkdownLinkPress}>
        {safe}
      </Markdown>
    </View>
  );
});
