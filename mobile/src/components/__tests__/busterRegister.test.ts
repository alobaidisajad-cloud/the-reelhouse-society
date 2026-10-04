/**
 * WHERE BUSTER APPEARS — the register, as a test.
 *
 * He is the house's resident, not its wallpaper: he comes where the house has
 * nothing else to show (a room empty, a record lost, a reel jammed, a wait),
 * one to a screen, and never in a list's rows, a toast, a button or a notice of
 * sanction. Every place that draws him is named here with the moment it is; a
 * new one fails until somebody adds it on purpose, and a removed one fails
 * until its entry goes. Counted however he is drawn: <Buster>, the still one,
 * his eyes, the house's failed state that carries him (<EmptyOffline>), and an
 * <EmptyState> given his mood.
 *
 * Also held here: the pictures he is drawn from, one per mood and size at each
 * screen density, at exactly the pixels that density needs.
 */
import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import ts from 'typescript';
import { BUSTER_ART } from '../busterArt';

const ROOT = join(__dirname, '..', '..', '..');

type Count = { buster?: number; still?: number; eyes?: number; offline?: number; empty?: number; why: string };
/** Each screen's states are one at a time: a count is how many states draw him, never how many at once. */
const REGISTER: Record<string, Count> = {
  'src/components/EmptyStates.tsx': { buster: 1, empty: 1, why: 'an empty state given his mood; the house could not be reached (EmptyOffline): dimmed' },
  'app/(tabs)/reels.tsx': { buster: 2, offline: 2, why: 'the Reel or the stacks empty, or not reached: one list, one state at a time' },
  'src/components/reels/ReelsCards.tsx': { eyes: 1, why: 'a reel being read (SPOOLING)' },
  'app/(tabs)/darkroom.tsx': { buster: 1, offline: 1, why: 'the tray developed nothing, or could not be reached' },
  'app/(tabs)/lounge.tsx': { offline: 1, why: 'the salons could not be reached' },
  'app/lounge/[id].tsx': { buster: 2, eyes: 1, offline: 1, why: 'a salon not found, nobody has spoken in it, being reached, or not reached' },
  'app/(tabs)/profile.tsx': { buster: 1, eyes: 1, offline: 1, why: 'signed out at the archive’s door; your handle being read, or not read' },
  'app/user/[username].tsx': { buster: 1, eyes: 1, offline: 1, why: 'a member not found; a file being read, or not reached' },
  'src/components/film/FilmDetailLayout.tsx': { buster: 1, offline: 1, why: 'a film not in the archive, or not reached' },
  'app/film-reviews/[id].tsx': { offline: 1, why: 'a film’s critiques could not be reached' },
  'app/person/[id].tsx': { buster: 1, offline: 1, why: 'a person with no record, or not reached' },
  'app/stacks/[id].tsx': { buster: 1, eyes: 1, offline: 1, why: 'a stack classified or gone; being read, or not reached' },
  'app/log/[id].tsx': { buster: 1, eyes: 1, offline: 1, why: 'a log not found; being read, or not reached' },
  'app/(modals)/notifications-modal.tsx': { offline: 1, why: 'the notices could not be reached' },
  'src/components/lobby/LobbyWall.tsx': { offline: 1, why: 'the Lobby wall could not be reached' },
  'app/+not-found.tsx': { buster: 1, why: 'a link to nowhere' },
  'app/(modals)/search-modal.tsx': { buster: 1, why: 'a search that found nothing' },
  'app/dispatch/[id].tsx': { eyes: 1, why: 'a filing being read (its empty pages stay paper: no picture above the words)' },
  'app/dispatch/series/[id].tsx': { eyes: 1, why: 'a series being read' },
  'app/year-in-cinema.tsx': { eyes: 1, why: 'a year being developed' },
  'src/components/RouteErrorBoundary.tsx': { still: 1, why: 'a screen that crashed: moved, and still' },
  'src/components/ErrorBoundary.tsx': { still: 1, why: 'the app that crashed: moved, still, above the navigator' },
};

function sources(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(join(ROOT, dir), { withFileTypes: true })) {
    if (['node_modules', '__tests__'].includes(e.name) || e.name.startsWith('.')) continue;
    const rel = `${dir}/${e.name}`;
    if (e.isDirectory()) sources(rel, out);
    else if (/\.tsx$/.test(e.name)) out.push(rel);
  }
  return out;
}

type Found = Required<Omit<Count, 'why'>>;

/** The house's names for him, each counted under its own heading. */
const DRAWS: Record<string, keyof Found> = { Buster: 'buster', BusterStill: 'still', BusterEyes: 'eyes', EmptyOffline: 'offline' };

/**
 * Every place a file draws him, read from its syntax tree: a tag is a tag
 * however its props are written (an arrow, a nested tag, a line break), and a
 * name imported under another name is followed to what it is.
 */
function censusOf(file: string, text: string): Found {
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const local: Record<string, string> = { Buster: 'Buster', BusterStill: 'BusterStill', BusterEyes: 'BusterEyes', EmptyOffline: 'EmptyOffline', EmptyState: 'EmptyState' };
  for (const st of sf.statements) {
    if (!ts.isImportDeclaration(st) || !ts.isStringLiteral(st.moduleSpecifier)) continue;
    if (!/\/(Buster|EmptyStates)$/.test(st.moduleSpecifier.text)) continue;
    const clause = st.importClause;
    if (clause?.name) local[clause.name.text] = 'Buster'; // the default export is Buster himself
    if (clause?.namedBindings && ts.isNamedImports(clause.namedBindings)) {
      for (const el of clause.namedBindings.elements) local[el.name.text] = (el.propertyName ?? el.name).text;
    }
  }
  const found: Found = { buster: 0, still: 0, eyes: 0, offline: 0, empty: 0 };
  const visit = (node: ts.Node) => {
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
      const name = local[node.tagName.getText(sf)];
      if (name && DRAWS[name]) found[DRAWS[name]] += 1;
      // An empty state is his only when it is given his mood.
      if (name === 'EmptyState' && node.attributes.properties.some((p) => ts.isJsxAttribute(p) && p.name.getText(sf) === 'buster')) found.empty += 1;
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return found;
}

const census: Record<string, Found> = {};
for (const file of [...sources('app'), ...sources('src')]) {
  if (file === 'src/components/Buster.tsx') continue;
  const found = censusOf(file, readFileSync(join(ROOT, file), 'utf8'));
  if (Object.values(found).some((n) => n > 0)) census[file] = found;
}

describe('where Buster appears', () => {
  it('finds him at all (the scan has not gone blind)', () => {
    expect(Object.keys(census).length).toBeGreaterThanOrEqual(15);
  });

  it('appears only where the register says, as many times as it says', () => {
    const want = Object.fromEntries(Object.entries(REGISTER).map(([f, { buster = 0, still = 0, eyes = 0, offline = 0, empty = 0 }]) =>
      [f, { buster, still, eyes, offline, empty }]));
    expect(census).toEqual(want);
  });

  it('sees him however he is drawn: the failed state that carries him, an empty state given his mood, a name changed on import', () => {
    // The census's own rules, against the spellings they must catch and must not.
    const one = (src: string) => censusOf('probe.tsx', src);
    expect(one('<EmptyState title="T" buster="suspicious" />').empty).toBe(1);
    expect(one('<EmptyState\n  buster="dimmed"\n  title="Transmission Interrupted"\n/>').empty).toBe(1);
    expect(one('<EmptyState icon={<Users size={28} />} buster="dimmed" />').empty).toBe(1); // a tag in a prop
    expect(one('<EmptyState onRetry={() => go()} buster="dimmed" />').empty).toBe(1); // an arrow in a prop
    expect(one('<EmptyState icon={<Users size={28} />} title="The Circle" />').empty).toBe(0);
    expect(one('<EmptyOffline\n  onRetry={x}\n/>').offline).toBe(1);
    expect(one('<View><Buster mood="moved" size={80} /></View>').buster).toBe(1);
    expect(one("import Ghost, { BusterEyes as Wait } from '@/src/components/Buster';\nconst A = () => <><Ghost mood=\"moved\" size={80} /><Wait /></>;")).toEqual({ buster: 1, still: 0, eyes: 1, offline: 0, empty: 0 });
    expect(one("import { EmptyOffline as Lost } from '@/src/components/EmptyStates';\nconst A = () => <Lost onRetry={r} />;").offline).toBe(1);
    expect(one('const BusterLike = 1; <BusterLike />').buster).toBe(0);
  });

  it('gives every place its reason', () => {
    for (const [file, { why }] of Object.entries(REGISTER)) expect([file, why.trim().length >= 12]).toEqual([file, true]);
  });
});

/** A PNG's own width and height, from its header. */
function pngSize(path: string): [number, number] {
  const b = readFileSync(path);
  return [b.readUInt32BE(16), b.readUInt32BE(20)];
}

describe('the pictures he is drawn from', () => {
  const dir = join(ROOT, 'assets', 'buster');
  const keys = Object.keys(BUSTER_ART) as (keyof typeof BUSTER_ART)[];
  const name = (key: string, scale: number) => `${key}${scale === 1 ? '' : `@${scale}x`}.png`;

  it('are exactly the ones the app reads: every density of every picture, and nothing else', () => {
    const expected = keys.flatMap((k) => [1, 2, 3, 4].map((s) => name(k, s))).sort();
    expect(readdirSync(dir).sort()).toEqual(expected);
  });

  it('are each exactly the pixels their density needs: no phone ever stretches one', () => {
    for (const key of keys) {
      const { width, height } = BUSTER_ART[key];
      for (const scale of [1, 2, 3, 4]) {
        expect([key, scale, pngSize(join(dir, name(key, scale)))]).toEqual([key, scale, [width * scale, height * scale]]);
      }
    }
  });

  it('place his brass points inside the picture', () => {
    for (const key of keys) {
      for (const e of BUSTER_ART[key].eyes) {
        expect(e.x).toBeGreaterThan(0.2); expect(e.x).toBeLessThan(0.8);
        expect(e.y).toBeGreaterThan(0.2); expect(e.y).toBeLessThan(0.6);
        expect(e.r).toBeGreaterThan(0.005); expect(e.r).toBeLessThan(0.02);
      }
    }
  });
});
