/**
 * useDoor — what a member still has to do before the house takes their filing.
 *
 * ── THE RULE WAS REAL AND INVISIBLE ─────────────────────────────────────────
 * `posts_door` is a RESTRICTIVE INSERT policy on dispatch_posts, and it has
 * always been enforced: two days a member, five distinct films logged. Nothing
 * in the app referenced it. So a new member opened the writing room, chose a
 * form, wrote, pressed FILE, and got `Transmission failed` — no reason, no
 * number, no way to find out. The most likely next thing they did was try
 * again.
 *
 * ── IT ASKS THE SERVER RATHER THAN COUNTING ─────────────────────────────────
 * The gate counts DISTINCT film_id, which PostgREST cannot express, and the
 * profile's `total_logs` is a different number — five logs of one film is one
 * film. Counting on the device would need every log row and would still be a
 * second opinion about a rule the database already holds. `dispatch_door()`
 * returns the two numbers AND calls `may_file()` for the verdict, so the screen
 * and the policy cannot drift apart.
 *
 * ── AND THAT FUNCTION ALREADY EXISTED ───────────────────────────────────────
 * A migration was written to create it before anybody looked. `dispatch_door()`
 * has been live on this database — and in the repo's own schema dump, forty
 * lines from the top — the whole time, returning exactly these five columns and
 * called by nothing. The search that missed it looked for `may_file` and
 * `posts_door` and never for a door FUNCTION.
 *
 * The duplicate migration was deleted rather than shipped. A second function
 * doing the first one's job is two things to keep in step, and one more thing
 * for somebody to run by hand.
 *
 * ── AND IT FAILS OPEN ───────────────────────────────────────────────────────
 * If the call fails — no signal, or a build running ahead of the migration —
 * `open` is TRUE and the member is let through to the desks. The server is the
 * gate; this is only the explanation. Failing closed would lock members out of
 * their own app because a read timed out, which is a far worse error than
 * letting somebody reach a refusal the server was always going to give.
 */
import { useEffect, useState } from 'react';

import { supabase } from '@/src/lib/supabase';
import { useAuthStore } from '@/src/stores/auth';
import { logger } from '@/src/utils/logger';

export interface Door {
  /** True when the member may file — or when we could not find out. */
  open: boolean;
  /** True while the answer is still coming. Nothing should be drawn on it. */
  loading: boolean;
  /** Null until the house has answered; the door draws no bars without them. */
  films: number | null;
  filmsNeeded: number;
  days: number | null;
  daysNeeded: number;
}

/** The house's numbers, repeated here only as a fallback for the LABELS. */
const FILMS_NEEDED = 5;
const DAYS_NEEDED = 2;

type DoorRead = Omit<Door, 'loading'>;

/** No answer: the door stands open and draws no bars. */
const UNANSWERED: DoorRead = { open: true, films: null, filmsNeeded: FILMS_NEEDED, days: null, daysNeeded: DAYS_NEEDED };

async function readDoor(): Promise<DoorRead> {
  try {
    const { data, error } = await supabase.rpc('dispatch_door');
    if (error) { logger.warn(`[door] ${error.message}`); return UNANSWERED; }
    const row = (data as { films: number; films_needed: number; days: number; days_needed: number; may_file: boolean }[] | null)?.[0];
    if (!row) return UNANSWERED;
    /**
     * Capped at what is needed, HERE rather than in the function.
     *
     * A member who has logged twelve films and is waiting on the second day
     * should read `5 OF 5`: the bar is met and the bar is what the line is
     * about. `12 OF 5` reads as an error. The cap is the display's business,
     * and doing it here leaves the server function saying the true count for
     * anything else that ever reads it.
     */
    const need = row.films_needed ?? FILMS_NEEDED;
    return {
      open: !!row.may_file,
      films: Math.min(row.films ?? 0, need),
      // The NEEDED numbers come from the server too, so raising the bar one day
      // does not leave the app printing the old one under a new rule.
      filmsNeeded: need,
      days: row.days ?? 0,
      daysNeeded: row.days_needed ?? DAYS_NEEDED,
    };
  } catch (e) {
    logger.warn(`[door] ${String(e)}`);
    return UNANSWERED;
  }
}

export function useDoor(): Door {
  const userId = useAuthStore((s) => s.user?.id);
  // Held with the member it was read for: another member's door is not this one's,
  // and until theirs comes it is still being asked.
  const [answer, setAnswer] = useState<{ for: string; read: DoorRead } | null>(null);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    void readDoor().then((read) => { if (!cancelled) setAnswer({ for: userId, read }); });
    return () => { cancelled = true; };
  }, [userId]);

  const read = answer && answer.for === userId ? answer.read : null;
  return { ...(read ?? UNANSWERED), loading: !!userId && !read };
}
