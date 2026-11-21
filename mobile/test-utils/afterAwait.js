/**
 * afterAwait — what a function does after it waits, and whether a check stands between.
 *
 * Two kinds of mistake share one shape: code that waits (an `await`, or a promise's `then`) and
 * then acts as if nothing changed while it waited. A screen walks onward after the member left it
 * (workEndsWithItsScreen.guard.test.ts); an older answer is drawn over a newer state. Each sweep
 * asks this module where a function's body
 * runs after a wait, which calls stand there, and whether each is covered by a check made AFTER
 * the last wait before it. A check made before the wait proves nothing: the wait is where the
 * world changed.
 *
 * A check is a predicate the sweep passes in: given an expression it answers 'here' (true means
 * still here, still the read asked), 'gone' (true means left, overtaken) or null. Covered means:
 * inside `if (c)`, `c && x` or `c ? x :` where c being true proves 'here'; inside the `else` of
 * one whose c being false proves it; or after `if (c) return` (or throw) earlier in an enclosing
 * block, where c being false proves it.
 *
 * Plain CommonJS, like stripComments.js, so a node tool can ask the same questions.
 */
const ts = require('typescript');

const KIND = { ts: ts.ScriptKind.TS, tsx: ts.ScriptKind.TSX, js: ts.ScriptKind.JS, jsx: ts.ScriptKind.JSX, mjs: ts.ScriptKind.JS, cjs: ts.ScriptKind.JS };

/** A file's syntax tree. */
function parse(file, text) {
  const ext = (/\.([a-z]+)$/.exec(file) || [])[1] || 'tsx';
  return ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, KIND[ext] || ts.ScriptKind.TSX);
}

const isFn = (n) => ts.isArrowFunction(n) || ts.isFunctionExpression(n) || ts.isFunctionDeclaration(n)
  || ts.isMethodDeclaration(n) || ts.isGetAccessorDeclaration(n) || ts.isSetAccessorDeclaration(n) || ts.isConstructorDeclaration(n);
const isAsync = (n) => (ts.getCombinedModifierFlags(n) & ts.ModifierFlags.Async) !== 0;

/** Callbacks run at once, as part of the body that passes them: their calls are that body's. */
const AT_ONCE = new Set(['forEach', 'map', 'filter', 'flatMap', 'reduce', 'some', 'every', 'find', 'findIndex']);
/** A promise's tail: its callback runs after the promise settles. */
const TAIL = new Set(['then', 'catch', 'finally']);

const calleeName = (call) => (ts.isPropertyAccessExpression(call.expression) ? call.expression.name.text : null);

/** A function passed to an array method, run at once inside the body that holds it. */
function runsAtOnce(fn) {
  const call = fn.parent;
  return !!call && ts.isCallExpression(call) && call.arguments.includes(fn) && AT_ONCE.has(calleeName(call) || '');
}

/** A function passed to a promise's then/catch/finally: all of it runs after a wait. */
function isTail(fn) {
  const call = fn.parent;
  return !!call && ts.isCallExpression(call) && call.arguments.includes(fn) && TAIL.has(calleeName(call) || '');
}

/** The function whose body this node runs in, looking through callbacks run at once. */
function ownerOf(node) {
  for (let n = node.parent; n; n = n.parent) if (isFn(n) && !runsAtOnce(n)) return n;
  return null;
}

/**
 * Every function a part of whose body runs after a wait: an async one (after its first await),
 * and a promise tail (all of it). Each with `tail` set for the second.
 */
function waitingBodies(sf) {
  const out = [];
  const visit = (n) => {
    if (isFn(n) && n.body && !runsAtOnce(n)) {
      if (isTail(n)) out.push({ fn: n, tail: true });
      else if (isAsync(n)) out.push({ fn: n, tail: false });
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return out;
}

/** Each node of a function's own body (callbacks run at once included, other functions not). */
function ownNodes(fn, pick) {
  const out = [];
  const walk = (n) => {
    if (n !== fn && isFn(n) && !runsAtOnce(n)) return;
    const hit = pick(n);
    if (hit) out.push(hit);
    ts.forEachChild(n, walk);
  };
  walk(fn.body);
  return out;
}

/**
 * Where the last wait before `pos` ends, in this function's own body: an await, or for a tail the
 * start of its body. -1 when nothing waits before it.
 */
function lastWaitBefore(body, pos, node) {
  if (!body.waits) body.waits = ownNodes(body.fn, (n) => (ts.isAwaitExpression(n) || (ts.isForOfStatement(n) && n.awaitModifier) ? n : null));
  const before = body.waits.filter((w) => w.getEnd() <= pos && !(node && (otherBranch(w, node) || leavesFirst(w, node)))).map((w) => w.getEnd());
  if (before.length) return Math.max(...before);
  return body.tail ? body.fn.body.getStart() : -1;
}

/** The arm of an if, or of a `?:`, that a node stands in: 'then', 'else', or null below another. */
function armOf(parent, child) {
  if (ts.isIfStatement(parent)) return child === parent.thenStatement ? 'then' : child === parent.elseStatement ? 'else' : null;
  if (ts.isConditionalExpression(parent)) return child === parent.whenTrue ? 'then' : child === parent.whenFalse ? 'else' : null;
  return null;
}

/** A wait inside a return (or throw) that does not hold the node: the run that waits there leaves. */
function leavesFirst(w, node) {
  for (let n = w.parent; n && !isFn(n); n = n.parent) {
    if (ts.isReturnStatement(n) || ts.isThrowStatement(n)) return !(node.getStart() >= n.getStart() && node.getEnd() <= n.getEnd());
  }
  return false;
}

/** Two nodes in opposite arms of one if (or `?:`): a run that passes one never passes the other. */
function otherBranch(a, b) {
  const path = new Map();
  for (let n = a; n && n.parent; n = n.parent) path.set(n.parent, n);
  for (let n = b; n && n.parent; n = n.parent) {
    const viaA = path.get(n.parent);
    if (viaA) {
      const x = armOf(n.parent, viaA);
      const y = armOf(n.parent, n);
      return !!x && !!y && x !== y;
    }
  }
  return false;
}

const strip = (e) => { while (e && ts.isParenthesizedExpression(e)) e = e.expression; return e; };

/** c being true proves 'here'. */
function provesHere(e, check) {
  e = strip(e);
  if (ts.isPrefixUnaryExpression(e) && e.operator === ts.SyntaxKind.ExclamationToken) return provesWhenFalse(e.operand, check);
  if (ts.isBinaryExpression(e) && e.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken) return provesHere(e.left, check) || provesHere(e.right, check);
  if (ts.isBinaryExpression(e) && e.operatorToken.kind === ts.SyntaxKind.BarBarToken) return provesHere(e.left, check) && provesHere(e.right, check);
  return check(e) === 'here';
}

/** c being false proves 'here'. */
function provesWhenFalse(e, check) {
  e = strip(e);
  if (ts.isPrefixUnaryExpression(e) && e.operator === ts.SyntaxKind.ExclamationToken) return provesHere(e.operand, check);
  if (ts.isBinaryExpression(e) && e.operatorToken.kind === ts.SyntaxKind.BarBarToken) return provesWhenFalse(e.left, check) || provesWhenFalse(e.right, check);
  if (ts.isBinaryExpression(e) && e.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken) return provesWhenFalse(e.left, check) && provesWhenFalse(e.right, check);
  return check(e) === 'gone';
}

/** A statement that always leaves the block it stands in. */
function exits(s) {
  if (!s) return false;
  if (ts.isReturnStatement(s) || ts.isThrowStatement(s) || ts.isContinueStatement(s) || ts.isBreakStatement(s)) return true;
  if (ts.isBlock(s)) return s.statements.length > 0 && exits(s.statements[s.statements.length - 1]);
  if (ts.isIfStatement(s)) return exits(s.thenStatement) && exits(s.elseStatement);
  return false;
}

/** Whether `node` is covered by a check that begins after `since`, inside the function `fn`. */
function coveredAfter(fn, node, since, check) {
  for (let a = node; a && a !== fn; a = a.parent) {
    const p = a.parent;
    if (!p) break;
    if (ts.isIfStatement(p) && p.getStart() > since) {
      if (a === p.thenStatement && provesHere(p.expression, check)) return true;
      if (a === p.elseStatement && provesWhenFalse(p.expression, check)) return true;
    }
    if (ts.isBinaryExpression(p) && a === p.right && p.left.getStart() > since) {
      if (p.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken && provesHere(p.left, check)) return true;
      if (p.operatorToken.kind === ts.SyntaxKind.BarBarToken && provesWhenFalse(p.left, check)) return true;
    }
    if (ts.isConditionalExpression(p) && p.condition.getStart() > since) {
      if (a === p.whenTrue && provesHere(p.condition, check)) return true;
      if (a === p.whenFalse && provesWhenFalse(p.condition, check)) return true;
    }
    const list = ts.isBlock(p) || ts.isSourceFile(p) || ts.isCaseClause(p) || ts.isDefaultClause(p) ? p.statements : null;
    if (list) {
      for (const s of list) {
        if (s === a) break;
        if (s.getStart() > since && ts.isIfStatement(s) && exits(s.thenStatement) && provesWhenFalse(s.expression, check)) return true;
      }
    }
  }
  return false;
}

/** The line (from 1) a node starts on. */
const lineOf = (sf, node) => sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;

/**
 * The nearest named function around a node, with its name: a component (Capitalised), a hook
 * (`use…`), a store method, or none.
 */
function namedOwner(node) {
  for (let n = node.parent; n; n = n.parent) {
    if (ts.isFunctionDeclaration(n) && n.name) return { node: n, name: n.name.text };
    if ((ts.isArrowFunction(n) || ts.isFunctionExpression(n)) && n.parent) {
      const p = n.parent;
      if (ts.isVariableDeclaration(p) && ts.isIdentifier(p.name)) return { node: n, name: p.name.text };
      if (ts.isPropertyAssignment(p) && (ts.isIdentifier(p.name) || ts.isStringLiteral(p.name))) return { node: n, name: p.name.text };
    }
    if (ts.isMethodDeclaration(n) && ts.isIdentifier(n.name)) return { node: n, name: n.name.text };
  }
  return null;
}

/** The outermost named function around a node: the component or hook it lives in. */
function outermostOwner(node) {
  let found = null;
  for (let n = node; n; n = n.parent) {
    const o = namedOwner(n);
    if (!o) break;
    found = o;
    n = o.node;
  }
  return found;
}

module.exports = { parse, isFn, isAsync, waitingBodies, ownNodes, lastWaitBefore, coveredAfter, provesHere, provesWhenFalse, ownerOf, lineOf, namedOwner, outermostOwner, strip };
