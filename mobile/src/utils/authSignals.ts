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

/** An email's link back into the app, saying which it is, so a failed one offers the right way on. */
export function authLink(type: 'signup' | 'recovery'): string {
  return Linking.createURL('auth-callback', { queryParams: { type } });
}
