import { supabase } from '@/src/lib/supabase';
import { z } from 'zod';
import { logger } from '@/src/utils/logger';
import { sanitizeInput } from '@/src/utils/sanitizeInput';
import { atTheHousesPace } from '@/src/utils/housePace';
import { captureError } from '@/src/lib/sentry';
import { useAuthStore } from '@/src/stores/auth';

const CommentPayloadSchema = z.object({
  /** Made on the phone, as a log critique's is, so the queue replays the same row. */
  id: z.string().uuid(),
  list_id: z.string().uuid(),
  user_id: z.string().uuid(),
  content: z.string().min(1),
});

// ── Zod schemas for read-path boundary validation ──────────────────

const StackDetailSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string().nullable().optional(),
  user_id: z.string(),
  is_private: z.boolean().nullable().optional(),
  is_ranked: z.boolean().nullable().optional(),
  created_at: z.string(),
  updated_at: z.string().nullable().optional(),
  profiles: z.union([
    z.object({ username: z.string() }),
    z.array(z.object({ username: z.string() })),
  ]).nullable().optional(),
});

const StackItemSchema = z.object({
  film_id: z.number(),
  film_title: z.string().nullable().optional(),
  poster_path: z.string().nullable().optional(),
});

const StackCommentRowSchema = z.object({
  id: z.string(),
  list_id: z.string(),
  user_id: z.string(),
  content: z.string(),
  created_at: z.string(),
  profiles: z.union([
    z.object({ username: z.string(), avatar_url: z.string().nullable().optional() }),
    z.array(z.object({ username: z.string(), avatar_url: z.string().nullable().optional() })),
  ]),
});

/**
 * Films loaded for a stack detail screen.
 *
 * The fetch was unbounded. Generous on purpose — the largest stack in existence
 * is 96 — and the TRUE size travels separately as filmCount, so the number on
 * screen stays right even if a stack ever passes this.
 */
/** A stack's films per read: the first page with the stack, the rest as its page is scrolled (P4.9). */
export const STACK_ITEMS_LIMIT = 500;

/** How many of a stack's films its first read holds the order of. */
export const HELD_FILMS = 1000;

/** A film of a stack as its page draws it. */
export type StackFilm = { id: number; title: string; poster_path: string | null };

/**
 * Where a stack's films continue past the pages read. A film moved while the member reads (its rank
 * changed) moves every row after it, so no count of rows holds: the first read holds the order of the
 * first HELD_FILMS films, and the next pages walk it, each read by id; past it, by the stack's order
 * (rank_position, created_at, film_id) strictly after the last film read, as it was read, and a film
 * read there again (moved since) is dropped as already shown.
 */
export type StackPlace = {
  held: number[];
  past: { rank: number | null; at: string; film: number } | null;
};

type FilmKeys = { film_id: number; rank_position: number | null; created_at: string };
const filmKeysOf = (row: unknown): FilmKeys | null => {
  const r = row as Partial<FilmKeys> | null;
  return r && typeof r.film_id === 'number' && typeof r.created_at === 'string'
    ? { film_id: r.film_id, rank_position: typeof r.rank_position === 'number' ? r.rank_position : null, created_at: r.created_at }
    : null;
};
/** The order held from the rows of a first read: the ids past those drawn, and where it ends. */
function placeOf(rows: unknown[], drawn: number): StackPlace {
  const keys = rows.map(filmKeysOf).filter((k): k is FilmKeys => k !== null);
  const last = keys[keys.length - 1];
  return {
    held: keys.slice(drawn).map((k) => k.film_id),
    past: rows.length === HELD_FILMS && last ? { rank: last.rank_position, at: last.created_at, film: last.film_id } : null,
  };
}
const filmsOf = (rows: unknown[]): StackFilm[] => rows.flatMap((item) => {
  const parsed = StackItemSchema.safeParse(item);
  return parsed.success
    ? [{ id: parsed.data.film_id, title: parsed.data.film_title || 'Unknown', poster_path: parsed.data.poster_path || null }]
    : [];
});

/** Critiques per page of a stack's sheet, and per ask for earlier ones. */
export const STACK_COMMENT_PAGE = 50;

export const StackService = {
  /**
   * The stack's next films, in the order its page draws them (rank, then when added, then the film):
   * the films past the first page, so a stack of any size is drawn whole. `place` is where the last
   * page left off (null: the order is read now); `shown` the films already drawn, never drawn twice.
   * A failed read is thrown, never answered as a stack that ends here.
   */
  async getStackItemsPage(stackId: string, place: StackPlace | null, shown: ReadonlySet<number>): Promise<{ films: StackFilm[]; place: StackPlace; more: boolean }> {
    const rowsOf = async (q: PromiseLike<{ data: unknown[] | null; error: unknown }>): Promise<unknown[]> => {
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    };
    const films = () => supabase.from('list_items').select('film_id, film_title, poster_path, rank_position, created_at').eq('list_id', stackId);
    let at = place;
    if (!at) {
      // The order, read now: the films of the stack's first HELD_FILMS, by its index (list_items_in_order).
      const order = await rowsOf(supabase.from('list_items').select('film_id, rank_position, created_at').eq('list_id', stackId)
        .order('rank_position', { ascending: true }).order('created_at', { ascending: true }).order('film_id', { ascending: true })
        .limit(HELD_FILMS));
      at = placeOf(order, 0);
    }
    const left = at.held.filter((id) => !shown.has(id));
    if (left.length > 0) {
      // The next of the order held, read by id, laid in that order.
      const chunk = left.slice(0, STACK_ITEMS_LIMIT);
      const slot = new Map(chunk.map((id, i) => [id, i]));
      const rows = (await rowsOf(films().in('film_id', chunk)))
        .sort((a, b) => (slot.get(filmKeysOf(a)?.film_id ?? -1) ?? 0) - (slot.get(filmKeysOf(b)?.film_id ?? -1) ?? 0));
      const held = left.slice(chunk.length);
      return { films: filmsOf(rows), place: { ...at, held }, more: held.length > 0 || at.past !== null };
    }
    const past = at.past;
    if (!past) return { films: [], place: at, more: false };
    // Past the order held, each a range of the stack's index (list_id, rank_position, created_at,
    // film_id): the films of the last one's rank after it, those of every later rank, and those with
    // none (last, as the order has them), side by side.
    const sameRank = past.rank === null ? films().is('rank_position', null) : films().eq('rank_position', past.rank);
    // A bound the index reads as a range, and the exact cursor within the films of that one moment:
    // every value from a server row, so none carries filter syntax.
    const reads = [rowsOf(sameRank.gte('created_at', past.at)
      .or(`created_at.gt.${past.at},and(created_at.eq.${past.at},film_id.gt.${past.film})`)
      .order('created_at', { ascending: true }).order('film_id', { ascending: true }).limit(STACK_ITEMS_LIMIT))];
    if (past.rank !== null) {
      reads.push(rowsOf(films().gt('rank_position', past.rank).order('rank_position', { ascending: true })
        .order('created_at', { ascending: true }).order('film_id', { ascending: true }).limit(STACK_ITEMS_LIMIT)));
      reads.push(rowsOf(films().is('rank_position', null)
        .order('created_at', { ascending: true }).order('film_id', { ascending: true }).limit(STACK_ITEMS_LIMIT)));
    }
    const read = (await Promise.all(reads)).flat().slice(0, STACK_ITEMS_LIMIT);
    const last = filmKeysOf(read[read.length - 1]);
    const full = read.length === STACK_ITEMS_LIMIT;
    return {
      films: filmsOf(read.filter((r) => !shown.has(filmKeysOf(r)?.film_id ?? -1))),
      place: { ...at, past: full && last ? { rank: last.rank_position, at: last.created_at, film: last.film_id } : null },
      more: full,
    };
  },

  async getStackFullPayload(stackId: string) {
    const viewer = useAuthStore.getState().user?.id ?? null;
    const [listRes, itemsRes, filmCountRes, endorseRes, critiqueCountRes, mineRes] = await Promise.all([
      supabase.from('lists')
        .select('id, title, description, user_id, is_private, is_ranked, created_at, updated_at, withheld_at, profiles(username)')
        .eq('id', stackId)
        .maybeSingle(),
      // Bounded. This was unbounded — a stack of any size loaded in full, and the
      // screen's "N REELS" counts what it receives. The cap is generous (the
      // largest stack in existence is 96) and the count below is asked of the
      // server, so the number stays true even if a stack ever exceeds it.
      // The first HELD_FILMS in order: the first page drawn, and the order the rest is read in.
      supabase.from('list_items')
        .select('film_id, film_title, poster_path, rank_position, created_at')
        .eq('list_id', stackId)
        .order('rank_position', { ascending: true })
        .order('created_at', { ascending: true })
        .order('film_id', { ascending: true })
        .limit(HELD_FILMS),
      supabase.from('list_items')
        .select('film_id', { count: 'exact', head: true })
        .eq('list_id', stackId),
      // Server-authoritative. Counting `interactions` from here runs under the
      // viewer's RLS, and a stack endorsement carries no target_user_id — so
      // visibility rested entirely on the ENDORSER's privacy and two members saw
      // different totals for the same stack. The function returns an aggregate
      // and nothing else.
      supabase.rpc('list_certify_count', { p_list_id: stackId }),
      // The critiques are fetched only when their surface opens, so the action
      // that leads there had no number to show — it said CRITIQUES whether
      // there were none or forty. A head-only count rides along with the four
      // requests already in flight, so the button can say what it holds before
      // anyone commits to opening it. No extra round trip.
      supabase.from('list_comments')
        .select('id', { count: 'exact', head: true })
        .eq('list_id', stackId),
      // Whether THIS member certified it — the heart. It came from the index
      // filled at sign-in with the member's newest 500 certifications, so an
      // older one drew an empty heart. Head-only, beside the others: no extra
      // round trip. A member always sees their own interactions under RLS.
      viewer
        ? supabase.from('interactions')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', viewer)
          .eq('target_list_id', stackId)
          .eq('type', 'endorse_list')
        : Promise.resolve(null),
    ]);

    if (listRes.error) throw listRes.error;
    if (itemsRes.error) throw itemsRes.error;
    // These two were unchecked. The register noted one; the film-count check was
    // added in batch 20, after it was written, so there were two. A failed count
    // fell through to `?? 0` and `?? validFilms.length` — the latter silently
    // reporting the CAPPED fetch length, which is exactly the dishonest count
    // batch 20 set out to eliminate. Reported, not thrown: the stack itself
    // loaded fine and a wrong number is not worth blanking the screen over.
    if (filmCountRes.error) {
      captureError(filmCountRes.error, { scope: 'StackService.getStackFullPayload.filmCount', stackId });
    }
    if (endorseRes.error) {
      captureError(endorseRes.error, { scope: 'StackService.getStackFullPayload.certifyCount', stackId });
    }
    // No row is an ANSWER: the stack is not there, or is sealed from this viewer
    // (row security returns nothing). Thrown, it was indistinguishable from a
    // stack that could not be reached, and the page said one for the other.
    if (!listRes.data) return null;

    // Activate Schema Validation Boundaries
    if (!StackDetailSchema.safeParse(listRes.data).success) {
      logger.warn(`[StackService.getStackFullPayload] list payload failed schema validation`);
    }
    const profile = Array.isArray(listRes.data.profiles) ? listRes.data.profiles[0] : listRes.data.profiles;

    // O(N) Array Reduce: Validates, drops corrupted rows, and maps UI shape in one pass.
    const firstPage = (itemsRes.data || []).slice(0, STACK_ITEMS_LIMIT);
    const validFilms = firstPage.reduce((acc, item) => {
      const parsed = StackItemSchema.safeParse(item);
      if (parsed.success) {
        acc.push({
          id: parsed.data.film_id,
          title: parsed.data.film_title || 'Unknown',
          poster_path: parsed.data.poster_path || null,
        });
      } else {
        logger.warn('[StackService.getStackFullPayload] list_item failed schema validation', parsed.error);
      }
      return acc;
    }, [] as { id: number; title: string; poster_path: string | null }[]);

    return {
      id: listRes.data.id,
      title: listRes.data.title,
      description: listRes.data.description ?? '',
      userId: listRes.data.user_id,
      user: profile?.username || 'anonymous',
      createdAt: listRes.data.created_at,
      // When the house last changed it (its films among it): an edit carries it, and is refused
      // if the stack has changed since (save_stack's p_read_at).
      updatedAt: listRes.data.updated_at ?? null,
      films: validFilms,
      // Where the films past the first page continue: the order held as this page was read.
      filmsNext: placeOf(itemsRes.data || [], firstPage.length),
      // The stack's TRUE size, from the server. The screen prints "N REELS" and
      // used to count the array it received — correct only while the fetch was
      // unbounded. Now that it is capped, this is the number that must be shown.
      filmCount: filmCountRes.count ?? validFilms.length,
      critiqueCount: critiqueCountRes.error ? null : (critiqueCountRes.count ?? 0),
      isPrivate: listRes.data.is_private ?? false,
      isRanked: listRes.data.is_ranked ?? false,
      // Withheld by the house (round 14): its curator alone reads it, marked so on its page.
      withheldAt: (listRes.data as { withheld_at?: string | null }).withheld_at ?? null,
      // The RPC returns the count as `data`, not as PostgREST's `count` header.
      endorseCount: Number(endorseRes.data ?? 0) || 0,
      // null when signed out or the question failed: the heart is left as it was.
      certified: mineRes && !mineRes.error ? (mineRes.count ?? 0) > 0 : null,
    };
  },

  /**
   * Single joined query replaces N+1 pattern.
   * Previously: 2 queries (comments → profile IDs → profiles).
   * Now: 1 query with Supabase foreign key join.
   */
  /**
   * The newest `limit` critiques, oldest first for display. The sheet asks for
   * a larger `limit` (STACK_COMMENT_PAGE more) when the member asks for earlier
   * ones, so a thread past one page can be read to its first.
   */
  async getStackComments(stackId: string, limit: number = STACK_COMMENT_PAGE) {
    const { data, error } = await supabase
      .from('list_comments')
      .select('id, list_id, user_id, content, created_at, profiles!inner(username, avatar_url)')
      .eq('list_id', stackId)
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .limit(limit);

    if (error) throw error;
    if (!data || data.length === 0) return [];

    // O(N) Array Reduce: Validates, drops corrupted rows, and maps UI shape in one pass.
    const formatted = data.reduce((acc, row) => {
      const parsed = StackCommentRowSchema.safeParse(row);
      if (parsed.success) {
        const c = parsed.data;
        const profile = Array.isArray(c.profiles) ? c.profiles[0] : c.profiles;
        acc.push({
          id: c.id,
          list_id: c.list_id,
          user_id: c.user_id,
          content: c.content,
          created_at: c.created_at,
          username: profile?.username || 'unknown',
          avatar_url: profile?.avatar_url ?? null,
        });
      } else {
        logger.warn('[StackService.getStackComments] row failed schema validation', parsed.error);
      }
      return acc;
    }, [] as { id: string; list_id: string; user_id: string; content: string; created_at: string; username: string; avatar_url: string | null }[]);

    return formatted.reverse();
  },

  /**
   * Take back one's own critique on a stack, as LogService takes back one on a
   * log. The request names its writer, so it can only ever reach the member's
   * own; the house's rules let a member delete their own. A delete that finds
   * no row found it already gone (removed from another device), which is what
   * was asked for, so only a failure to reach the house is thrown.
   */
  async deleteStackComment(commentId: string, userId: string) {
    const { error } = await supabase
      .from('list_comments')
      .delete()
      .eq('id', commentId)
      .eq('user_id', userId);
    if (error) throw error;
  },

  async addStackComment(payload: unknown) {
    const safePayload = CommentPayloadSchema.parse(payload);
    
    // list_comments' text column is 'content' (verified against the live schema),
    // matching the UI/API shape — no remap needed, just sanitize.
    // COMP-1: sanitize at the service boundary so the ONLINE path matches the
    // offline mutationExecutor (`sanitizeInput(content, 'listComment')`).
    const { content, ...rest } = safePayload;
    const dbPayload = { ...rest, content: sanitizeInput(content, 'listComment') };
    
    // Add the comment and fetch joined profile in a single query, at the house's pace
    // (check_critique_pace, round 14): a moment's wait is waited and the critique filed; a longer
    // one is thrown, for the page to say how long (housePace.critiquePaceSaid).
    const { data } = await atTheHousesPace(async () => {
      const sent = await supabase
        .from('list_comments')
        .insert([dbPayload])
        .select('id, list_id, user_id, content, created_at, profiles(username, avatar_url)')
        .maybeSingle();
      if (sent.error) throw sent.error;
      return sent;
    });

    if (!data) throw new Error('Failed to add stack comment');

    // SVC-1: the DB trigger tr_notify_list_comment already emits the correct
    // notification on the list_comments INSERT above. The prior manual insert here
    // targeted a non-existent `metadata` column (and duplicated the trigger), so it
    // always failed silently — removed to match the offline mutationExecutor path.

    // Remap db shape back to UI shape for perfect optimistic updates
    const profile = Array.isArray(data.profiles) ? data.profiles[0] : data.profiles;
    return {
      id: data.id,
      list_id: data.list_id,
      user_id: data.user_id,
      content: data.content,
      created_at: data.created_at,
      username: profile?.username || 'unknown',
      avatar_url: (profile as { avatar_url?: string | null } | undefined)?.avatar_url ?? null,
    };
  }
};
