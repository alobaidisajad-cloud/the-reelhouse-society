/**
 * The caller's address, as the platform vouches for it: the one key a per-address pace may trust.
 *
 * Every call reaches an edge function through Cloudflare, in front of Supabase's own gateway.
 * Cloudflare writes CF-Connecting-IP itself, one address, the one that connected to it (its
 * reference, "HTTP request headers": it recommends this header for the visitor's address; a Worker
 * on another zone is given Cloudflare's fixed Worker address there, never one it names). An
 * X-Forwarded-For the caller sends is KEPT, and Cloudflare adds the connecting address after it
 * (same reference), as Supabase's own users have seen it arrive: "spoofed,68.65.164.215"
 * (supabase discussion 34647). So the first entry is whatever the caller wrote: a pace keyed on it
 * is no pace, a script names a new address each call.
 *
 * Only CF-Connecting-IP is vouched for. Whether Supabase's gateway passes it to a function is not
 * written anywhere it can be read, so nothing else is ever taken in its place: an entry of
 * X-Forwarded-For might be the gateway's own hop, the same for every caller, and a pace keyed on
 * it would hold the whole house as one caller. With no vouched address a function paces no
 * address at all (the sign-in still counts each handle's attempts at the house). Each function
 * answers with `x-rh-caller-source` (cf, xff or none: which headers came, never an address), so
 * the first call after a deploy shows whether the pace by address is on.
 *
 * `written` is the first X-Forwarded-For entry, the caller's own claim: never a key here, only
 * what Auth is told of a caller no one vouches for (each honest caller's own address, never one
 * shared by all).
 *
 * One copy in each functions folder (supabase/functions/_shared and mobile/supabase/functions/_shared),
 * the same file; edgeFunctionsKnowTheirCaller.test.ts holds them the same.
 *
 * @param {{ get(name: string): string | null }} headers the request's headers
 * @returns {{ address: string | null, source: 'cf' | 'xff' | 'none', written: string | null }}
 */
export function callerAddress(headers) {
  const connecting = (headers.get('cf-connecting-ip') || '').trim()
  const hops = (headers.get('x-forwarded-for') || '').split(',').map((h) => h.trim()).filter((h) => h !== '')
  const first = hops.length > 0 ? hops[0] : ''
  const written = ADDRESS.test(first) ? first : null
  if (ADDRESS.test(connecting)) return { address: connecting, source: 'cf', written }
  return { address: null, source: hops.length > 0 ? 'xff' : 'none', written }
}

/**
 * The key a pace counts an address under: an IPv4 address whole; an IPv6 address by its /64, the
 * block one subscriber is handed whole (a caller holding one has 2^64 addresses to name, and would
 * otherwise meet a fresh pace at each); an IPv4 address written as IPv6 (::ffff:a.b.c.d) as IPv4.
 * Null for what is not an address.
 *
 * @param {string | null} address
 * @returns {string | null}
 */
export function paceKey(address) {
  if (!address || !ADDRESS.test(address)) return null
  if (!address.includes(':')) return IPV4.test(address) ? address : null
  const lower = address.toLowerCase()
  const mapped = /^(?:0*:)*:?ffff:(\d{1,3}(?:\.\d{1,3}){3})$/.exec(lower)
  if (mapped) return IPV4.test(mapped[1]) ? mapped[1] : null
  if (lower.includes('.')) return null
  const halves = lower.split('::')
  if (halves.length > 2) return null
  const head = halves[0] === '' ? [] : halves[0].split(':')
  const tail = halves.length === 2 && halves[1] !== '' ? halves[1].split(':') : []
  const missing = 8 - head.length - tail.length
  if (halves.length === 1 ? missing !== 0 : missing < 1) return null
  const groups = [...head, ...Array(halves.length === 2 ? missing : 0).fill('0'), ...tail]
  if (groups.some((g) => !/^[0-9a-f]{1,4}$/.test(g))) return null
  return `${groups.slice(0, 4).map((g) => parseInt(g, 16).toString(16)).join(':')}::/64`
}

/** An IPv4 or IPv6 address's characters, and no more than an address's length. */
export const ADDRESS = /^[0-9a-fA-F:.]{2,45}$/

/** Four numbers of 0-255. */
const IPV4 = /^(?:(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\.){3}(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)$/
