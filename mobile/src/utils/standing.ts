/**
 * standing — whether the house has silenced or suspended this member, and
 * the one place that knows it.
 * ─────────────────────────────────────────────────────────────────────────────
 * A silenced or suspended member may read, and may not write: the database
 * refuses their writes at fifteen tables (enforce_not_restricted), in a
 * sentence written for them —
 *
 *     Your account has been silenced by The Society.
 *     Your account is suspended until 04 Oct 2026 18:00 UTC.
 *
 * — and the app said none of it. Each write failed into its own copy ("could
 * not save", "try again"), which no retry could ever answer, and the app read
 * a ban but never a suspension. Now the member's standing is read with their
 * profile, said once by the StandingNotice for as long as it lasts, and read
 * again the moment the server refuses a write for it (a suspension that began
 * while the app was open).
 */
import { supabase } from '@/src/lib/supabase';
import { onRefusal } from '@/src/lib/refusalEvents';
import { useAuthStore } from '@/src/stores/auth';
import { logger } from '@/src/utils/logger';

export type Standing = { kind: 'silenced' } | { kind: 'suspended'; until: string } | null;

/** The member's standing now: silenced outranks a suspension, and a suspension past its end is over. */
export function standingOf(
  user: { is_banned?: boolean | null; suspended_until?: string | null } | null | undefined,
  now = Date.now(),
): Standing {
  if (!user) return null;
  if (user.is_banned === true) return { kind: 'silenced' };
  const until = user.suspended_until ? Date.parse(user.suspended_until) : NaN;
  if (Number.isFinite(until) && until > now) return { kind: 'suspended', until: user.suspended_until as string };
  return null;
}

/** The sentences enforce_not_restricted raises (SQLSTATE 42501). */
const REFUSALS = [
  /^Your account has been silenced by The Society\.$/,
  /^Your account is suspended until .+\.$/,
];

/** Is this the server refusing a write for the member's standing? */
export function isStandingRefusal(message: unknown): boolean {
  return typeof message === 'string' && REFUSALS.some((r) => r.test(message.trim()));
}

let reading: Promise<void> | null = null;

/** Read the member's standing again, from the server, into the profile the app holds. One at a time. */
export function refreshStanding(): Promise<void> {
  if (reading) return reading;
  reading = (async () => {
    const id = useAuthStore.getState().user?.id;
    if (!id) return;
    const { data, error } = await supabase
      .from('profiles').select('is_banned, suspended_until').eq('id', id).single();
    if (error || !data) {
      logger.warn('[standing] could not read the member\'s standing', error?.message);
      return;
    }
    const current = useAuthStore.getState().user;
    if (!current || current.id !== id) return;
    useAuthStore.setState({ user: { ...current, is_banned: data.is_banned, suspended_until: data.suspended_until } });
  })().finally(() => { reading = null; });
  return reading;
}

// Every refusal the server sends passes here; one for standing reads it again.
onRefusal((message) => {
  if (isStandingRefusal(message)) void refreshStanding();
});
