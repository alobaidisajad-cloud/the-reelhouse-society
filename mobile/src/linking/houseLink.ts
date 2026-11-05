/**
 * houseLink — a link to the house's website, opened by the app, is the app's own page.
 *
 * The phone opens the app for a house address (decision 9, P4.20) only on a path the app claims
 * (housePaths.json: `ios.associatedDomains` and Android's intent filters are held to it). The
 * website names some pages its own way, so each claimed path is read here into the app's:
 * /lists/9 is the stack /stacks/9, /patronage is the Society's page, /user/x/diary is x's ledger.
 * Its values are passed as they came; each screen reads them in their kind (routeParams).
 */
import table from './housePaths.json';

type Claim = { web: string; app: string | null; query?: Record<string, Record<string, string>> };

/** One web path read as a pattern: `:name` is one segment, `:name?` one that may be missing. */
function patternOf(web: string): { re: RegExp; names: string[] } {
  const names: string[] = [];
  const body = web.split('/').filter(Boolean).map((part) => {
    const named = /^:(\w+)(\?)?$/.exec(part);
    if (!named) return `/${part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`;
    names.push(named[1]!);
    return named[2] ? '(?:/([^/]+))?' : '/([^/]+)';
  }).join('');
  return { re: new RegExp(`^${body || '/'}$`), names };
}

const CLAIMED = (table.paths as Claim[])
  .filter((c): c is Claim & { app: string } => c.app !== null)
  .map((c) => ({ ...c, ...patternOf(c.web) }));

/** The house's own hosts: the bare one only sends to www, and a link may still name it. */
const HOSTS = new Set([table.host, table.host.replace(/^www\./, '')]);

/** The app's path for a link to the house's website; null for any other link, or a page it does not claim. */
export function appPathOf(url: string): string | null {
  const parts = /^https:\/\/([^/?#]+)([^?#]*)/i.exec(url);
  if (!parts || !HOSTS.has(parts[1]!.toLowerCase())) return null;
  const path = parts[2]!.replace(/\/+$/, '') || '/';
  for (const claim of CLAIMED) {
    const found = claim.re.exec(path);
    if (!found) continue;
    const values = Object.fromEntries(claim.names.map((n, i) => [n, found[i + 1]]));
    const target = claim.app.replace(/:(\w+)/g, (_, n: string) => values[n] ?? '');
    const query = Object.entries(claim.query ?? {})
      .filter(([n]) => values[n] !== undefined)
      .map(([n, renamed]) => `${n}=${renamed[values[n]!] ?? values[n]}`);
    return query.length ? `${target}?${query.join('&')}` : target;
  }
  return null;
}
