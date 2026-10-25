/**
 * aContractAsksTheServer.test.ts — a contract's request reaches the server it names.
 *
 * On SDK 57 a test file's global fetch is Expo's, over a native module jest-expo stubs: it answers
 * every request, one to a closed port too, with no status. The contracts that ask the local server
 * (db-integration) failed on answers never sent, and a stub's answer could pass where the server's
 * would not. They ask through contractEnv's houseFetch, Node's own fetch, kept by the test
 * environment before any setup runs. Port 9 is closed: a request that reaches the network fails.
 */
import { houseFetch } from '@/test-utils/contractEnv';

const CLOSED = 'http://127.0.0.1:9/';

it('asks through Node\'s own fetch, which fails at a closed port, never answered', async () => {
  await expect(houseFetch(CLOSED, { headers: { Connection: 'close' } })).rejects.toThrow('fetch failed');
});

it('and not through the global fetch, which answers the closed port with no status', async () => {
  await expect(fetch(CLOSED).then((r) => r.status)).resolves.toBeUndefined();
});
