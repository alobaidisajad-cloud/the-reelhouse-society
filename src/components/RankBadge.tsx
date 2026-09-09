/**
 * RankBadge — the house's rank, drawn once, on this client too.
 *
 * ── WHAT IT REPLACES ────────────────────────────────────────────────────────
 * Four call sites rendering two CSS classes by hand, two of them overriding the
 * size inline:
 *
 *   FeedView       <span className="reel-auteur-badge">★ AUTEUR</span>
 *   FocusView      …with style={{ fontSize: '0.4rem', padding: '0.1rem 0.5rem' }}
 *   SocialPulse    …
 *   FeaturedReview …with style={{ fontSize: '0.38rem' }}
 *
 * — and `.reel-auteur-badge` was declared TWICE in `reel.css`, once crimson and
 * once gold, the later silently winning. One badge, two definitions, four
 * sizes. This component takes no size prop, so the call sites cannot do that
 * again.
 *
 * ── AND IT DECIDES THE RANK PROPERLY ────────────────────────────────────────
 * Every one of those sites tested `role === 'auteur'`. `rankOf` applies the
 * Highest Watermark Rule across tier, role and the founding flag — so a
 * founding member, an admin who pays, and anyone whose entitlement rides the
 * `tier` column are marked here exactly as they are on mobile. See `utils/tier`
 * for what that was costing.
 *
 * The mark itself is mobile's: a letterpress stamp, struck at a hand's angle,
 * washed in the rank's own pigment — crimson at full pressure for an Auteur,
 * brass as a lighter impression for an Archivist.
 */
import { memo } from 'react';
import { rankOf, rankWord, type Rank, type TierInput } from '../utils/tier';

interface Props {
  /** Anything that describes the member: a row, a role string, a profile. */
  who?: TierInput;
  /** Or the rank directly, where a caller has already resolved it. */
  rank?: Rank;
}

/**
 * No `size`, no `variant`, no `className`. A per-call knob is the mechanism
 * that produced four sizes of one badge, so the component does not offer one.
 */
export const RankBadge = memo(function RankBadge({ who, rank }: Props) {
  const resolved: Rank = rank !== undefined ? rank : rankOf(who);
  if (!resolved) return null;

  const auteur = resolved === 'auteur';
  return (
    <span
      className={auteur ? 'reel-rank reel-rank--auteur' : 'reel-rank reel-rank--archivist'}
      // "Auteur", not "black star AUTEUR". The glyph is an ornament, and a
      // reader that announces it is reading punctuation out of a badge.
      aria-label={rankWord(resolved) as string}
      role="img"
    >
      {auteur ? '★ AUTEUR' : '✦ ARCHIVIST'}
    </span>
  );
});
