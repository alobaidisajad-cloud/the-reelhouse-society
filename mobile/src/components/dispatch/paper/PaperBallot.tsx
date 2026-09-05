import { memo } from 'react';
import { View, Text } from 'react-native';
import { Image } from 'expo-image';

import PressableScale from '@/src/components/PressableScale';
import { colors } from '@/src/theme/theme';
import { scaledTextProps, decorativeTextProps, displayTextProps } from '@/src/constants/textScaling';
import { p } from './paperStyles';
import { counted } from './paperText';
import { BALLOT_PERCENT_FLOOR, UNSPOKEN } from './paperMetrics';
import { PaperFill } from './PaperFill';
import { Byline, PaperActions, type PaperAuthor, type PaperFilm } from './PaperPost';

export interface BallotOption extends PaperFilm { votes: number }

/**
 * ── PERCENTAGES THAT ADD TO 100 ──────────────────────────────────────────────
 * Rounding three shares independently gives 99% or 101%, which is the kind of
 * detail that quietly tells a member the app is careless. Largest remainder:
 * floor everything, then hand the leftover points to whoever lost the most in
 * the rounding.
 */
export function shares(votes: number[]): number[] {
  const total = votes.reduce((a, b) => a + b, 0);
  if (total <= 0) return votes.map(() => 0);
  const exact = votes.map((v) => (v / total) * 100);
  const out = exact.map(Math.floor);
  let left = 100 - out.reduce((a, b) => a + b, 0);
  const order = exact
    .map((e, i) => ({ i, rem: e - Math.floor(e) }))
    .sort((a, b) => b.rem - a.rem);
  for (let k = 0; left > 0 && k < order.length; k++, left--) out[order[k].i] += 1;
  return out;
}

const ROMAN = ['I.', 'II.', 'III.', 'IV.', 'V.', 'VI.'];

/**
 * ── THE BALLOT ───────────────────────────────────────────────────────────────
 * Films only. Not a general poll tool — a general poll tool is a page that
 * drifts away from cinema by its second week, and an option that is always a
 * film is an option that always has a poster and always looks composed.
 *
 * Three states, one component:
 *   · open, unvoted    empty boxes, no numbers at all. You cannot see the
 *                      result until you mark it — that is the whole engine.
 *   · open, voted      a crimson ✗ in your box, and a brass rule that FILLS.
 *                      Not a coloured progress bar; a rule, the way a set page
 *                      would carry a tally.
 *   · closed           the winner lifted out and set large, the rest dimmed
 *                      beneath. It stops being a question and becomes a record.
 *
 * `closes_at` is read at render time, so a ballot closes without anything
 * having to run.
 *
 * ── BUT THE COUNT IS NOT RENDER-TIME, AND THIS SAID IT WAS ──────────────────
 * The line here read: "There is no scheduled job anywhere in this design, so
 * there is no job that can silently stop running." That was wrong, and it is
 * the sentence that would have stopped anybody looking.
 *
 * A ballot's numbers come from `frozen_totals` on the post. That column is
 * written by exactly one thing — `freeze_closed_ballots()` — which is REVOKEd
 * from anon and authenticated, so the app cannot call it, and its own comment
 * says a cron runs it. Checked against production: `cron.job` is EMPTY. So the
 * column was never filled for any ballot, ever.
 *
 * Proved with real rows in a rolled-back transaction: a ballot closed an hour
 * earlier with a vote on it had `frozen_totals = NULL`, and calling the
 * function by hand immediately produced `{"total": 1, "counts": {"0": 1}}`. The
 * function is correct. Nothing was calling it.
 *
 * ── AND UNTIL IT IS CALLED, THIS COMPONENT LIED ─────────────────────────────
 * With no totals every option reads 0, so `total` is 0, so a closed ballot
 * printed NO BALLOTS WERE CAST — under a question fifty members may have
 * marked. `sealed` is what separates "counted, and nobody voted" from "not
 * counted yet", which are different sentences and must not share one.
 *
 * That distinction matters even once the job exists: between a ballot closing
 * and the next run there is always a window, and the page must be honest inside
 * it rather than announcing a result that has not been worked out.
 */
export const PaperBallot = memo(function PaperBallot({
  question, author, options, myVote, closed, closesLabel, sealed = true,
  certifyCount, commentCount, certified, saved, showKind = true,
  onVote, onCertify, onCritique, onShare, onSave, onAuthor,
}: {
  /**
   * Has the result actually been counted?
   *
   * `frozen_totals IS NOT NULL` on the post. Without it every option reads 0 and
   * a closed ballot cannot tell "nobody voted" from "not counted yet" — it
   * printed the first, which is a false statement about what the house did.
   *
   * Defaults TRUE so the render harness, which draws finished ballots with real
   * numbers, is unchanged; the app passes the real thing.
   */
  sealed?: boolean;
  /**
   * A vote is cast once and never changed — the database enforces it with
   * UNIQUE (post_id, user_id). So the options stop being controls the moment
   * one is marked, rather than inviting a second tap the house will refuse.
   */
  onVote?: (index: number) => void;
  onCertify?: (next: boolean) => void;
  onCritique?: () => void;
  onShare?: () => void;
  onSave?: (next: boolean) => void;
  onAuthor?: () => void;
  question: string;
  author: PaperAuthor | null;
  options: BallotOption[];
  myVote?: number | null;
  closed?: boolean;
  closesLabel: string;
  certifyCount?: number;
  commentCount?: number;
  certified?: boolean;
  saved?: boolean;
  showKind?: boolean;
}) {
  const votes = options.map((o) => o.votes);
  const total = votes.reduce((a, b) => a + b, 0);
  const revealed = closed || myVote != null;
  // One number, one source: the total is the sum of the options, never a second
  // stored column that can disagree with them.
  const showPercent = revealed && total >= BALLOT_PERCENT_FLOOR;
  const pct = showPercent ? shares(votes) : votes.map(() => 0);

  /**
   * A result exists only when the count has been SEALED. Until then every
   * option reads 0 and crowning the first of them would name a winner the house
   * never chose.
   */
  const hasResult = closed && sealed;
  const top = hasResult && total > 0
    ? votes.indexOf(Math.max(...votes))
    : -1;

  return (
    <View style={p.post}>
      {/* The closing time is apparatus, so it sits alone in the head. The KIND
          is not apparatus — it belongs on the line the member reads, in its own
          colour, exactly as TAKE, SEEKING, WIRE and DOSSIER do. Naming it in a
          chip up here made it the one kind whose word was chrome. */}
      <View style={p.ballotHead}>
        <View />
        <Text style={p.ballotClose} {...scaledTextProps}>
          {closed ? 'CLOSED' : closesLabel.toUpperCase()}
        </Text>
      </View>

      <Text style={p.ballotQ} accessibilityRole="header" {...displayTextProps}>
        {showKind ? <Text style={p.ballotLead}>BALLOT — </Text> : null}{question}
      </Text>

      {!closed && (
        <View style={{ alignItems: 'center' }}>
          <Byline author={author} onPress={onAuthor} />
        </View>
      )}

      <View style={[p.hair, { marginTop: 12 }]} />

      {hasResult && total > 0 && (
        <View style={p.wonWrap}>
          <Text style={p.wonLabel} {...decorativeTextProps}>THE HOUSE CHOSE</Text>
          {/* The winner gets the hero's full treatment — glow host, brass rim,
              the art proud of the page. A closed ballot is a record, and a
              record deserves the object rather than a rectangle. */}
          <View style={p.plateGlow}>
            <View style={p.wonPoster}>
              {options[top].posterPath ? (
                <Image source={{ uri: options[top].posterPath }} style={p.plateArt} contentFit="cover" />
              ) : null}
            </View>
          </View>
          <Text style={p.wonTitle} {...displayTextProps}>{options[top].title.toUpperCase()}</Text>
          <Text style={p.wonMeta} {...scaledTextProps}>
            {[options[top].year, options[top].director?.toUpperCase()].filter(Boolean).join(' · ')}
          </Text>
          {/* ── HIDING A PERCENTAGE IS NOT PRINTING ZERO ─────────────────────
              This read `{pct[top]}% OF …` unconditionally. Below
              BALLOT_PERCENT_FLOOR the whole `pct` array is zeros — that is how
              percentages are suppressed on a ballot too small for one to mean
              anything — so a closed ballot with nine votes printed

                  0% OF 9 BALLOTS

              under the film the house had just chosen with seven of them. A
              false number, set as the permanent record of a decision.

              Below the floor the honest line is the COUNT, which says the same
              thing and cannot be wrong: 7 OF 9 BALLOTS. */}
          <Text style={[p.wonMeta, { marginTop: 8, color: colors.sepia }]} {...scaledTextProps}>
            {showPercent
              ? `${pct[top]}% OF ${counted(total, 'BALLOT', 'BALLOTS')}`
              : `${votes[top]} OF ${counted(total, 'BALLOT', 'BALLOTS')}`}
          </Text>
          <View style={[p.hair, { marginTop: 16, alignSelf: 'stretch' }]} />
        </View>
      )}

      {/* Two different sentences, which shared one for as long as the count was
          never run. "Nobody voted" is a fact about the house; "not counted yet"
          is a fact about the machinery, and printing the first while the second
          is true tells a member their ballot was ignored. */}
      {hasResult && total === 0 && (
        <Text style={[p.ballotFoot, { marginTop: 16 }]} {...scaledTextProps}>
          NO BALLOTS WERE CAST
        </Text>
      )}

      {closed && !sealed && (
        <Text style={[p.ballotFoot, { marginTop: 16 }]} {...scaledTextProps}>
          THE COUNT IS BEING SEALED
        </Text>
      )}

      {options.map((o, i) => {
        if (hasResult && i === top) return null;
        const marked = myVote === i;
        return (
          <View key={i}>
            {i > 0 && !closed && <View style={[p.hair, { opacity: 0.6 }]} />}
            <PressableScale
              style={[p.option, closed && { opacity: 0.82 }]}
              hitSlop={{ top: 4, bottom: 4, left: 0, right: 0 }}
              haptic
              onPress={onVote ? () => onVote(i) : undefined}
              // Closed, already marked, or nobody signed in. The second is the
              // important one: a ballot you have voted in is a result to read,
              // not a form to fill again, and the row the server would refuse
              // must not look pressable.
              //
              // The third was missing. `onVote?.(i)` turned an absent handler
              // into a tap that did nothing, so a signed-out reader could mark a
              // ballot all day and watch the page ignore them.
              disabled={closed || myVote != null || !onVote}
              accessibilityRole="radio"
              // The state a reader announces has to match the state the control
              // is actually in. It said `disabled: closed` while the row was ALSO
              // disabled once you had voted — so after marking a ballot, every
              // other option announced itself as available to press.
              // The same three reasons as `disabled` above, and the same value —
              // this line already had to be corrected once for announcing an
              // available control that was not, so it is written from the same
              // expression rather than restated.
              accessibilityState={{ checked: marked, disabled: !!closed || myVote != null || !onVote }}
              accessibilityLabel={
                showPercent
                  ? `Option ${i + 1} of ${options.length}. ${o.title}. ${pct[i]} percent, ${counted(o.votes ?? 0, 'ballot', 'ballots')}.${marked ? ' Your mark.' : ''}`
                  : `Option ${i + 1} of ${options.length}. ${o.title}. Mark this.`
              }
            >
              <Text style={p.optionNo} {...decorativeTextProps}>{ROMAN[i]}</Text>
              {!closed && (
                <View style={p.box}>
                  {marked && <Text style={p.boxMark} {...UNSPOKEN} {...decorativeTextProps}>✗</Text>}
                </View>
              )}
              <View style={[p.optionPoster, closed && { width: 22, height: 33 }]}>
                {o.posterPath ? (
                  <Image source={{ uri: o.posterPath }} style={[p.plateArt, p.artHeld]} contentFit="cover" />
                ) : null}
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                {revealed ? (
                  <>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}>
                      <Text style={p.optionTitle} numberOfLines={1} {...scaledTextProps}>
                        {o.title.toUpperCase()}
                      </Text>
                      {showPercent && (
                        <Text style={p.percent} {...scaledTextProps}>{pct[i]}%</Text>
                      )}
                    </View>
                    {showPercent && !closed && (
                      // Filled, not drawn. The result being revealed is the one
                      // deliberately theatrical moment `paperMotion` allows this
                      // page, and it was specified and never built.
                      <PaperFill percent={pct[i]} index={i} />
                    )}
                  </>
                ) : (
                  <>
                    <Text style={p.optionTitle} numberOfLines={1} {...scaledTextProps}>
                      {o.title.toUpperCase()}
                    </Text>
                    <Text style={p.optionMeta} numberOfLines={1} {...scaledTextProps}>
                      {[o.year, o.director?.toUpperCase()].filter(Boolean).join(' · ')}
                    </Text>
                  </>
                )}
              </View>
            </PressableScale>
          </View>
        );
      })}

      <Text style={p.ballotFoot} {...scaledTextProps}>
        {closed
          ? ''
          : revealed
            ? counted(total, 'BALLOT CAST', 'BALLOTS CAST')
            : 'MARK YOUR BALLOT'}
      </Text>

      {closed && <View style={{ alignItems: 'center', marginTop: 8 }}><Byline author={author} onPress={onAuthor} /></View>}

      <PaperActions
        certifyCount={certifyCount} commentCount={commentCount}
        certified={certified} saved={saved}
        onCertify={onCertify} onCritique={onCritique}
        onShare={onShare} onSave={onSave}
      />
    </View>
  );
});
