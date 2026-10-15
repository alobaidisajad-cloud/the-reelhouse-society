/**
 * prefetchPictures.test.ts — on Android a picture is fetched ahead to disk only
 * (no decode, with the expo-image patch); on iOS one already on disk is not
 * downloaded again.
 */
import { Image } from 'expo-image';
import { Platform } from 'react-native';
import { prefetchPictures } from '../prefetchPictures';

const prefetch = Image.prefetch as jest.Mock;
const cachePath = Image.getCachePathAsync as jest.Mock;
const realOS = Platform.OS;
const on = (os: typeof Platform.OS) => Object.defineProperty(Platform, 'OS', { get: () => os, configurable: true });

beforeEach(() => {
  prefetch.mockReset().mockResolvedValue(true);
  cachePath.mockReset();
});
afterEach(() => { on(realOS); });

describe('on Android', () => {
  beforeEach(() => { on('android'); });

  it('fetches every picture to disk only, the policy the patch downloads without decoding', async () => {
    await prefetchPictures(['https://img/a.jpg', 'https://img/b.jpg']);
    expect(prefetch.mock.calls).toEqual([[['https://img/a.jpg', 'https://img/b.jpg'], 'disk']]);
  });

  it('does not ask the cache first: the download-only prefetch finds a cached file itself', async () => {
    await prefetchPictures(['https://img/a.jpg']);
    expect(cachePath).not.toHaveBeenCalled();
  });
});

describe('on iOS', () => {
  beforeEach(() => { on('ios'); });

  it('leaves out a picture already on disk and fetches one that is not', async () => {
    cachePath.mockImplementation(async (url) => (url === 'https://img/kept.jpg' ? '/cache/kept' : null));
    await prefetchPictures(['https://img/kept.jpg', 'https://img/new.jpg']);
    expect(cachePath.mock.calls).toEqual([['https://img/kept.jpg'], ['https://img/new.jpg']]);
    expect(prefetch.mock.calls).toEqual([[['https://img/new.jpg'], 'disk']]);
  });

  it('fetches nothing when every picture is on disk already', async () => {
    cachePath.mockResolvedValue('/cache/kept');
    await prefetchPictures(['https://img/a.jpg', 'https://img/b.jpg']);
    expect(prefetch).not.toHaveBeenCalled();
  });

  it('fetches a picture whose cache could not be read, rather than skip it', async () => {
    cachePath.mockRejectedValue(new Error('cache unreadable'));
    await prefetchPictures(['https://img/a.jpg']);
    expect(prefetch.mock.calls).toEqual([[['https://img/a.jpg'], 'disk']]);
  });
});

it('never throws: a prefetch that fails leaves the screen to fetch its own pictures', async () => {
  on('android');
  prefetch.mockRejectedValue(new Error('offline'));
  await expect(prefetchPictures(['https://img/a.jpg'])).resolves.toBeUndefined();
});
