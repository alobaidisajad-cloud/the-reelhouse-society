import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Text } from '@/src/components/text';
import { colors, fonts } from '@/src/theme/theme';
import { extractDropCap, stripHTML, isRTLText, OPEN_QUOTE, CLOSE_QUOTE } from '@/src/utils/text';
import SpoilerVeil from '@/src/components/SpoilerVeil';
import VaultNote from '@/src/components/log/VaultNote';
import { PageSection } from '@/src/components/log/PageSection';
import { scaledTextProps } from '@/src/constants/textScaling';
import { TryAgainLine } from '@/src/components/TryAgain';
import { balancedWidth } from '@/src/components/lobby/measure';
import { useTextScale } from '@/src/hooks/useTextScale';
import { useColumnWidth } from '@/src/components/layout/navMetrics';
import { PAGE } from '@/src/components/log/pageMetrics';
import { useStruck } from '@/src/components/StruckWords';
import { STRUCK_OPENS } from '@/src/utils/slurs';

/**
 * The words of the opened log: the pull-quote as a title card, the essay in paragraphs with the
 * record's raised initial, and, for its author alone, the Vault's note about this viewing on its
 * own paper.
 */
interface LogReviewBodyProps {
  review?: string | null;
  pullQuote?: string | null;
  dropCap?: boolean;
  /** The rank's ink: the raised initial's. */
  accent: string;
  isOwner: boolean;
  isSpoiler?: boolean;
  /**
   * The note this member wrote about THIS viewing — the one the log is on.
   * Only ever passed for the log's owner, and only from the Vault; the log row
   * itself no longer carries a note at all.
   */
  note?: string | null;
  /** Opens the note in full. Absent while the Vault is still being opened. */
  onOpenNote?: () => void;
  /**
   * The owner's Vault could not be opened: said, never left to look as though
   * no note was written. (No note's text is claimed either way.)
   */
  noteUnreachable?: boolean;
  onRereadNote?: () => void;
}

const QUOTE = { size: 19, line: 27, padX: 22 } as const;

export default function LogReviewBody({
  review, pullQuote, dropCap, accent, isOwner, isSpoiler, note, onOpenNote, noteUnreachable = false, onRereadNote,
}: LogReviewBodyProps) {
  const scale = useTextScale();
  const column = useColumnWidth();
  // Each slur struck for a reader who asked (StruckWords); the words as written otherwise.
  const struck = useStruck();
  const cleanReview = struck(stripHTML(review ?? ''));
  const quote = struck(pullQuote?.trim() || null);
  const vaultUnread = isOwner && !note && noteUnreachable;
  // A rating-only log with no quote, no essay and no note draws nothing.
  if (!quote && !cleanReview && !(isOwner && note) && !vaultUnread) return null;

  // Set the essay as paragraphs, the raised initial on the first only.
  const split = cleanReview.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  const paragraphs = split.length ? split : cleanReview ? [cleanReview] : [];
  // The member's own writing direction, read from the text: iOS gives an Arabic essay the
  // device's left-to-right base otherwise, and drops each full stop at the far left.
  const rtl = isRTLText(cleanReview);
  // No raised initial on a joined script: a letter lifted out of an Arabic word breaks the word.
  // Nor on one opening with a struck word, which has no letter of its own to raise.
  const dc = dropCap && !rtl && paragraphs[0] && !paragraphs[0].startsWith(STRUCK_OPENS) ? extractDropCap(paragraphs[0]) : null;
  const quoteWidth = quote
    ? balancedWidth(`${OPEN_QUOTE}${quote}${CLOSE_QUOTE}`, 'spectralItalic', QUOTE.size, scale, column - PAGE.pad * 2 - QUOTE.padX * 2)
    : 0;

  return (
    <View>
      {/* Veiled where it was filed with spoilers; its author always reads their own. */}
      {quote || paragraphs.length ? (
        <SpoilerVeil isSpoiler={isSpoiler} bypass={isOwner} leader>
          {quote ? (
            <View style={st.intertitle}>
              <View style={st.intertitleRule} pointerEvents="none" />
              <Text style={[st.quote, { width: quoteWidth }, isRTLText(quote) && st.rtl]} {...scaledTextProps}>{OPEN_QUOTE}{quote}{CLOSE_QUOTE}</Text>
            </View>
          ) : null}
          {paragraphs.length ? (
            <View style={st.words}>
              {paragraphs.map((para, i) => {
                const spaced = i < paragraphs.length - 1 && st.spaced;
                if (i === 0 && dc && dc.first) {
                  return (
                    // The initial is an ornament, never grown; the paragraph grows as every other does.
                    <Text key={i} style={[st.paragraph, spaced]} {...scaledTextProps}>
                      <Text style={[st.initial, { color: accent }]} allowFontScaling={false}>{dc.first}</Text>{dc.rest}
                    </Text>
                  );
                }
                return <Text key={i} style={[st.paragraph, spaced, rtl && st.rtl]} {...scaledTextProps}>{para}</Text>;
              })}
            </View>
          ) : null}
        </SpoilerVeil>
      ) : null}

      {/* THE VAULT — the note about this viewing, its author's eyes only, outside the veil: a
          member is never veiled from their own writing, and a note is not the critique. */}
      {isOwner && !!note ? (
        <PageSection title="THE VAULT · ONLY YOU">
          <VaultNote note={note} onOpen={onOpenNote} paper />
        </PageSection>
      ) : null}
      {vaultUnread ? (
        <PageSection title="THE VAULT · ONLY YOU">
          <View style={st.vaultUnread}>
            <Text style={st.vaultUnreadText} {...scaledTextProps}>The Vault could not be opened.</Text>
            {onRereadNote ? <TryAgainLine onPress={onRereadNote} what="open the Vault" /> : null}
          </View>
        </PageSection>
      ) : null}
    </View>
  );
}

const st = StyleSheet.create({
  intertitle: {
    marginTop: 22, backgroundColor: colors.inkwell, borderRadius: 3,
    paddingTop: 20, paddingBottom: 18, paddingHorizontal: QUOTE.padX, alignItems: 'center',
  },
  intertitleRule: { position: 'absolute', top: 3, left: 3, right: 3, bottom: 3, borderWidth: 1, borderColor: colors.sepiaBorderStrong, borderRadius: 2 },
  quote: { fontFamily: fonts.serifItalic, fontSize: QUOTE.size, lineHeight: QUOTE.line, color: colors.silverScreen, textAlign: 'center' },
  words: { marginTop: 18 },
  paragraph: { fontFamily: fonts.body, fontSize: 14, lineHeight: 21, color: colors.parchment },
  spaced: { marginBottom: 14 },
  initial: { fontFamily: fonts.display, fontSize: 44, lineHeight: 39 },
  rtl: { writingDirection: 'rtl', textAlign: 'right' },
  vaultUnread: { marginTop: 10, gap: 4 },
  vaultUnreadText: { fontFamily: fonts.bodyItalic, fontSize: 13, lineHeight: 19, color: colors.fog },
});
