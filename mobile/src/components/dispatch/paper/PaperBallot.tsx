import { memo } from 'react';
import { View, Text } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';

import PressableScale from '@/src/components/PressableScale';
import { colors } from '@/src/theme/theme';
import { BRASS, BRASS_STOPS } from '@/src/theme/brass';
import { scaledTextProps, decorativeTextProps, displayTextProps } from '@/src/constants/textScaling';
import { p } from './paperStyles';
import { BALLOT_PERCENT_FLOOR, UNSPOKEN } from './paperMetrics';
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
 * `closes_at` is read at render time. There is no scheduled job anywhere in
 * this design, so there is no job that can silently stop running.
 */
export const PaperBallot = memo(function PaperBallot({
  question, author, options, myVote, closed, closesLabel,
  certifyCount, commentCount, certified, saved, showKind = true,
}: {
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

  const top = closed && total > 0
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
          <Byline author={author} />
        </View>
      )}

      <View style={[p.hair, { marginTop: 12 }]} />

      {closed && total > 0 && (
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
          <Text style={[p.wonMeta, { marginTop: 8, color: colors.sepia }]} {...scaledTextProps}>
            {pct[top]}% OF {total} BALLOTS
          </Text>
          <View style={[p.hair, { marginTop: 16, alignSelf: 'stretch' }]} />
        </View>
      )}

      {closed && total === 0 && (
        <Text style={[p.ballotFoot, { marginTop: 16 }]} {...scaledTextProps}>
          NO BALLOTS WERE CAST
        </Text>
      )}

      {options.map((o, i) => {
        if (closed && i === top) return null;
        const marked = myVote === i;
        return (
          <View key={i}>
            {i > 0 && !closed && <View style={[p.hair, { opacity: 0.6 }]} />}
            <PressableScale
              style={[p.option, closed && { opacity: 0.82 }]}
              hitSlop={{ top: 4, bottom: 4, left: 0, right: 0 }}
              haptic
              disabled={closed}
              accessibilityRole="radio"
              accessibilityState={{ checked: marked, disabled: !!closed }}
              accessibilityLabel={
                showPercent
                  ? `Option ${i + 1} of ${options.length}. ${o.title}. ${pct[i]} percent, ${o.votes} ballots.${marked ? ' Your mark.' : ''}`
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
                      <View style={p.fillTrack}>
                        <LinearGradient
                          colors={BRASS} locations={BRASS_STOPS}
                          start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                          style={[p.fillBar, { width: `${pct[i]}%` }]}
                        />
                      </View>
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
            ? `${total} BALLOTS CAST`
            : 'MARK YOUR BALLOT'}
      </Text>

      {closed && <View style={{ alignItems: 'center', marginTop: 8 }}><Byline author={author} /></View>}

      <PaperActions
        certifyCount={certifyCount} commentCount={commentCount}
        certified={certified} saved={saved}
      />
    </View>
  );
});
