/**
 * useSecondKey — where the Tribunal's door stands for this session, and the two acts
 * that open it: registering a key, and giving its code (src/utils/secondKey.ts says why).
 *
 * Read from supabase-js each time the door is drawn, never from the query cache kept
 * on the phone: the door must answer for the session as it is now. A read that failed
 * is said as a failure (`failed`), never taken for "no key registered".
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/src/lib/supabase';
import { captureAuthRefusal } from '@/src/lib/sentry';
import { doorOf, type Door, type Factor } from '@/src/utils/secondKey';

export type KeyState = { kind: 'checking' } | { kind: 'failed' } | ({ kind: 'door' } & Door);

/** A key just registered: what the authenticator is given, until its first code confirms it. */
export interface NewKey { factorId: string; uri: string; secret: string }

/** Why a code was not taken: not the key's, or the house never checked it. */
export type CodeRefusal = 'wrong' | 'unchecked';

/** The house's name in the member's authenticator, beside the account. */
export const ISSUER = 'The ReelHouse Society';

async function readDoor(): Promise<KeyState> {
  // Asked inside the promise, so a client that throws is a failed read like one that answers an error.
  const [level, factors] = await Promise.resolve()
    .then(() => Promise.all([supabase.auth.mfa.getAuthenticatorAssuranceLevel(), supabase.auth.mfa.listFactors()]))
    .catch(() => [null, null] as const);
  if (!level || !factors || level.error || factors.error) return { kind: 'failed' };
  return { kind: 'door', ...doorOf(level.data.currentLevel, factors.data.all as Factor[]) };
}

export function useSecondKey(userId: string | undefined) {
  const [state, setState] = useState<KeyState>({ kind: 'checking' });
  const alive = useRef(true);
  useEffect(() => () => { alive.current = false; }, []);

  // Another member's session starts at checking as it renders: the last one's door is not theirs.
  const [readFor, setReadFor] = useState(userId);
  if (readFor !== userId) {
    setReadFor(userId);
    setState({ kind: 'checking' });
  }

  useEffect(() => {
    let cancelled = false;
    void readDoor().then((read) => { if (!cancelled) setState(read); });
    return () => { cancelled = true; };
  }, [userId]);

  const check = useCallback(async () => {
    setState({ kind: 'checking' });
    const read = await readDoor();
    if (alive.current) setState(read);
  }, []);

  /** Registers a new key, first removing any never confirmed; null when the house refused or was away. */
  const enrol = useCallback(async (stale: readonly string[]): Promise<NewKey | null> => {
    try {
      for (const factorId of stale) {
        const { error } = await supabase.auth.mfa.unenroll({ factorId });
        if (error) return null;
      }
      const { data, error } = await supabase.auth.mfa.enroll({ factorType: 'totp', issuer: ISSUER, friendlyName: 'Tribunal key' });
      if (error || !data) return null;
      return { factorId: data.id, uri: data.totp.uri, secret: data.totp.secret };
    } catch {
      return null;
    }
  }, []);

  /** Gives a code for a key; on success the session holds the second key and the door is read again. */
  const give = useCallback(async (factorId: string, code: string): Promise<CodeRefusal | null> => {
    try {
      const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId, code });
      if (error) {
        if (error.code === 'mfa_verification_failed') captureAuthRefusal('code');
        return error.code === 'mfa_verification_failed' ? 'wrong' : 'unchecked';
      }
    } catch {
      return 'unchecked';
    }
    if (alive.current) await check();
    return null;
  }, [check]);

  return { state, check, enrol, give };
}
