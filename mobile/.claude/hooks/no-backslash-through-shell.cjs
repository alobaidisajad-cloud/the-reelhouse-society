#!/usr/bin/env node
/**
 * Blocks JavaScript written through the shell when it contains a backslash.
 *
 * WHY THIS EXISTS
 * A regex piped through a bash heredoc or `node -e` silently loses its
 * backslashes. `\s` becomes `s`, `\d` becomes `d`, `\b` becomes a literal
 * backspace, `\\.` becomes `.`. The code still runs, so there is no error —
 * there is a WRONG ANSWER DELIVERED CONFIDENTLY.
 *
 * It broke four scripts across two pages of this project. The worst was an
 * orphaned-style detector that reported all 71 styles in a file as dead;
 * acting on it would have deleted the entire stylesheet. When the tooling
 * behind the word "verified" is silently wrong, every claim resting on it is
 * worthless — which is why this is enforced rather than remembered.
 *
 * THE FIX IS ALWAYS THE SAME: write the script to a .cjs file with the Write
 * tool and run that file, or use the Edit tool for a source change.
 *
 * Reads a PreToolUse payload on stdin, exits 0 to allow, 2 to block.
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

  // Only JS routed through the shell, and only where `node` is genuinely being
  // INVOKED — at the start of the command or after a pipe, &&, ;, or (.
  //
  // The anchor matters: the very first commit of this hook was blocked by the
  // hook itself, because the commit message explains the trap and therefore
  // quotes `node -e` and the escapes it eats. Scanning the whole command
  // string cannot tell a heredoc bound for `git commit -F -` from one bound
  // for node. A mention is not an invocation.
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
