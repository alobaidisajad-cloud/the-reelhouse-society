import { memo } from 'react';
import { View, Text, TextInput } from 'react-native';
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
import { MAX_LENGTHS } from '@/src/utils/sanitizeInput';
import { PaperKeyWell } from './PaperKeyWell';

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
  kind, me, hour, body, film, remaining, spoiler, source,
  onBody, onBack, onFile, onFilm, onStill, onSpoiler, onSource, ready, sending,
}: {
  kind: string;
  me: PaperAuthor;
  /** A wire's provenance. Ignored by every other kind, required by this one. */
  source?: string;
  /** Absent in the harness, like `onBody` — then the field is drawn, not typed. */
  onSource?: (text: string) => void;
  /** Set when the desk OPENS — never on a timer, which would re-render the
   *  composer every sixty seconds while somebody is typing. */
  hour: string;
  body: string;
  film?: PaperFilm | null;
  remaining: number;
  spoiler?: boolean;
  /**
   * Absent in the render harness, which draws a fixed draft. Present in the app,
   * where this is the field the member actually types into — so the desk that
   * says "this is how it prints" is the same surface that takes the writing,
   * rather than a picture of one.
   */
  onBody?: (text: string) => void;
  onBack?: () => void;
  onFile?: () => void;
  onFilm?: () => void;
  onStill?: () => void;
  onSpoiler?: () => void;
  /** FILE IT is lit only when there is something to file and room to file it. */
  ready?: boolean;
  sending?: boolean;
}) {
  const tier = me.tier;
  // Live in the app, drawn in the harness. `onBody` is what decides which, so a
  // screenshot never has to pretend to hold state and the app never has to
  // render a control that refuses to type.
  const live = !!onBody;
  const canFile = ready !== undefined ? ready : body.trim().length > 0 && remaining >= 0;
  const blocked = !canFile || !!sending;
  return (
    <View style={p.screen}>
      <View style={p.ch}>
        <PressableScale onPress={onBack} hitSlop={{ top: 12, bottom: 12, left: 0, right: 8 }} accessibilityRole="button" accessibilityLabel="Back, without filing">
          <Text style={p.chs} {...scaledTextProps}>BACK</Text>
        </PressableScale>
        <Text style={p.chm} {...decorativeTextProps}>{kind.toUpperCase()}</Text>
        {/* Lit only when the form is ready. A permanently bright confirm on an
            unfinished draft is a button that lies about being ready — the same
            rule DeskHead already follows, applied here so the two desks agree. */}
        <PressableScale
          onPress={blocked ? undefined : onFile} disabled={blocked}
          hitSlop={{ top: 12, bottom: 12, left: 8, right: 0 }} haptic="medium"
          accessibilityRole="button"
          accessibilityState={{ disabled: blocked }}
          accessibilityLabel={canFile ? 'File it' : 'File it. Not ready yet'}>
          <Text style={[p.chs, canFile && p.chsGo, blocked && { opacity: 0.4 }]} {...scaledTextProps}>
            {sending ? 'FILING…' : 'FILE IT'}
          </Text>
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
            {/* ── THE LEAD-IN IS THE HOUSE, THE REST IS THE MEMBER ──────────
                The lead-in cannot live inside the input: it is not the member's
                text, and putting it there would let them delete it, select it,
                or type before it. So it is printed, and the field sets itself
                immediately after — which is also what makes the desk print the
                same shape the page will.

                In the harness there is no `onBody`, so this stays a Text with
                the drawn caret and every screenshot is unchanged. */}
            <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
              <Text
                style={
                  kind === 'seeking' ? p.seekingLead
                    : kind === 'wire' ? p.wireDateline
                      : [p.leadIn, { color: KIND_RULE.take }]
                }
                {...decorativeTextProps}
              >
                {/* `WIRE — `, not `SOURCE — `. The card prints `WIRE — ` here
                    (PaperPost's wire branch) and prints the SOURCE beside the
                    byline as a dateline. This label said the field below it was
                    the source, which is the one thing this component exists to
                    prevent: its own note two paragraphs up says a desk that
                    promises "this is how it prints" and then prints something
                    else is the defect. */}
                {kind === 'seeking' ? 'SEEKING — ' : kind === 'wire' ? 'WIRE — ' : 'TAKE — '}
              </Text>
              {live ? (
                <TextInput
                  style={[
                    kind === 'seeking' ? p.seeking : kind === 'wire' ? p.wire : p.take,
                    { flex: 1, minWidth: 0, padding: 0 },
                  ]}
                  value={body}
                  onChangeText={onBody}
                  multiline
                  autoFocus
                  selectionColor={colors.sepia}
                  // No maxLength. The composer must let a member finish a
                  // sentence and then say it is over by how much — a field that
                  // silently stops accepting characters mid-word is how the
                  // dossier composer used to destroy a draft.
                  accessibilityLabel={`Your ${kind}`}
                  {...scaledTextProps}
                />
              ) : (
                <Text
                  style={[
                    kind === 'seeking' ? p.seeking : kind === 'wire' ? p.wire : p.take,
                    { flex: 1, minWidth: 0 },
                  ]}
                  {...scaledTextProps}
                >
                  {body}<Text style={p.caret} {...UNSPOKEN}>|</Text>
                </Text>
              )}
            </View>

            {/* ── A WIRE CARRIES ITS SOURCE ──────────────────────────────────
                The picker promises "News from elsewhere, carrying its source",
                the database refuses a wire without one, and the card prints it
                as the dateline beside the byline — and there was nowhere to
                type it. The desk asked for a FILM instead and filed the film's
                TITLE as the source, so a wire's provenance read `TOKYO STORY`.

                It sits on the paper as part of the form, not behind a tool,
                because a required field hidden behind a control is a member
                being refused at the end by a rule they were never shown. */}
            {kind === 'wire' ? (
              <View style={p.field}>
                <Text style={p.fieldLabel} {...decorativeTextProps}>SOURCE — REQUIRED</Text>
                {onSource ? (
                  <TextInput
                    style={[p.fieldValue, { padding: 0 }]}
                    value={source ?? ''}
                    onChangeText={onSource}
                    placeholder="where did this come from?"
                    placeholderTextColor={colors.fog}
                    autoCorrect={false}
                    selectionColor={colors.sepia}
                    // The only maxLength on this desk. The body has none on
                    // purpose — a member must be able to finish a sentence and
                    // be told by how much they are over. A source is a name or a
                    // URL: there is no sentence to finish, and the column simply
                    // will not take more than a hundred characters.
                    maxLength={MAX_LENGTHS.wireSource}
                    accessibilityLabel="Where this came from"
                    {...scaledTextProps}
                  />
                ) : (
                  <Text style={[p.fieldValue, !source && { color: colors.fog, opacity: 0.6 }]}
                    numberOfLines={1} {...scaledTextProps}>
                    {source || 'where did this come from?'}
                  </Text>
                )}
              </View>
            ) : null}

            {film ? <Credit film={film} /> : null}
          </View>
        </View>
      </View>

      {/* Tools and the count on one rail — the count now has something to
          belong to instead of floating in the middle of the page. */}
      <View style={p.rail}>
        <PressableScale style={p.railTool} hitSlop={{ top: 10, bottom: 10, left: 0, right: 0 }} onPress={onFilm} accessibilityRole="button" accessibilityState={{ selected: !!film }} accessibilityLabel="Name a film">
          <FilmIcon size={13} strokeWidth={2} color={film ? colors.sepia : colors.bone} />
          <Text style={[p.rl, film && { color: colors.sepia }]} {...scaledTextProps}>FILM</Text>
        </PressableScale>
        <PressableScale style={p.railTool} hitSlop={{ top: 10, bottom: 10, left: 0, right: 0 }} onPress={onStill} accessibilityRole="button" accessibilityLabel="Add a still">
          <ImageIcon size={13} strokeWidth={2} color={colors.bone} />
          <Text style={p.rl} {...scaledTextProps}>STILL</Text>
        </PressableScale>
        <PressableScale style={p.railTool} hitSlop={{ top: 10, bottom: 10, left: 0, right: 0 }} onPress={onSpoiler} accessibilityRole="button" accessibilityState={{ selected: !!spoiler }} accessibilityLabel="Mark a spoiler">
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
      {/* Drawn in the harness, where `onBody` is absent; the keyboard's real
          height in the app, where it is not. See PaperKeyWell. */}
      <PaperKeyWell drawn={!live} />
    </View>
  );
});
