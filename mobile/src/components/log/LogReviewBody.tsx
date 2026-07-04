
import React from 'react';
import { View, Text } from 'react-native';
import { Sparkles, Lock } from 'lucide-react-native';
import { colors } from '@/src/theme/theme';
import { extractDropCap, stripHTML } from '@/src/utils/text';
import { s } from '@/src/components/log/logDetailStyles';
import SpoilerVeil from '@/src/components/SpoilerVeil';

interface LogReviewBodyProps {
  review?: string | null;
  pullQuote?: string | null;
  dropCap?: boolean;
  isAuteur: boolean;
  isOwner: boolean;
  isSpoiler?: boolean;
  privateNotes?: string | null;
}

export default function LogReviewBody({
  review,
  pullQuote,
  dropCap,
  isAuteur,
  isOwner,
  isSpoiler,
  privateNotes,
}: LogReviewBodyProps) {
  return (
    <View style={s.reviewSection}>

      {/* COMP-SPOILER-1: veil the critique when flagged; the author always sees their own. */}
      <SpoilerVeil isSpoiler={isSpoiler} bypass={isOwner}>

      {pullQuote && (
        <View style={s.featuredQuoteWrap}>
           {/* Ornamental divider */}
           <View style={s.ornamentalRow}>
             <View style={s.ornamentalLine} />
             <Sparkles size={8} color={colors.sepia} strokeWidth={1.5} style={s.ornamentalStar} />
             <View style={s.ornamentalLine} />
           </View>
           <Text style={[s.featuredQuote, isAuteur && s.featuredQuoteAuteur]} adjustsFontSizeToFit numberOfLines={6} minimumFontScale={0.7}>« {pullQuote} »</Text>
           {/* Ornamental divider bottom */}
           <View style={s.ornamentalRow}>
             <View style={s.ornamentalLine} />
             <Sparkles size={8} color={colors.sepia} strokeWidth={1.5} style={s.ornamentalStar} />
             <View style={s.ornamentalLine} />
           </View>
        </View>
      )}

      {review && (() => {
        const cleanReview = stripHTML(review);
        if (!cleanReview) return null;

        // Set the essay as paragraphs — real rhythm at any length, drop cap on the first only.
        const split = cleanReview.split(/\n{2,}/).map(p => p.trim()).filter(Boolean);
        const paragraphs = split.length ? split : [cleanReview];
        const dc = dropCap ? extractDropCap(paragraphs[0]) : null;

        return (
          <View style={s.reviewBodyWrap}>
            {paragraphs.map((para, i) => {
              const spaced = i < paragraphs.length - 1;
              if (i === 0 && dc && dc.first) {
                return (
                  <Text key={i} style={[s.dropCapParagraph, spaced && s.reviewParagraphSpaced]}>
                    <Text style={s.dropCapLetter}>{dc.first}</Text>{dc.rest}
                  </Text>
                );
              }
              return (
                <Text key={i} style={[s.reviewParagraph, spaced && s.reviewParagraphSpaced]}>
                  {para}
                </Text>
              );
            })}
          </View>
        );
      })()}

      </SpoilerVeil>

      {/* PRIVATE NOTES (Only visible to the log owner) */}
      {isOwner && privateNotes && (
        <View style={s.privateNotesWrap}>
           <View style={s.privateNotesHeader}>
              <Lock size={10} color={colors.sepia} />
              <Text style={s.privateNotesLabel}>PRIVATE ARCHIVIST NOTES</Text>
           </View>
           <Text style={s.privateNotesBody}>
              {privateNotes}
           </Text>
        </View>
      )}
    </View>
  );
}
