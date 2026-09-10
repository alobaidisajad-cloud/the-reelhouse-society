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
import { useCallback, useEffect, useRef, useState } from 'react';

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
  refresh: () => void;
}

/** The house's numbers, repeated here only as a fallback for the LABELS. */
const FILMS_NEEDED = 5;
const DAYS_NEEDED = 2;

export function useDoor(): Door {
  const user = useAuthStore((s) => s.user);
  const [open, setOpen] = useState(true);
  const [loading, setLoading] = useState(true);
  const [films, setFilms] = useState<number | null>(null);
  const [days, setDays] = useState<number | null>(null);
  const [filmsNeeded, setFilmsNeeded] = useState(FILMS_NEEDED);
  const [daysNeeded, setDaysNeeded] = useState(DAYS_NEEDED);
  const gen = useRef(0);

  const ask = useCallback(async () => {
    if (!user?.id) { setLoading(false); return; }
    const mine = ++gen.current;
    setLoading(true);
    try {
      const { data, error } = await supabase.rpc('dispatch_door');
      if (mine !== gen.current) return;
      if (error) { logger.warn(`[door] ${error.message}`); setOpen(true); return; }
      const row = (data as { films: number; films_needed: number; days: number; days_needed: number; may_file: boolean }[] | null)?.[0];
      if (!row) { setOpen(true); return; }
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
      setFilms(Math.min(row.films ?? 0, need));
      setDays(row.days ?? 0);
      // The NEEDED numbers come from the server too, so raising the bar one day
      // does not leave the app printing the old one under a new rule.
      setFilmsNeeded(row.films_needed ?? FILMS_NEEDED);
      setDaysNeeded(row.days_needed ?? DAYS_NEEDED);
      setOpen(!!row.may_file);
    } catch (e) {
      if (mine === gen.current) { logger.warn(`[door] ${String(e)}`); setOpen(true); }
    } finally {
      if (mine === gen.current) setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => { void ask(); }, [ask]);

  return { open, loading, films, filmsNeeded, days, daysNeeded, refresh: ask };
}
