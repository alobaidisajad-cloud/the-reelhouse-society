/**
 * EVERY PASSWORD FIELD SAYS WHAT IT HOLDS — the finder, as a test (P4.37).
 *
 * A field the phone is not told about is one it cannot fill: the new password on the reset page
 * was offered no strong password and saved nowhere, Settings' current password was not filled,
 * and the deletion code had to be copied out of the email by hand. So every TextInput with
 * secureTextEntry names its content (textContentType) and its autofill (autoComplete), and every
 * code field (a number pad its label calls a code) carries the one-time-code pair. Read from
 * each file's syntax tree.
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import ts from 'typescript';
import { files, rel } from '@/test-utils/universe';

const ROOT = join(__dirname, '..', '..', '..');

type Field = { line: number; secure: boolean; code: boolean; content: string | null; autofill: string | null };

/** Every TextInput in a file, with what it is and what it tells the phone. */
export function fieldsIn(file: string, text: string): Field[] {
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const out: Field[] = [];
  const visit = (n: ts.Node) => {
    if ((ts.isJsxSelfClosingElement(n) || ts.isJsxOpeningElement(n)) && n.tagName.getText(sf) === 'TextInput') {
      const attr = (name: string) => n.attributes.properties.find((a) => ts.isJsxAttribute(a) && a.name.getText(sf) === name) as ts.JsxAttribute | undefined;
      const words = (name: string): string | null => {
        const a = attr(name);
        if (!a) return null;
        if (!a.initializer) return 'true';
        return ts.isStringLiteral(a.initializer) ? a.initializer.text : a.initializer.getText(sf);
      };
      out.push({
        line: sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1,
        secure: !!attr('secureTextEntry'),
        // A number pad its label calls a code, or a field that names itself one (half the pair is not enough).
        code: (words('keyboardType') === 'number-pad' && /code/i.test(words('accessibilityLabel') ?? ''))
          || words('textContentType') === 'oneTimeCode' || words('autoComplete') === 'one-time-code',
        content: words('textContentType'),
        autofill: words('autoComplete'),
      });
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return out;
}

/** What is wrong with a field, or null. */
const fault = (f: Field) =>
  f.secure && (!f.content || !f.autofill) ? 'a password field without textContentType and autoComplete'
    : f.code && (f.content !== 'oneTimeCode' || f.autofill !== 'one-time-code') ? 'a code field without the one-time-code pair'
      : null;

const all = files('appCode', { ext: ['.tsx'] }).map(rel)
  .flatMap((f) => fieldsIn(f, readFileSync(join(ROOT, f), 'utf8')).map((field) => ({ f, field })));

describe('every password and code field says what it holds', () => {
  it('found them (the scan has not gone blind)', () => {
    expect(all.filter(({ field }) => field.secure).length).toBeGreaterThanOrEqual(6);
    expect(all.filter(({ field }) => field.code).length).toBeGreaterThanOrEqual(2);
  });

  it('every one tells the phone what it holds', () => {
    expect(all.filter(({ field }) => fault(field)).map(({ f, field }) => `${f}:${field.line} ${fault(field)}`)).toEqual([]);
  });

  it('says NO to a field that keeps quiet, and passes one that tells', () => {
    const one = (src: string) => fieldsIn('probe.tsx', src).map(fault);
    expect(one('<TextInput secureTextEntry />')).toEqual(['a password field without textContentType and autoComplete']);
    expect(one('<TextInput secureTextEntry={!shown} textContentType="password" />')).toEqual(['a password field without textContentType and autoComplete']);
    expect(one('<TextInput secureTextEntry textContentType="newPassword" autoComplete="new-password" />')).toEqual([null]);
    expect(one('<TextInput keyboardType="number-pad" accessibilityLabel="Six digit security code" />')).toEqual(['a code field without the one-time-code pair']);
    expect(one('<TextInput keyboardType="number-pad" accessibilityLabel="Released after" />')).toEqual([null]);
    expect(one('<TextInput textContentType="oneTimeCode" accessibilityLabel={label} />')).toEqual(['a code field without the one-time-code pair']);
  });
});
