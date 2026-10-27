/**
 * Every line the app reports is fixed text, and every value a typed key (P4.44).
 *
 * A report leaves the phone as its line and its listed values (sentryScrub). A line built from a
 * template carried whatever was put in it: a handle, a storage key holding a member's id, a link.
 * A finder over the syntax tree fails on:
 *   · a logger.warn / logger.error / captureError / captureWarning line that is interpolated;
 *   · an object literal after a logger line (its values belong in a typed context, or nowhere);
 *   · a capture context that is not an object literal of keys on sentryScrub's list;
 *   · a direct Sentry. call outside src/lib/sentry.ts, but for the two listed with why.
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import ts from 'typescript';
import { files, rel } from '@/test-utils/universe';
import { REPORT_KEYS } from '../sentryScrub';

const ROOT = join(__dirname, '..', '..', '..');

/** Direct calls of the SDK outside sentry.ts, each with why. */
const SDK_CALLS: Record<string, string> = {
  'src/hooks/useScreenReady.tsx': "the SDK's own full-display component; screens' tests replace src/lib/sentry whole",
  'src/services/ProfileDataService.ts': 'one span by a fixed name, a row count set on it; its tests replace src/lib/sentry whole',
};
/** The two places a context is passed on as built: the logger (a server code alone) and sentry.ts itself. */
const PASSES_ON = new Set(['src/utils/logger.ts', 'src/lib/sentry.ts']);

export function faultsIn(file: string, text: string): string[] {
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, file.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const out: string[] = [];
  const at = (n: ts.Node, what: string) => out.push(`${file}:${sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1} ${what}`);
  const visit = (n: ts.Node) => {
    if (ts.isCallExpression(n)) {
      const callee = n.expression.getText(sf);
      if (/^(logger\.(warn|error)|captureError|captureWarning)$/.test(callee)) {
        const line = callee === 'captureError' ? undefined : n.arguments[0];
        if (line && (ts.isTemplateExpression(line) || (ts.isBinaryExpression(line) && line.operatorToken.kind === ts.SyntaxKind.PlusToken))) {
          at(n, `${callee}: an interpolated line`);
        }
        if (callee.startsWith('logger.') && n.arguments.slice(1).some(ts.isObjectLiteralExpression)) at(n, `${callee}: an object after the line`);
        const context = callee.startsWith('capture') ? n.arguments[1] : undefined;
        if (context && !PASSES_ON.has(file)) {
          if (!ts.isObjectLiteralExpression(context)) at(n, `${callee}: a context that is not an object literal`);
          else {
            for (const p of context.properties) {
              const key = p.name?.getText(sf) ?? p.getText(sf);
              if (!(key in REPORT_KEYS)) at(n, `${callee}: '${key}' is not a listed key`);
            }
          }
        }
      }
      if (/^Sentry\./.test(callee) && file !== 'src/lib/sentry.ts' && !(file in SDK_CALLS)) at(n, `a direct ${callee}`);
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return out;
}

const scanned = files('appCode', { ext: ['.ts', '.tsx'] }).map(rel)
  .map((f) => ({ f, text: readFileSync(join(ROOT, f), 'utf8') }))
  .filter(({ text }) => /logger\.(warn|error)|capture(Error|Warning)|Sentry\./.test(text));

describe('every report', () => {
  it('is read (the scan has not gone blind)', () => {
    expect(scanned.length).toBeGreaterThanOrEqual(50);
  });

  it('is a fixed line with typed values, through sentry.ts', () => {
    expect(scanned.flatMap(({ f, text }) => faultsIn(f, text))).toEqual([]);
  });

  it('every SDK call listed is still there', () => {
    expect(Object.keys(SDK_CALLS).filter((f) => !scanned.some((s) => s.f === f && /Sentry\./.test(s.text)))).toEqual([]);
  });

  it('says NO to each way a member could ride along', () => {
    const faults = (src: string) => faultsIn('probe.ts', src).map((f) => f.replace(/^probe\.ts:\d+ /, ''));
    expect(faults('logger.warn(`[x] failed for @${handle}`);')).toEqual(['logger.warn: an interpolated line']);
    expect(faults("logger.warn('[x] failed for ' + handle);")).toEqual(['logger.warn: an interpolated line']);
    expect(faults("logger.error('[x] failed', { handle });")).toEqual(['logger.error: an object after the line']);
    expect(faults("captureError(e, { scope: 'x', targetUsername });")).toEqual(["captureError: 'targetUsername' is not a listed key"]);
    expect(faults('captureWarning(\'[x]\', ctx);')).toEqual(['captureWarning: a context that is not an object literal']);
    expect(faults("Sentry.setTag('who', handle);")).toEqual(['a direct Sentry.setTag']);
    expect(faults("logger.warn('[x] failed', e); captureError(e, { scope: 'x', logId: id });")).toEqual([]);
  });
});
