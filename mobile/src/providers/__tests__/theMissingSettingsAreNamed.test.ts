/**
 * theMissingSettingsAreNamed.test.ts — a build without its server settings
 * says which, one to a line.
 *
 * The lines were once joined with a backslash and an n written out, so the
 * whole message arrived as one line with "\n" printed through it. The boot
 * check stands down under jest, so the words are tested here.
 */
import { describeMissingEnv } from '../AppBootstrapper';

it('names each missing setting on a line of its own, twice: what is missing, and what to write', () => {
  const said = describeMissingEnv(['EXPO_PUBLIC_SUPABASE_URL', 'EXPO_PUBLIC_SUPABASE_ANON_KEY']);
  const lines = said.split('\n');
  expect(said).not.toContain(String.fromCharCode(92) + 'n');
  expect(lines).toContain('    ✗ EXPO_PUBLIC_SUPABASE_URL');
  expect(lines).toContain('    ✗ EXPO_PUBLIC_SUPABASE_ANON_KEY');
  expect(lines).toContain('    EXPO_PUBLIC_SUPABASE_URL=<your-value>');
  expect(lines).toContain('    EXPO_PUBLIC_SUPABASE_ANON_KEY=<your-value>');
});
