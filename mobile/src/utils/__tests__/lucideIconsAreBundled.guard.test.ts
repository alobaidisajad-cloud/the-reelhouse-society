/**
 * The phone bundle carries only the icons listed in src/generated/lucideIcons.js
 * (metro.config.js), while these tests import the whole package. So an icon
 * imported but not listed passes every test here and draws nothing on a phone.
 * This reads the list against the source, and every listed file against disk.
 */
import * as fs from 'fs';
import * as path from 'path';

const { render, OUT } = require('../../../scripts/lucide-icons.js');

describe('the icons the phone bundle carries', () => {
  it('are exactly the icons the source imports', () => {
    const have = fs.readFileSync(OUT, 'utf8').split('\r\n').join('\n');
    expect(have).toBe(render()); // if not: npm run icons
  });

  it('each point at an icon module that exists', () => {
    const listed = [...fs.readFileSync(OUT, 'utf8').matchAll(/from '([^']+)'/g)].map((m) => m[1]);
    expect(listed.length).toBeGreaterThan(100);
    const missing = listed.filter((rel) => !fs.existsSync(path.resolve(path.dirname(OUT), rel)));
    expect(missing).toEqual([]);
  });
});
