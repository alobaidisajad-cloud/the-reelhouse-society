/**
 * theBackupMarkerIsWrittenOnce.test.ts — the E2E build's backup marker (src/utils/e2eBackupMarker.ts):
 * written into the app's own files when it is not there, left as it is when it is (a restore put it
 * back), asked once a launch, its failure traced; and nothing at all in any other build.
 */
const mockTrace = jest.fn();
let mockE2E = true;
jest.mock('@/src/utils/e2eTrace', () => ({
  get E2E_BUILD() { return mockE2E; },
  e2eTrace: (...a: unknown[]) => mockTrace(...a),
}));
const mockFs = { documentDirectory: 'file:///data/user/0/app/files/', getInfoAsync: jest.fn(), writeAsStringAsync: jest.fn() };
jest.mock('expo-file-system/legacy', () => mockFs);

/** A fresh copy of the module: its once-a-launch flag is the launch's. */
const fresh = () => {
  let m: typeof import('../e2eBackupMarker') | undefined;
  jest.isolateModules(() => { m = require('../e2eBackupMarker'); });
  if (!m) throw new Error('the module did not load');
  return m;
};

beforeEach(() => {
  mockTrace.mockReset(); mockFs.getInfoAsync.mockReset(); mockFs.writeAsStringAsync.mockReset(); mockE2E = true;
});

it('writes the marker into the app\'s own files when it is not there, once a launch', async () => {
  mockFs.getInfoAsync.mockResolvedValue({ exists: false });
  const m = fresh();
  await m.writeBackupMarkerOnce();
  await m.writeBackupMarkerOnce();
  expect(mockFs.writeAsStringAsync.mock.calls).toEqual([['file:///data/user/0/app/files/e2e-backup-marker', 'The house remembers its own.']]);
  expect(mockTrace.mock.calls).toEqual([['backup.marker', { there: false, written: true }]]);
});

it('leaves a marker a restore put back as it is, and says it was there', async () => {
  mockFs.getInfoAsync.mockResolvedValue({ exists: true });
  await fresh().writeBackupMarkerOnce();
  expect(mockFs.writeAsStringAsync).not.toHaveBeenCalled();
  expect(mockTrace.mock.calls).toEqual([['backup.marker', { there: true, written: false }]]);
});

it('traces a marker it could not write, by why', async () => {
  mockFs.getInfoAsync.mockResolvedValue({ exists: false });
  mockFs.writeAsStringAsync.mockRejectedValue(new Error('disk full'));
  await fresh().writeBackupMarkerOnce();
  expect(mockTrace.mock.calls).toEqual([['backup.marker', { written: false, why: 'disk full' }]]);
});

it('writes nothing, and asks nothing, in any other build', async () => {
  mockE2E = false;
  await fresh().writeBackupMarkerOnce();
  expect([mockFs.getInfoAsync.mock.calls.length, mockFs.writeAsStringAsync.mock.calls.length, mockTrace.mock.calls.length]).toEqual([0, 0, 0]);
});
