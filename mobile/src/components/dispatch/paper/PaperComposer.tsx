import { memo } from 'react';
import { View, Text } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { FilmIcon, ImageIcon, AlertTriangle } from 'lucide-react-native';

import PressableScale from '@/src/components/PressableScale';
import { colors } from '@/src/theme/theme';
import { BRASS, BRASS_STOPS } from '@/src/theme/brass';
import { scaledTextProps, decorativeTextProps } from '@/src/constants/textScaling';
import { p } from './paperStyles';
import { COUNTER_SHOWS_AT, KIND_RULE, CRIMSON_INK, UNSPOKEN } from './paperMetrics';
import { Credit, type PaperAuthor, type PaperFilm } from './PaperPost';

/**
 * ── THE COPY DESK ────────────────────────────────────────────────────────────
 * You write onto the page itself. Not a form, not a form-then-preview — the
 * sheet you are typing on IS the filing, with its hour in the margin, the rule
 * beside it, and your byline already set.
 *
 * ── WHAT THE RENDER KILLED ───────────────────────────────────────────────────
 * The first version was a small bordered box floating near the top of an
 * otherwise empty screen, with the character count stranded in the middle of
 * the void beneath it and a dimmed action row inside the sheet. Three faults,
 * and the render made all three obvious at a glance:
 *
 *   · A SHEET THAT DOES NOT FILL THE ROOM reads as a widget, not a page. The
 *     document now runs the full writing area, exactly as it does in the feed,
 *     so the thing under your thumb is the paper rather than a preview of it.
 *
 *   · THE COUNT BELONGS BESIDE THE TOOLS. Floating alone under the sheet it had
 *     nothing to belong to and looked like debris.
 *
 *   · NO ACTION ROW. Showing CERTIFY on a post that does not exist yet invites
 *     the question "can I certify my own draft?", and the answer is that the
 *     row was decoration pretending to be information.
 *
 * The watermark went too. "THIS IS HOW IT PRINTS" was the design apologising
 * for itself; if the margin, the rule and the byline are on screen while you
 * type, the point is already made.
 */
export const PaperComposer = memo(function PaperComposer({
  kind, me, hour, body, film, remaining, spoiler,
}: {
  kind: string;
  me: PaperAuthor;
  /** Set when the desk OPENS — never on a timer, which would re-render the
   *  composer every sixty seconds while somebody is typing. */
  hour: string;
  body: string;
  film?: PaperFilm | null;
  remaining: number;
  spoiler?: boolean;
}) {
  const tier = me.tier;
  return (
    <View style={p.screen}>
      <View style={p.ch}>
        <PressableScale hitSlop={{ top: 12, bottom: 12, left: 0, right: 8 }} accessibilityRole="button" accessibilityLabel="Back, without filing">
          <Text style={p.chs} {...scaledTextProps}>BACK</Text>
        </PressableScale>
        <Text style={p.chm} {...decorativeTextProps}>{kind.toUpperCase()}</Text>
        <PressableScale hitSlop={{ top: 12, bottom: 12, left: 8, right: 0 }} haptic="medium" accessibilityRole="button" accessibilityLabel="File it">
          <Text style={[p.chs, p.chsGo]} {...scaledTextProps}>FILE IT</Text>
        </PressableScale>
      </View>

      {/* The document, filling the room — the same frame the feed uses. */}
      <View style={p.deskDoc}>
        <View style={p.postRow}>
          <View style={p.margin}>
            <Text style={p.marginValue} {...decorativeTextProps}>{hour}</Text>
          </View>

          {/* The rule is NOT tiered here any more. It was left keyed to tier
              from an earlier draft, so an Auteur wrote against a crimson rule
              that the feed never draws — and crimson is now the Auteur ring's
              colour, so the desk was promising a page it would not print.
              Tier lives on the avatar; the rule is the rule. */}
          <View style={p.column}>
            <View style={p.byline}>
              <View style={p.avatar}>
                {me.avatar ? (
                  <Image source={{ uri: me.avatar }} style={p.plateArt} contentFit="cover" />
                ) : (
                  <Text style={p.avatarNo} {...decorativeTextProps}>{me.memberNo}</Text>
                )}
              </View>
              <Text
                style={[p.bylineName, tier === 'auteur' && { color: CRIMSON_INK, opacity: 1 }]}
                numberOfLines={1} {...scaledTextProps}
              >
                {me.name.toUpperCase()} · No. {me.memberNo}
              </Text>
            </View>

            {/* The desk prints the FORM, not just the words. A seeking post
                opens with its lead-in and a wire with its source, so what you
                are typing into is the shape it will take on the page. Without
                this the desk promised "this is how it prints" and then printed
                something else. */}
            {kind === "seeking" ? (
              <Text style={p.seeking} {...scaledTextProps}>
                <Text style={p.seekingLead}>SEEKING — </Text>{body}<Text style={p.caret} {...UNSPOKEN}>|</Text>
              </Text>
            ) : kind === "wire" ? (
              <Text style={p.wire} {...scaledTextProps}>
                <Text style={p.wireDateline}>SOURCE — </Text>{body}<Text style={p.caret} {...UNSPOKEN}>|</Text>
              </Text>
            ) : (
              <Text style={p.take} {...scaledTextProps}>
                <Text style={[p.leadIn, { color: KIND_RULE.take }]}>TAKE — </Text>
                {body}<Text style={p.caret} {...UNSPOKEN}>|</Text>
              </Text>
            )}

            {film ? <Credit film={film} /> : null}
          </View>
        </View>
      </View>

      {/* Tools and the count on one rail — the count now has something to
          belong to instead of floating in the middle of the page. */}
      <View style={p.rail}>
        <PressableScale style={p.railTool} hitSlop={{ top: 10, bottom: 10, left: 0, right: 0 }} accessibilityRole="button" accessibilityLabel="Name a film">
          <FilmIcon size={13} strokeWidth={2} color={film ? colors.sepia : colors.bone} />
          <Text style={[p.rl, film && { color: colors.sepia }]} {...scaledTextProps}>FILM</Text>
        </PressableScale>
        <PressableScale style={p.railTool} hitSlop={{ top: 10, bottom: 10, left: 0, right: 0 }} accessibilityRole="button" accessibilityLabel="Add a still">
          <ImageIcon size={13} strokeWidth={2} color={colors.bone} />
          <Text style={p.rl} {...scaledTextProps}>STILL</Text>
        </PressableScale>
        <PressableScale style={p.railTool} hitSlop={{ top: 10, bottom: 10, left: 0, right: 0 }} accessibilityRole="button" accessibilityLabel="Mark a spoiler">
          <AlertTriangle size={13} strokeWidth={2} color={spoiler ? colors.crimson : colors.bone} />
          <Text style={[p.rl, spoiler && { color: CRIMSON_INK }]} {...scaledTextProps}>SPOILER</Text>
        </PressableScale>
        <View style={{ flex: 1 }} />
        {/* Quiet until it could plausibly matter. A counter watching from the
            first word makes a memory fence feel like an editorial one. */}
        {remaining <= COUNTER_SHOWS_AT ? (
          <Text style={[p.rl, remaining < 0 && { color: CRIMSON_INK }]} {...scaledTextProps}>
            {remaining < 0 ? `OVER BY ${Math.abs(remaining)}` : `${remaining} LEFT`}
          </Text>
        ) : null}
      </View>
      <View style={p.kbd}><Text style={p.kbdLabel}>KEYBOARD</Text></View>
    </View>
  );
});
