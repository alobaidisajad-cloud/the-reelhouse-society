/**
 * A password tried on a member's behalf by the house's server is counted at the member's own address.
 * ─────────────────────────────────────────────────────────────────────────────
 * Supabase Auth paces password sign-ins, codes, sign-ups and recoveries by the address that asks.
 * Asked from the house's own server, every member shares that server's one address, unless the
 * server sends Auth the member's own (Sb-Forwarded-For) with the project's secret key, which is the
 * only key Auth takes it from. So every server file (the edge functions in both trees, and the
 * website's api/) is read, and each call to one of those Auth doors must be a request that
 * forwards the member's address with the secret key: supabase-js's own sign-in calls cannot, and a
 * request without both is refused. Each rule is shown first to say no on planted text.
 */
import { readFileSync } from 'fs';
import { files, rel } from '@/test-utils/universe';
import { stripComments } from '@/test-utils/readCode';

/** The Auth doors Auth paces by the asking address. */
const DOOR = /\/auth\/v1\/(token|otp|signup|recover|verify|magiclink)\b/;
/** supabase-js's own calls to those doors: they send no address of the member's. */
const LIBRARY_CALL = /\.auth\.(?<call>signInWithPassword|signInWithOtp|signUp|resetPasswordForEmail|verifyOtp|signInWithIdToken)\s*\(/g;

type Finding = { at: string; why: string };

/** Each call to a paced Auth door in one server file's code that is not counted at the member's address. */
export function countedTogether(code: string, at: string): Finding[] {
  const found: Finding[] = [];
  for (const m of code.matchAll(LIBRARY_CALL)) found.push({ at, why: `supabase-js ${m.groups?.call ?? 'sign-in'} sends no member's address` });
  // Each request to a paced door, and its options object, read by its braces.
  const call = /(?<head>\b(fetch|withinLimit|fetchWithinLimit)\(\s*(?<url>`[^`]*`|'[^']*'|"[^"]*")\s*,\s*\{)/g;
  for (const m of code.matchAll(call)) {
    const url = m.groups?.url;
    const head = m.groups?.head;
    if (!url || !head || !DOOR.test(url)) continue;
    const start = (m.index ?? 0) + head.length - 1;
    let depth = 0;
    let end = start;
    for (; end < code.length; end++) {
      if (code[end] === '{') depth++;
      else if (code[end] === '}' && --depth === 0) break;
    }
    const options = code.slice(start, end + 1);
    if (!/['"]Sb-Forwarded-For['"]\s*:/.test(options)) found.push({ at, why: `a request to ${url} forwards no member's address` });
    const key = options.match(/\bapikey:\s*(?<name>[A-Za-z_$][\w$]*)/);
    const name = key?.groups?.name;
    const declared = name ? code.match(new RegExp(`\\bconst\\s+${name}\\s*=\\s*(?<init>[^\\n;]+)`)) : null;
    const secret = (text: string | undefined) => !!text && (/SUPABASE_SECRET_KEYS/.test(text) || /\bSECRET_KEY\b/.test(text));
    if (!name || !(secret(name) || secret(declared?.groups?.init))) found.push({ at, why: `a request to ${url} is not made with the secret key` });
  }
  return found;
}

describe('can say NO: each shape is found on planted text, and the forwarded one is not', () => {
  const find = (src: string) => countedTogether(src, 'planted.ts').map((f) => f.why);

  it('supabase-js signing a member in from the server is found', () => {
    expect(find('const { data } = await admin.auth.signInWithPassword({ email, password })')).toHaveLength(1);
    expect(find('await client.auth.signInWithOtp({ email })')).toHaveLength(1);
  });

  it('a request to a paced door with no member\'s address, or with the public key, is found; forwarded with the secret key, it is not', () => {
    expect(find('const res = await fetch(`${URL}/auth/v1/token?grant_type=password`, { method: \'POST\', headers: { apikey: ANON_KEY } })'))
      .toEqual(['a request to `${URL}/auth/v1/token?grant_type=password` forwards no member\'s address',
        'a request to `${URL}/auth/v1/token?grant_type=password` is not made with the secret key']);
    expect(find(`const key = ANON_KEY
      const res = await withinLimit(\`\${URL}/auth/v1/otp\`, { headers: { apikey: key, 'Sb-Forwarded-For': forAuth } })`))
      .toEqual(['a request to `${URL}/auth/v1/otp` is not made with the secret key']);
    expect(find(`const SECRET_KEY = secretKey()
      const key = SECRET_KEY || ANON_KEY
      const res = await withinLimit(\`\${URL}/auth/v1/token?grant_type=password\`, { headers: { apikey: key, ...(SECRET_KEY ? { 'Sb-Forwarded-For': forAuth } : {}) } })`))
      .toEqual([]);
    // A door Auth does not pace by address (the member's own record) is no finding.
    expect(find('const res = await fetch(`${URL}/auth/v1/user`, { headers: { apikey: ANON_KEY } })')).toEqual([]);
  });
});

describe('every server file: the edge functions in both trees, and the website\'s api/', () => {
  const server = [...files('functions'), ...files('website').filter((p) => rel(p).startsWith('../api/'))];

  it('reads the handle sign-in and the website\'s server files', () => {
    const ats = server.map((p) => rel(p));
    expect(ats.some((a) => a.endsWith('sign-in-with-username/index.ts'))).toBe(true);
    expect(ats.some((a) => a.startsWith('../api/'))).toBe(true);
  });

  it('counts every password the house tries at the member\'s own address', () => {
    const code = server.map((p) => ({ at: rel(p), text: stripComments(readFileSync(p, 'utf8'), p) }));
    // Not blind: the handle sign-in's own request to Auth's password door is among what was read.
    expect(code.filter((c) => /\b(fetch|withinLimit)\(`[^`]*\/auth\/v1\/token/.test(c.text)).map((c) => c.at.split('/').slice(-2).join('/')))
      .toEqual(['sign-in-with-username/index.ts']);
    expect(code.flatMap((c) => countedTogether(c.text, c.at)).map((h) => `${h.at}: ${h.why}`)).toEqual([]);
  });
});
