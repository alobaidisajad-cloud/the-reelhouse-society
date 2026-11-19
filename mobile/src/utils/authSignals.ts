/**
 * The words and shapes every door into the house reads alike: the store that
 * signs in, the form that explains a refusal, Settings that re-checks a password.
 */
import * as Linking from 'expo-linking';

/** Supabase's words for refused credentials: both doors throw them, so the lock counts both. */
export const BAD_CREDENTIALS = 'Invalid login credentials';

/** Something before the @ and a dotted domain after it. "@name" and "old@handle" are handles. */
const ADDRESS_SHAPE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/** Whether what was typed into "email or username" is an address. */
export function isAddress(typed: string): boolean {
  return ADDRESS_SHAPE.test(typed.trim());
}

/** An email's link back into the app, naming its kind, so a failed one offers the right way on. */
export function authLink(type: 'signup' | 'recovery'): string {
  return Linking.createURL('auth-callback', { queryParams: { type } });
}


/**
 * The house holding a handle sign-in back (sign-in-with-username's 429 that names the handle): from
 * here, this connection has tried too many wrong passwords and rests (a guesser rests only their own
 * door); from elsewhere, the handle is being tried from many places and is slowed for any phone it
 * has not signed in on before. Carried in these words from the store to the form, which says which,
 * how long, and that the member's email address still signs them in.
 */
export const HANDLE_RESTING = 'Handle resting';

/** Where the attempts the house held this one back for came from. */
export type RestingFrom = 'here' | 'elsewhere';

/** The refusal's words for a handle held `seconds` more (at least one), and from where. */
export function handleResting(seconds: number, from: RestingFrom): string {
  return `${HANDLE_RESTING} ${Math.max(1, Math.ceil(seconds))} ${from}`;
}

/** The seconds and the where a refusal says, or null when it says something else. */
export function handleRestingOf(raw: string): { seconds: number; from: RestingFrom } | null {
  const parts = raw.split(' ');
  if (parts.length !== 4 || `${parts[0]} ${parts[1]}` !== HANDLE_RESTING) return null;
  const [, , seconds, from] = parts;
  if (!seconds || !/^[0-9]+$/.test(seconds) || (from !== 'here' && from !== 'elsewhere')) return null;
  return { seconds: Number(seconds), from };
}

/** The phone's key for a handle (the house hands one after the right password), kept for every handle signed in by. */
const DOORS_KEY = 'handle_doors';
const DOOR_SHAPE = /^[0-9a-f]{32,128}$/;
/** How many handles' keys a phone keeps (the newest). */
const DOORS_KEPT = 5;

/** A handle as the house finds it: no @, its edges' spaces gone, lower case, spaces as underscores. */
function handleKey(handle: string): string {
  return handle.replace(/^@/, '').trim().toLowerCase().replace(/\s+/g, '_');
}

/** What the phone holds: handle to key, newest last. */
function doorsHeld(read: (key: string) => string | undefined): [string, string][] {
  try {
    const held: unknown = JSON.parse(read(DOORS_KEY) ?? '[]');
    return Array.isArray(held)
      ? held.filter((e): e is [string, string] => Array.isArray(e) && typeof e[0] === 'string' && typeof e[1] === 'string' && DOOR_SHAPE.test(e[1]))
      : [];
  } catch {
    return [];
  }
}

/** The key this phone holds for a handle, or null. */
export function doorFor(handle: string, read: (key: string) => string | undefined): string | null {
  const key = handleKey(handle);
  return doorsHeld(read).find(([h]) => h === key)?.[1] ?? null;
}

/** Keeps the key the house handed this phone for a handle (a key not of its shape is never kept). */
export function keepDoor(handle: string, door: unknown, read: (key: string) => string | undefined, write: (key: string, value: string) => void): void {
  if (typeof door !== 'string' || !DOOR_SHAPE.test(door)) return;
  const key = handleKey(handle);
  const held = doorsHeld(read).filter(([h]) => h !== key);
  write(DOORS_KEY, JSON.stringify([...held, [key, door]].slice(-DOORS_KEPT)));
}
