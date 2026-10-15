/**
 * The promise of a `--require` list (mockups/touch-measured.txt), kept in one
 * place: every source file it names had a control measured beside a neighbour.
 * layout.cjs keeps it over the screens it measured; scripts/jest-shards.cjs
 * over every part's screens when CI splits the capture run across machines.
 */

/**
 * The files the list names that no measured site is in. A site is
 * `file:line` (the JSX that made the control); the promise is kept per FILE,
 * so an edit above a control does not break it. Blank and `#` lines are not names.
 */
function lostFiles(requireText, sites) {
  const measuredFiles = new Set(sites.map((s) => s.replace(/:\d+$/, '')));
  return requireText.split('\n').map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#') && !measuredFiles.has(l));
}

module.exports = { lostFiles };
