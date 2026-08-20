// Proves the guard blocks the real trap and lets innocent commands through.
const { execFileSync } = require('child_process');
const HOOK = 'C:/Users/OMEN/OneDrive/Desktop/divisionops/reelhouse/mobile/.claude/hooks/no-backslash-through-shell.cjs';

const run = (command) => {
  try {
    execFileSync('node', [HOOK], { input: JSON.stringify({ tool_input: { command } }), stdio: ['pipe', 'pipe', 'pipe'] });
    return 'ALLOW';
  } catch (e) {
    return e.status === 2 ? 'BLOCK' : 'ERR' + e.status;
  }
};

const cases = [
  // the exact commands that burned me, all of which must be blocked
  ['BLOCK', `node -e "const re = new RegExp('s\\\\.' + n + '\\\\b');"`],
  ['BLOCK', `node - <<'EOF'\ns = s.replace(/\\s+/g, ' ');\nEOF`],
  ['BLOCK', `node -e "console.log('x'.match(/(\\d+)/))"`],
  ['BLOCK', `node - <<'JSEOF'\nconst m = src.match(/rankNumber: \\{[^}]*\\}/);\nJSEOF`],
  // and everything innocent must still run
  ['ALLOW', 'npx jest app/stacks'],
  ['ALLOW', 'grep -nE "foo\\|bar" file.ts'],
  ['ALLOW', `node - <<'EOF'\nconst s = fs.readFileSync(p);\nfs.writeFileSync(p, s + "x");\nEOF`],
  ['ALLOW', 'node scripts/thing.cjs'],
  ['ALLOW', 'git commit -m "fixed the \\thing"'],
  ['ALLOW', 'npx tsc --noEmit'],
  // The false positive this hook produced on its own first commit: a message
  // that EXPLAINS the trap necessarily quotes `node -e` and the escapes it
  // eats. A mention is not an invocation.
  ['ALLOW', `git commit -F - <<'EOF'\nA regex through \`node -e\` loses \\s, \\d and \\b.\nEOF`],
  ['ALLOW', `echo "see node -e for why \\d breaks"`],
  // ...but a real invocation after && is still caught
  ['BLOCK', `cd /tmp && node -e "x.match(/\\d+/)"`],
  ['BLOCK', `cat f | node -e "process.stdin.on('data', d => d.match(/\\s/))"`],
];

let bad = 0;
for (const [want, cmd] of cases) {
  const got = run(cmd);
  const ok = got === want;
  if (!ok) bad++;
  console.log(`${ok ? 'ok  ' : 'FAIL'}  want ${want}  got ${got}   ${cmd.split('\n')[0].slice(0, 62)}`);
}
console.log(bad === 0 ? '\nall cases correct' : `\n${bad} WRONG`);
