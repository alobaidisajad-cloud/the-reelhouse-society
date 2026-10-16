/**
 * Airplane mode does nothing on iOS (WORKLIST P0.90): a flow that turns it on there goes on with the
 * network up and passes on nothing. So every airplane-mode step in every flow file, in every Maestro
 * flow folder (.maestro/, its keyboard/ and subflows/, and any iOS folder after them), runs inside a
 * block Maestro runs on Android alone. Read as YAML, nested runFlow blocks followed.
 */
import { readFileSync } from 'fs';
import { relative } from 'path';
import { files as universe } from '@/test-utils/universe';

const yaml = require(require.resolve('yaml/package.json').replace(/package\.json$/, 'dist/index.js')) as typeof import('yaml');

const AIRPLANE = ['toggleAirplaneMode', 'setAirplaneMode'];

/** Each airplane-mode step in a flow's commands that would run off Android, by where it stands. */
export function offAndroid(commands: unknown, androidOnly = false, at = 'commands'): string[] {
  if (!Array.isArray(commands)) return [];
  return commands.flatMap((step, i) => {
    const where = `${at}[${i}]`;
    if (typeof step === 'string') return AIRPLANE.includes(step) && !androidOnly ? [`${where}: ${step}`] : [];
    if (!step || typeof step !== 'object') return [];
    return Object.entries(step as Record<string, unknown>).flatMap(([command, body]) => {
      if (AIRPLANE.includes(command)) return androidOnly ? [] : [`${where}: ${command}`];
      if ((command === 'runFlow' || command === 'repeat' || command === 'retry') && body && typeof body === 'object') {
        const b = body as { when?: { platform?: string }; commands?: unknown };
        return offAndroid(b.commands, androidOnly || b.when?.platform === 'Android', `${where}.${command}`);
      }
      return [];
    });
  });
}

const flows = universe('flows').filter((p) => /\.ya?ml$/.test(p) && !p.endsWith('config.yaml'));

it('reads every flow file of every flow folder, not an empty list', () => {
  expect(flows.length).toBeGreaterThanOrEqual(13);
  expect(flows.some((p) => p.includes('subflows'))).toBe(true);
  expect(flows.some((p) => p.includes('keyboard'))).toBe(true);
});

it('runs every airplane-mode step inside a block for Android alone', () => {
  const wrong = flows.flatMap((p) => {
    const docs = yaml.parseAllDocuments(readFileSync(p, 'utf8')).map((d) => d.toJS());
    return docs.flatMap((doc) => offAndroid(doc)).map((w) => `${relative(process.cwd(), p).split('\\').join('/')}: ${w}`);
  });
  expect(wrong).toEqual([]);
});

it('finds such a step at the top, in a runFlow for every platform, and as a map; and none inside an Android block', () => {
  expect(offAndroid(['toggleAirplaneMode'])).toEqual(['commands[0]: toggleAirplaneMode']);
  expect(offAndroid([{ runFlow: { commands: ['toggleAirplaneMode'] } }])).toEqual(['commands[0].runFlow[0]: toggleAirplaneMode']);
  expect(offAndroid([{ runFlow: { when: { platform: 'iOS' }, commands: [{ setAirplaneMode: 'enabled' }] } }])).toEqual(['commands[0].runFlow[0]: setAirplaneMode']);
  expect(offAndroid([{ runFlow: { when: { platform: 'Android' }, commands: ['toggleAirplaneMode', { repeat: { times: 2, commands: ['toggleAirplaneMode'] } }] } }])).toEqual([]);
});
