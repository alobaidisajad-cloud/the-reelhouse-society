/**
 * useMemberRoom — everything a member has filed to the paper, and the two
 * numbers at the head of it.
 *
 * ── WHY THIS ROOM EXISTS ────────────────────────────────────────────────────
 * Every byline in the Dispatch already says "Open their room." out loud — it is
 * the accessibility label on the control, written when the design was drawn.
 * Tapping it opened the member FILE instead: the profile, which is six rooms
 * about films — the archive, the ledger, the stacks, the vault, the projector,
 * the watchlist. Not one of them is the Dispatch. So the one gesture in the
 * paper that points at a person pointed away from the paper, and the label was
 * a promise the app did not keep.
 *
 * ── WHAT IT READS ───────────────────────────────────────────────────────────
 * The same three gates the feed uses — published, not withheld, not ended — so
 * a room can never show a filing the page itself would not. Ordered newest
 * first over `dispatch_posts_author`, an index that already existed.
 *
 * The totals come from `dispatch_room_totals`, one round trip, because
 * `certified` is a SUM across every filing a member has and summing the page on
 * screen would print a number that shrinks as you scroll. That function is
 * SECURITY INVOKER, so a member who has been blocked gets zero rather than a
 * count of work they cannot see.
 *
 * ── THE HEAD DOES NOT COME OFF THE FIRST FILING ─────────────────────────────
 * It would have been free: every row carries its author. But a member who has
 * filed NOTHING has no first row, and their room would have opened with no
 * name, no face and no rank above the words "nothing filed yet" — the emptiest
 * possible page for the member most likely to be looking at it. The byline is
 * read from `profiles`, once, so the head is the same whether the room holds
 * twenty filings or none.
 *
 * ── AND IT NEVER GUESSES A MEMBER ───────────────────────────────────────────
 * The username resolves to an id first. Filtering on `author_username` would
 * have been one query fewer and wrong: that column is DERIVED, and a member who
 * renames leaves older rows behind under the old handle until the rename
 * trigger catches up. An id is the person.
 *
 * `eq`, not `ilike`. Nothing constrains a handle's characters, so `_` and `%`
 * are legal in one — and in a LIKE pattern they are wildcards. `ilike` on a
 * member called `a_b` matches `aab` too, and `maybeSingle` turns two matches
 * into an error: the room of a member with an underscore in their name would
 * simply have failed to open. `eq` is also the app's own convention everywhere
 * else a handle is resolved, and it is the form the unique index can serve.
 */
import { useCallback, useEffect, useRef, useState } from 'react';

import { supabase } from '@/src/lib/supabase';
import type { PaperAuthor } from '@/src/components/dispatch/paper/PaperPost';
import { useDispatch } from '@/src/stores/dispatch';
import {
  FILING_CARD_COLUMNS, paperTierOf, parseFilingRows, type Filing,
} from '@/src/stores/dispatchTypes';
import { logger } from '@/src/utils/logger';

/** One page. Long enough to fill a screen, short enough to arrive at once. */
export const ROOM_PAGE = 20;

export interface MemberRoom {
  /** The byline at the head. Null until it is known, or if nobody answers. */
  author: PaperAuthor | null;
  filings: Filing[];
  filed: number;
  certified: number;
  /**
   * Whether the two numbers above are the HOUSE'S, or merely the value they
   * were initialised to. Nothing is drawn from them until this is true — see
   * the note where they are set.
   */
  totalsKnown: boolean;
  /**
   * Which of these filings this member had ALREADY certified when the page
   * arrived — so the card can print a count that moves when they act.
   *
   * `certify_count` is a server total, and the store's `certifiedIds` is the
   * live truth about this member's own mark. The card prints
   * `count + (mine now) − (mine then)`, which moves the moment the mark is
   * tapped and moves BACK on its own if the write is refused, because the store
   * rolls `certifiedIds` back. An optimistic ±1 held here would not: it would
   * leave the room one ahead of the house until the next refetch.
   *
   * Snapshotted after the marks have loaded, never before — taken any earlier
   * it would be empty for every row and every already-certified filing would
   * print one too many.
   */
  certifiedAtFetch: Set<string>;
  loading: boolean;
  /** Nothing came back for this handle — no such member, or none readable. */
  missing: boolean;
  more: boolean;
  loadingMore: boolean;
  loadMore: () => void;
}

/** The byline's four facts, and the three columns rank is resolved from. */
const MEMBER_COLUMNS = 'id, username, avatar_url, member_no, tier, role, is_founding';

export function useMemberRoom(username: string | undefined): MemberRoom {
  const [author, setAuthor] = useState<PaperAuthor | null>(null);
  const [filings, setFilings] = useState<Filing[]>([]);
  const [filed, setFiled] = useState(0);
  const [certified, setCertified] = useState(0);
  const [totalsKnown, setTotalsKnown] = useState(false);
  const [certifiedAtFetch, setCertifiedAtFetch] = useState<Set<string>>(() => new Set());
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [missing, setMissing] = useState(false);
  const [more, setMore] = useState(false);

  /**
   * The member this hook resolved, kept out of state so paging can read it
   * without waiting for a render, and so `loadMore` does not change identity
   * every time a page lands.
   */
  const userId = useRef<string | null>(null);

  /**
   * Every reply carries the generation that asked for it. Without this, opening
   * one room and immediately opening another paints the first member's filings
   * under the second member's name if the first reply lands late — the same
   * out-of-order fault the film finder was fixed for.
   */
  const gen = useRef(0);

  const page = useCallback(async (from: number, mine: number) => {
    const id = userId.current;
    if (!id) return;

    const [rows, totals] = await Promise.all([
      supabase
        .from('dispatch_posts')
        .select(FILING_CARD_COLUMNS)
        .eq('user_id', id)
        .eq('is_published', true)
        .is('withheld_at', null)
        .is('ended_at', null)
        .order('created_at', { ascending: false })
        .range(from, from + ROOM_PAGE - 1),
      // Once, at the head. The totals do not change as you scroll, and asking
      // again on every page would be one more round trip per page for an answer
      // already on screen.
      from === 0
        ? supabase.rpc('dispatch_room_totals', { p_user_id: id })
        : Promise.resolve({ data: null, error: null }),
    ]);
    if (mine !== gen.current) return;

    if (rows.error) { logger.warn(`[room] filings: ${rows.error.message}`); return; }

    const { filings: got, dropped } = parseFilingRows(rows.data ?? []);
    // A row the parser refuses is a row the screen cannot draw. Saying so is the
    // difference between finding a schema change and calling the room "short".
    if (dropped > 0) logger.warn(`[room] ${dropped} filing(s) failed to parse`);

    setFilings((prev) => (from === 0 ? got : [...prev, ...got]));
    // Measured on what the SERVER sent, not on what parsed: a full page of rows
    // the parser dropped still means there is another page behind it.
    setMore((rows.data?.length ?? 0) === ROOM_PAGE);

    /**
     * ── NO TOTALS IS NOT ZERO TOTALS ───────────────────────────────────────
     * If the function is unreachable — a network failure, or a build running
     * against a database where the migration has not been applied yet — the
     * head must not print `0 FILED · 0 CERTIFIED` over a member's twelve
     * filings. A missing number is left missing and the line is not drawn.
     *
     * The error is logged rather than swallowed, because a total that quietly
     * stops arriving looks exactly like a member who has stopped writing.
     */
    if (from === 0) {
      const r = totals as { data?: { filed: number; certified: number }[] | null; error?: { message: string } | null };
      if (r.error) logger.warn(`[room] totals: ${r.error.message}`);
      const t = r.data?.[0];
      if (t) { setFiled(t.filed ?? 0); setCertified(Number(t.certified ?? 0)); setTotalsKnown(true); }
    }

    /**
     * The member's own marks for the rows this page brought.
     *
     * The store keeps them for the whole session, merged, so the feed and the
     * reader and this room all read one answer. Without this call a member
     * would open their own room, see none of their certifications, tap one that
     * was already true, and the insert would come back a duplicate — the mark
     * flicking on and then off again.
     */
    await useDispatch.getState().loadMarks(got);
    if (mine !== gen.current) return;
    const live = useDispatch.getState().certifiedIds;
    setCertifiedAtFetch((prev) => {
      const next = from === 0 ? new Set<string>() : new Set(prev);
      for (const f of got) if (live.has(f.id)) next.add(f.id);
      return next;
    });
  }, []);

  useEffect(() => {
    const mine = ++gen.current;
    userId.current = null;
    setAuthor(null); setFilings([]); setFiled(0); setCertified(0); setTotalsKnown(false);
    setCertifiedAtFetch(new Set());
    setMissing(false); setMore(false); setLoading(true);

    if (!username) { setLoading(false); setMissing(true); return; }

    (async () => {
      try {
        const { data: who, error } = await supabase
          .from('profiles')
          .select(MEMBER_COLUMNS)
          .eq('username', username)
          .maybeSingle();
        if (mine !== gen.current) return;
        if (error) { logger.warn(`[room] member: ${error.message}`); setMissing(true); return; }
        if (!who?.id) { setMissing(true); return; }

        userId.current = who.id as string;
        setAuthor({
          // The handle the SERVER holds, not the one in the link. They differ
          // for one screen-width after a rename, and the head should say who
          // this member is now.
          name: (who.username as string) ?? username,
          memberNo: (who.member_no as number) ?? 0,
          tier: paperTierOf(who),
          avatar: (who.avatar_url as string) ?? null,
        });

        await page(0, mine);
      } catch (e) {
        if (mine === gen.current) { logger.warn(`[room] ${String(e)}`); setMissing(true); }
      } finally {
        if (mine === gen.current) setLoading(false);
      }
    })();
    // `page` is stable and `username` is the whole identity of this room.
  }, [username, page]);

  const loadMore = useCallback(() => {
    if (loading || loadingMore || !more || !userId.current) return;
    const mine = gen.current;
    setLoadingMore(true);
    void (async () => {
      try {
        await page(filings.length, mine);
      } finally {
        if (mine === gen.current) setLoadingMore(false);
      }
    })();
  }, [loading, loadingMore, more, filings.length, page]);

  return {
    author, filings, filed, certified, totalsKnown, certifiedAtFetch,
    loading, loadingMore, missing, more, loadMore,
  };
}
