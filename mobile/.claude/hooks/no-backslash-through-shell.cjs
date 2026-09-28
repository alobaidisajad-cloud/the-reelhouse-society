#!/usr/bin/env node
/**
 * Blocks JavaScript written through the shell when it contains a backslash.
 *
 * A regex piped through a bash heredoc or `node -e` silently loses its
 * backslashes (`\s` becomes `s`, `\b` a backspace): the code still runs, and
 * delivers a WRONG ANSWER confidently. Enforced, not remembered. The way round
 * is always the same: a .cjs file written with the Write tool, or the Edit tool.
 *
 * Reads Claude Code's pre-tool-use payload on stdin; exits 0 to allow, 2 to block.
 */
let raw = '';
process.stdin.on('data', (c) => (raw += c));
process.stdin.on('end', () => {
  let cmd = '';
  try {
    const input = JSON.parse(raw || '{}');
    cmd = String(input?.tool_input?.command ?? '');
  } catch {
    process.exit(0);                       // unparseable: never block on our own bug
  }
  if (!cmd) process.exit(0);

  // Only where `node` is INVOKED (at the start, or after |, &&, ; or ( ): a commit
  // message that merely mentions `node -e` is not an invocation.
  const AT_COMMAND = String.raw`(?:^|[|&;(]\s*)`;
  const isInlineNode = new RegExp(AT_COMMAND + String.raw`node\s+(?:-e|--eval)\b`).test(cmd);
  const isNodeHeredoc = new RegExp(AT_COMMAND + String.raw`node\s+-?\s*<<[-']?\s*\w+`).test(cmd);
  if (!isInlineNode && !isNodeHeredoc) process.exit(0);

  // The escapes that vanish. A lone backslash-newline continuation is fine.
  const dangerous = cmd.match(/\\[sdwbSDWB.(){}[\]|+*?^$\\/]/g);
  if (!dangerous) process.exit(0);

  const seen = [...new Set(dangerous)].slice(0, 8).join('  ');
  process.stderr.write(
    'BLOCKED — backslashes in JavaScript written through the shell.\n\n' +
    `Found: ${seen}\n\n` +
    'The shell eats these before node sees them, so the script RUNS and returns a\n' +
    'confidently wrong answer. This has broken four scripts in this project; one\n' +
    'reported all 71 styles in a file as dead.\n\n' +
    'Instead:\n' +
    '  • Write the script to a .cjs file with the Write tool, then run that file.\n' +
    '  • For a source change, use the Edit tool.\n' +
    '  • Or use a backslash-free assertion that says the same thing.\n'
  );
  process.exit(2);                          // 2 = block, and show this to Claude
});
