/**
 * The one place the production database address is read from, and saved to.
 *
 * It lives in a folder outside the repo and outside OneDrive (OneDrive syncs a
 * file to the cloud and keeps its old versions), by default `reelhouse-private`
 * in the user's home folder, or wherever REELHOUSE_PRIVATE points. Its file,
 * `production.env`, holds lines of NAME=value. A folder inside OneDrive or
 * inside the repo is refused, so a copy cannot drift back there.
 *
 * Every script that needs SUPABASE_DB_URL or SUPABASE_PROJECT_REF reads them
 * here (migrationSafety.guard.test.ts holds that).
 */
const { existsSync, mkdirSync, readFileSync, writeFileSync } = require('fs');
const { homedir } = require('os');
const { join, resolve, sep } = require('path');

const REPO = resolve(__dirname, '..', '..');

/** Why a folder may not hold the address, or null when it may. */
const refusal = (dir) => {
  const full = resolve(dir);
  const parts = full.toLowerCase().split(sep);
  if (parts.some((p) => p === 'onedrive' || p.startsWith('onedrive - '))) return `${full} is inside OneDrive`;
  const repo = REPO.toLowerCase();
  if (full.toLowerCase() === repo || full.toLowerCase().startsWith(repo + sep)) return `${full} is inside the repo`;
  return null;
};

const privateDir = () => process.env.REELHOUSE_PRIVATE || join(homedir(), 'reelhouse-private');
const privateFile = () => join(privateDir(), 'production.env');

const guard = () => {
  const why = refusal(privateDir());
  if (why) throw new Error(`The private settings folder may not be used: ${why}. Set REELHOUSE_PRIVATE to a folder outside both.`);
};

/** NAME's value from the private file ('' when absent), unless the environment sets it. */
const readPrivate = (name) => {
  if (process.env[name]) return process.env[name];
  guard();
  if (!existsSync(privateFile())) return '';
  for (const line of readFileSync(privateFile(), 'utf8').split(/\r?\n/)) {
    const i = line.indexOf('=');
    if (i > 0 && line.slice(0, i).trim() === name) return line.slice(i + 1).trim().replace(/^["']|["']$/g, '');
  }
  return '';
};

/** Sets each NAME=value in the private file, keeping its other lines. */
const writePrivate = (entries) => {
  guard();
  mkdirSync(privateDir(), { recursive: true });
  const kept = existsSync(privateFile())
    ? readFileSync(privateFile(), 'utf8').split(/\r?\n/).filter((l) => l && !Object.keys(entries).some((k) => l.startsWith(`${k}=`)))
    : [];
  writeFileSync(privateFile(), [...kept, ...Object.entries(entries).map(([k, v]) => `${k}=${v}`)].join('\n') + '\n');
  return privateFile();
};

module.exports = { privateDir, privateFile, readPrivate, refusal, writePrivate };
