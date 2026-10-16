/**
 * Reading mobile/e2e/old-clients.json: which shipped clients are checked, and
 * whether a client's record is whole. Shared by db/old-clients.mjs (each client
 * held to the proposed schema), old-client-tree.mjs (each client run end to
 * end, its flows' waits as long as this checkout's) and run-flows.sh (a
 * client's own crashes, for the crash gate), and held by
 * migrationSafety.guard.test.ts.
 *
 *   node mobile/e2e/old-clients.cjs --own-crashes "TestFlight build 41"
 *
 * prints that client's own crashes as JSON ({ client, ownCrashes }), or refuses.
 */

/**
 * What an E2E run of a shipped client keeps from this checkout: the harness, and
 * test-utils, whose shared file list (universe.js) the harness's scripts read.
 */
const HARNESS = ['e2e', 'scripts', 'supabase', 'test-utils', 'node_modules'];

const FULL = /^[0-9a-f]{40}$/;
const SHORT_OR_FULL = /^[0-9a-f]{7,40}$/;
const APP_PATH = /^mobile\/(?!e2e\/|scripts\/|supabase\/|test-utils\/)[\w./[\]-]+$/;
/** The register's own id shape (scripts/register.cjs). */
const CLASS_ID = /^[A-Z][A-Z0-9]*(-[a-z0-9]+)+$/;
/** A match this short could take any crash for the client's own. */
const MATCH_MIN = 12;

/** An own crash, fixed since in the app: a register id, a piece of its message, a reason. */
const ownCrashWhole = (o) => CLASS_ID.test(o.class ?? '') && typeof o.match === 'string'
  && o.match.trim().length >= MATCH_MIN && SHORT_OR_FULL.test(o.fixedIn ?? '') && !!(o.why ?? '').trim();

/** The named client: checked, a full commit, each patch and own crash whole. */
const clientNamed = (record, name) => {
  const c = record.clients.find((x) => x.name === name);
  if (!c) return { refuse: `no client named "${name}" in old-clients.json` };
  if (!c.checked || !FULL.test(c.commit ?? '')) return { refuse: `${name} is not a checked client with a full commit` };
  for (const p of c.patches ?? []) {
    if (!APP_PATH.test(p.path ?? '') || !FULL.test(p.from ?? '') || !(p.why ?? '').trim()) {
      return { refuse: `${name}: a patch needs an app path outside the harness, a full commit and a reason (${p.path})` };
    }
  }
  for (const o of c.ownCrashes ?? []) {
    if (!ownCrashWhole(o)) {
      return { refuse: `${name}: an own crash needs a register id, a match of ${MATCH_MIN} or more characters, the commit that fixed it and a reason (${o.class})` };
    }
  }
  return { client: c };
};

/**
 * Each command of a flow that waits: its line, its name, what it waits for (an
 * element's text or id) and its timeout. A command is its "- name:" line and
 * the lines under it up to the next command, nested ones included as their own.
 */
const waitsIn = (yaml) => {
  const lines = yaml.replace(/\r\n/g, '\n').split('\n');
  const starts = lines.map((l, i) => (/^\s*- \w+:/.test(l) ? i : -1)).filter((i) => i >= 0);
  return starts.flatMap((at, k) => {
    const block = lines.slice(at, starts[k + 1] ?? lines.length);
    const timeout = block.findIndex((l) => /^\s*timeout:\s*\d+\s*$/.test(l));
    if (timeout === -1) return [];
    const named = block.map((l) => /^\s*(?:element|id|text|visible):\s*"([^"]+)"\s*$/.exec(l)).find(Boolean);
    return [{
      line: at + timeout,
      command: (/^\s*- (\w+):/.exec(lines[at]) ?? [])[1] ?? '',
      waitsFor: named ? named[1] : '',
      ms: Number((/(\d+)/.exec(block[timeout]) ?? [])[1] ?? 0),
    }];
  });
};

/**
 * A shipped client's flow, each wait given at least the time this checkout's
 * same flow gives the same command waiting for the same thing: a flow's time is
 * the harness's (how slow the emulator is), never the app's, and one this
 * checkout raised because a runner ran out of it must not fail the client on
 * the next slow runner. Never lowers one. Returns the text and each raise.
 */
const raiseWaits = (clientYaml, ownYaml) => {
  const longest = new Map();
  for (const w of waitsIn(ownYaml)) {
    const key = `${w.command}\u0000${w.waitsFor}`;
    longest.set(key, Math.max(longest.get(key) ?? 0, w.ms));
  }
  const lines = clientYaml.replace(/\r\n/g, '\n').split('\n');
  const raised = [];
  for (const w of waitsIn(clientYaml)) {
    // A wait whose target is not read is never matched: it could be any other.
    const ms = w.waitsFor ? longest.get(`${w.command}\u0000${w.waitsFor}`) ?? 0 : 0;
    if (ms <= w.ms) continue;
    lines[w.line] = lines[w.line].replace(/\d+/, String(ms));
    raised.push({ command: w.command, waitsFor: w.waitsFor, from: w.ms, to: ms });
  }
  return { text: lines.join('\n'), raised };
};

/** Every checked client, each whole, or an error naming the first that is not. */
const toCheck = (record) => record.clients.filter((c) => c.checked).map((c) => {
  const { client, refuse } = clientNamed(record, c.name);
  if (refuse) throw new Error(refuse);
  return client;
});

/**
 * What is wrong with a client's own crashes against the repository: each class
 * must be in the register, and each fixedIn a commit git has. `classIds` is the
 * register's ids; `commitExists(sha)` asks git. [] when nothing.
 */
const ownCrashFaults = (client, { classIds, commitExists }) => (client.ownCrashes ?? []).flatMap((o) => [
  ...(classIds.includes(o.class) ? [] : [`${client.name}: own crash class ${o.class} is not in the register`]),
  ...(commitExists(o.fixedIn) ? [] : [`${client.name}: own crash ${o.class} is fixed in ${o.fixedIn}, which is not a commit git has`]),
]);

module.exports = { HARNESS, clientNamed, toCheck, ownCrashFaults, raiseWaits, waitsIn };

if (require.main === module) {
  const args = process.argv.slice(2);
  if (args[0] !== '--own-crashes' || !args[1]) {
    console.error('usage: node mobile/e2e/old-clients.cjs --own-crashes "<client name>"');
    process.exit(2);
  }
  const record = require('./old-clients.json');
  const { client, refuse } = clientNamed(record, args[1]);
  if (refuse) { console.error(`REFUSED: ${refuse}`); process.exit(1); }
  console.log(JSON.stringify({ client: client.name, ownCrashes: client.ownCrashes ?? [] }));
}
