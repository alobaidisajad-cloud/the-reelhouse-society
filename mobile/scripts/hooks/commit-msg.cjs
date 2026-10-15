#!/usr/bin/env node
/**
 * After the pre-commit hook passed: the message gains a `Hooks-Ran: pre-commit`
 * trailer, so CI can tell a commit made with the hooks from one made around
 * them (git commit --no-verify skips both hooks, and so leaves no trailer).
 * Run by mobile/githooks/commit-msg with the message file's path.
 */
const { execFileSync } = require('child_process');

const TRAILER = 'Hooks-Ran: pre-commit';
const file = process.argv[2];
if (!file) { console.error('commit-msg: no message file'); process.exit(1); }
execFileSync('git', ['interpret-trailers', '--in-place', '--if-exists', 'doNothing', '--trailer', TRAILER, file]);
