// ─────────────────────────────────────────────────────────────────────────────
// jest.setup.ts — Global mocks for ReelHouse mobile test suite
// ─────────────────────────────────────────────────────────────────────────────

// Mock AccessibilityInfo (used by stores for announceForAccessibility)
//
// It MUST carry a `default`. React Native's index.js reads this module as
// `require(…/AccessibilityInfo).default` (index.js:153-156), so a mock without
// one makes `import { AccessibilityInfo } from 'react-native'` resolve to
// **undefined** — and every component that announces something throws the
// instant a test renders that path. The same class of gap as the missing
// `ReduceMotion` and `Extrapolation` below: invisible until the first test
// mounts the code that needs it, which for ActivityCard's two announcements had
// never happened. Purely additive; the named exports stay for anyone importing
// the module path directly.
const mockAccessibilityInfo = {
  announceForAccessibility: jest.fn(),
  isReduceMotionEnabled: jest.fn().mockResolvedValue(false),
  addEventListener: jest.fn(() => ({ remove: jest.fn() })),
  isBoldTextEnabled: jest.fn().mockResolvedValue(false),
  isScreenReaderEnabled: jest.fn().mockResolvedValue(false),
};
jest.mock('react-native/Libraries/Components/AccessibilityInfo/AccessibilityInfo', () => ({
  __esModule: true,
  ...mockAccessibilityInfo,
  default: mockAccessibilityInfo,
}));

// Also make it available on the RN mock
const RN = jest.requireActual('react-native');
if (!RN.AccessibilityInfo?.announceForAccessibility) {
  RN.AccessibilityInfo = {
    ...RN.AccessibilityInfo,
    announceForAccessibility: jest.fn(),
    isReduceMotionEnabled: jest.fn().mockResolvedValue(false),
    addEventListener: jest.fn(() => ({ remove: jest.fn() })),
  };
}

// Mock react-native-mmkv (C++ native module not available in Jest)
jest.mock('react-native-mmkv', () => ({
  MMKV: jest.fn(() => ({
    set: jest.fn(),
    getString: jest.fn(() => undefined),
    getNumber: jest.fn(() => undefined),
    getBoolean: jest.fn(() => undefined),
    delete: jest.fn(),
    contains: jest.fn(() => false),
    getAllKeys: jest.fn(() => []),
    clearAll: jest.fn(),
  })),
}));

// Mock mmkv-storage module (used by stores)
const _mockMMKVStore: Record<string, string> = {};
jest.mock('./src/stores/mmkv-storage', () => ({
  storage: {
    set: jest.fn((key: string, value: string) => { _mockMMKVStore[key] = value; }),
    getString: jest.fn((key: string) => _mockMMKVStore[key]),
    getNumber: jest.fn(() => undefined),
    getBoolean: jest.fn(() => undefined),
    delete: jest.fn((key: string) => { delete _mockMMKVStore[key]; }),
    contains: jest.fn((key: string) => key in _mockMMKVStore),
    getAllKeys: jest.fn(() => Object.keys(_mockMMKVStore)),
    clearAll: jest.fn(() => { Object.keys(_mockMMKVStore).forEach(k => delete _mockMMKVStore[k]); }),
  },
  zustandMMKVStorage: {
    getItem: jest.fn((key: string) => _mockMMKVStore[key] ?? null),
    setItem: jest.fn((key: string, value: string) => { _mockMMKVStore[key] = value; }),
    removeItem: jest.fn((key: string) => { delete _mockMMKVStore[key]; }),
  },
  // ── The encryption gate ────────────────────────────────────────────────────
  // Member content is no longer written to disk unless storage is encrypted:
  // the film store persists logs carrying `privateNotes`, and the profile cache
  // carries the member's email. These stand in for the ENCRYPTED case, which is
  // what almost every suite means to exercise; the refusal has its own guard
  // test that drives the real module.
  zustandMMKVStorageSensitive: {
    getItem: jest.fn((key: string) => _mockMMKVStore[key] ?? null),
    setItem: jest.fn((key: string, value: string) => { _mockMMKVStore[key] = value; }),
    removeItem: jest.fn((key: string) => { delete _mockMMKVStore[key]; }),
  },
  setSensitive: jest.fn((key: string, value: string) => { _mockMMKVStore[key] = value; }),
  isStorageEncrypted: jest.fn(() => true),
  createAsyncMMKVStorage: jest.fn(() => ({
    getItem: jest.fn(() => null),
    setItem: jest.fn(),
    removeItem: jest.fn(),
  })),
  getSecureStorage: jest.fn().mockResolvedValue({
    getString: jest.fn(),
    set: jest.fn(),
    delete: jest.fn(),
    contains: jest.fn(() => false),
    clearAll: jest.fn(),
  }),
  initEncryptedStorage: jest.fn().mockResolvedValue(undefined),
}));

// Mock expo-crypto (native module)
jest.mock('expo-crypto', () => ({
  randomUUID: jest.fn(() => 'test-uuid-' + Math.random().toString(36).slice(2, 11)),
}));

// Mock Sentry (native module)
jest.mock('@sentry/react-native', () => ({
  init: jest.fn(),
  captureException: jest.fn(),
  captureMessage: jest.fn(),
  setUser: jest.fn(),
  addBreadcrumb: jest.fn(),
  withScope: jest.fn((cb) => cb({ setExtras: jest.fn(), setLevel: jest.fn() })),
}));

// ─────────────────────────────────────────────────────────────────────────────
// Mock @supabase/supabase-js — prevents "supabaseUrl is required" error
// ─────────────────────────────────────────────────────────────────────────────
const mockSupabaseAuth = {
  getSession: jest.fn().mockResolvedValue({ data: { session: null }, error: null }),
  getUser: jest.fn().mockResolvedValue({ data: { user: null }, error: null }),
  signInWithPassword: jest.fn().mockResolvedValue({ data: { user: null, session: null }, error: null }),
  signUp: jest.fn().mockResolvedValue({ data: { user: null, session: null }, error: null }),
  signOut: jest.fn().mockResolvedValue({ error: null }),
  onAuthStateChange: jest.fn(() => ({ data: { subscription: { unsubscribe: jest.fn() } } })),
  startAutoRefresh: jest.fn(),
  stopAutoRefresh: jest.fn(),
  resetPasswordForEmail: jest.fn().mockResolvedValue({ data: null, error: null }),
  updateUser: jest.fn().mockResolvedValue({ data: { user: null }, error: null }),
};

const mockSupabaseFrom = jest.fn(() => {
  const chainable: Record<string, jest.Mock> = {};
  const self = () => chainable;
  chainable.select = jest.fn().mockImplementation(self);
  chainable.insert = jest.fn().mockImplementation(self);
  chainable.update = jest.fn().mockImplementation(self);
  chainable.upsert = jest.fn().mockImplementation(self);
  chainable.delete = jest.fn().mockImplementation(self);
  chainable.eq = jest.fn().mockImplementation(self);
  chainable.neq = jest.fn().mockImplementation(self);
  chainable.in = jest.fn().mockImplementation(self);
  chainable.is = jest.fn().mockImplementation(self);
  chainable.gt = jest.fn().mockImplementation(self);
  chainable.gte = jest.fn().mockImplementation(self);
  chainable.lt = jest.fn().mockImplementation(self);
  chainable.lte = jest.fn().mockImplementation(self);
  chainable.like = jest.fn().mockImplementation(self);
  chainable.ilike = jest.fn().mockImplementation(self);
  chainable.not = jest.fn().mockImplementation(self);
  chainable.or = jest.fn().mockImplementation(self);
  chainable.order = jest.fn().mockImplementation(self);
  chainable.limit = jest.fn().mockImplementation(self);
  chainable.range = jest.fn().mockImplementation(self);
  chainable.abortSignal = jest.fn().mockImplementation(self);
  chainable.single = jest.fn().mockResolvedValue({ data: null, error: null });
  chainable.maybeSingle = jest.fn().mockResolvedValue({ data: null, error: null });
  chainable.then = jest.fn((cb) => Promise.resolve(cb({ data: [], error: null, count: 0 })));
  return chainable;
});

const mockSupabaseClient = {
  auth: mockSupabaseAuth,
  from: mockSupabaseFrom,
  rpc: jest.fn().mockResolvedValue({ data: null, error: null }),
  storage: {
    from: jest.fn(() => ({
      upload: jest.fn().mockResolvedValue({ data: { path: 'test' }, error: null }),
      getPublicUrl: jest.fn(() => ({ data: { publicUrl: 'https://test.com/image.jpg' } })),
      download: jest.fn().mockResolvedValue({ data: new Blob(), error: null }),
      remove: jest.fn().mockResolvedValue({ data: null, error: null }),
    })),
  },
  channel: jest.fn(() => ({
    on: jest.fn().mockReturnThis(),
    subscribe: jest.fn().mockReturnThis(),
    unsubscribe: jest.fn(),
  })),
  removeChannel: jest.fn(),
  realtime: { disconnect: jest.fn() },
};

jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => mockSupabaseClient),
}));

// ─────────────────────────────────────────────────────────────────────────────
// Mock expo-router — prevents navigation context errors
// ─────────────────────────────────────────────────────────────────────────────
jest.mock('expo-router', () => {
  const React = require('react');
  const { Text } = require('react-native');
  return {
    router: { push: jest.fn(), replace: jest.fn(), back: jest.fn(), navigate: jest.fn() },
    useRouter: jest.fn(() => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn(), navigate: jest.fn() })),
    useLocalSearchParams: jest.fn(() => ({})),
    useGlobalSearchParams: jest.fn(() => ({})),
    useSegments: jest.fn(() => []),
    usePathname: jest.fn(() => '/'),
    useNavigation: jest.fn(() => ({ navigate: jest.fn(), goBack: jest.fn(), setOptions: jest.fn() })),
    Link: ({ children, ...props }: any) => React.createElement(Text, props, children),
    Redirect: ({ href }: any) => React.createElement(Text, { testID: 'redirect' }, `Redirect:${href}`),
    Stack: { Screen: ({ children }: any) => children || null },
    Tabs: { Screen: ({ children }: any) => children || null },
    Slot: () => null,
    useFocusEffect: jest.fn((cb: any) => cb()),
  };
});

// ─────────────────────────────────────────────────────────────────────────────
// Mock expo-secure-store — native module
// ─────────────────────────────────────────────────────────────────────────────
jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn().mockResolvedValue(null),
  setItemAsync: jest.fn().mockResolvedValue(undefined),
  deleteItemAsync: jest.fn().mockResolvedValue(undefined),
}));

// ─────────────────────────────────────────────────────────────────────────────
// Mock expo-haptics — native module
// ─────────────────────────────────────────────────────────────────────────────
jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(),
  notificationAsync: jest.fn(),
  selectionAsync: jest.fn(),
  ImpactFeedbackStyle: { Light: 'light', Medium: 'medium', Heavy: 'heavy' },
  NotificationFeedbackType: { Success: 'success', Warning: 'warning', Error: 'error' },
}));

// ─────────────────────────────────────────────────────────────────────────────
// Mock expo-image — native module
// ─────────────────────────────────────────────────────────────────────────────
jest.mock('expo-image', () => {
  // `Image` has to be BOTH: a component, because plenty of screens render one,
  // and a carrier for the static `prefetch` that list screens call. It used to
  // be only the latter — a plain object — which meant any component showing an
  // image failed to mount with "element type is invalid", and four separate
  // test files had grown their own local copy of this workaround.
  //
  // A host element rather than RN's Image: expo-image takes props RN's does not
  // (contentFit, cachePolicy, recyclingKey, placeholder, transition), and
  // passing those to a real component only produces warnings. As a host element
  // they are simply recorded, so tests can assert on them.
  const React = require('react');
  const Image: React.FC<Record<string, unknown>> & { prefetch: jest.Mock } =
    Object.assign(
      (props: Record<string, unknown>) => React.createElement('ExpoImage', props),
      { prefetch: jest.fn().mockResolvedValue(true) },
    );
  return {
    Image,
    ImageBackground: (props: Record<string, unknown>) =>
      React.createElement('ExpoImageBackground', props),
    prefetch: jest.fn().mockResolvedValue(true),
  };
});

// ─────────────────────────────────────────────────────────────────────────────
// Mock expo-linking — native module
// ─────────────────────────────────────────────────────────────────────────────
jest.mock('expo-linking', () => ({
  createURL: jest.fn((path: string) => `reelhouse://${path}`),
  openURL: jest.fn(),
  canOpenURL: jest.fn().mockResolvedValue(true),
  getInitialURL: jest.fn().mockResolvedValue(null),
  addEventListener: jest.fn(() => ({ remove: jest.fn() })),
}));

// ─────────────────────────────────────────────────────────────────────────────
// Mock @react-native-community/netinfo
// ─────────────────────────────────────────────────────────────────────────────
jest.mock('@react-native-community/netinfo', () => ({
  useNetInfo: jest.fn(() => ({ isConnected: true, isInternetReachable: true, type: 'wifi' })),
  fetch: jest.fn().mockResolvedValue({ isConnected: true, isInternetReachable: true }),
  addEventListener: jest.fn(() => jest.fn()),
  __esModule: true,
  default: {
    fetch: jest.fn().mockResolvedValue({ isConnected: true }),
    addEventListener: jest.fn(() => jest.fn()),
  },
}));

// ─────────────────────────────────────────────────────────────────────────────
// Mock expo-constants
// ─────────────────────────────────────────────────────────────────────────────
jest.mock('expo-constants', () => ({
  expoConfig: { extra: {} },
  Constants: { expoConfig: { extra: {} } },
  __esModule: true,
  default: { expoConfig: { extra: {} } },
}));

// ─────────────────────────────────────────────────────────────────────────────
// Mock react-native-reanimated
// ─────────────────────────────────────────────────────────────────────────────
jest.mock('react-native-reanimated', () => {
  const React = require('react');
  const { View, Text, ScrollView } = require('react-native');

  const animatedComponent = (Component: any) => React.forwardRef((props: any, ref: any) =>
    React.createElement(Component, { ...props, ref })
  );

  return {
    __esModule: true,
    default: {
      View: animatedComponent(View),
      Text: animatedComponent(Text),
      ScrollView: animatedComponent(ScrollView),
      Image: animatedComponent(View),
      FlatList: animatedComponent(View),
      createAnimatedComponent: animatedComponent,
    },
    // STABLE ACROSS RENDERS, because the real one is. This used to return a
    // fresh `{ value }` on every render, which meant any effect listing a
    // shared value in its deps re-ran on EVERY render under test — a loop that
    // cannot happen in the app. It was caught by a deferred fade running twice
    // in a component that starts it exactly once; on the device it is correct.
    // A mock that invents a re-render is worse than no mock: it fails good code
    // and, when an effect's work is idempotent, passes bad code silently.
    useSharedValue: jest.fn((v: any) => {
      const ref: { current: { value: any } | null } = React.useRef(null);
      if (ref.current === null) ref.current = { value: v };
      return ref.current;
    }),
    useAnimatedStyle: jest.fn((fn: any) => fn()),
    useDerivedValue: jest.fn((fn: any) => ({ value: fn() })),
    useAnimatedScrollHandler: jest.fn(() => jest.fn()),
    withTiming: jest.fn((v: any) => v),
    withSpring: jest.fn((v: any) => v),
    withSequence: jest.fn((...args: any[]) => args[0]),
    withRepeat: jest.fn((v: any) => v),
    withDelay: jest.fn((_d: any, v: any) => v),
    // `in`, `out` and the curve names were absent, so any component reaching for
    // the ordinary `Easing.out(Easing.quad)` threw the moment a test rendered
    // it. Purely additive — nothing can depend on these being missing.
    Easing: {
      inOut: jest.fn(() => jest.fn()),
      in: jest.fn(() => jest.fn()),
      out: jest.fn(() => jest.fn()),
      quad: 'quad',
      cubic: 'cubic',
      ease: 'ease',
      linear: 'linear',
      bezier: jest.fn(),
    },
    // CHAINABLE, because the real builders are. Every modifier on a reanimated
    // entering/exiting builder returns the builder, so they compose in any
    // order and any number. These were hand-listed one modifier at a time, so
    // a component reaching for one nobody had needed yet — .easing() on a
    // Fade — threw the moment a test rendered it. The only reason that was
    // survivable is that the component using it had never been mounted.
    //
    // The MODIFIERS were made chainable after being hand-listed. The BUILDER
    // NAMES stayed a hand list, which is the same lesson one level up, and it
    // bit exactly as you would expect: `FadeInRight` was not on it, so
    // CinematicInsights — a component that has been in the app for months —
    // could not be rendered by a test at all. `FadeInRight.delay is undefined`
    // reads like a broken component, so the natural response is to stop writing
    // the test rather than to fix the harness.
    //
    // Reanimated's builders follow a closed naming scheme, so generate it.
    // Names the real library lacks are harmless here — a mock that offers an
    // unused builder costs nothing, while a missing one silently costs a test.
    // `tsc` is what catches a genuinely wrong import name.
    ...Object.fromEntries((() => {
      const names = ['Layout', 'LinearTransition', 'CurvedTransition', 'FadingTransition',
        'SequencedTransition', 'JumpingTransition', 'EntryExitTransition'];
      for (const family of ['Fade', 'Slide', 'Zoom', 'Bounce', 'Flip', 'Light',
        'Pinwheel', 'Roll', 'Rotate', 'Stretch']) {
        for (const dir of ['In', 'Out']) {
          for (const edge of ['', 'Up', 'Down', 'Left', 'Right']) {
            names.push(`${family}${dir}${edge}`);
          }
        }
      }
      return names.map(name => {
        const builder: any = new Proxy({}, { get: () => jest.fn(() => builder) });
        return [name, builder];
      });
    })()),
    cancelAnimation: jest.fn(),
    // scrollBridge.ts calls makeMutable(0) at MODULE load, so without this any
    // test that so much as imports TopNavBar threw before rendering a line.
    // That is why the nav bar had no test at all. Purely additive.
    makeMutable: jest.fn((v: any) => ({ value: v })),
    runOnJS: jest.fn((fn: any) => fn),
    runOnUI: jest.fn((fn: any) => fn),
    interpolate: jest.fn((v: any) => v),
    Extrapolate: { CLAMP: 'clamp', EXTEND: 'extend' },
    // `Extrapolation` is the current name; `Extrapolate` is the deprecated one.
    // Only the old name was here, so a component using the current API would
    // throw on `Extrapolation.CLAMP` the moment a test rendered it — the same
    // trap that made TopNavBar untestable via makeMutable. Purely additive.
    Extrapolation: { CLAMP: 'clamp', EXTEND: 'extend', IDENTITY: 'identity' },
    // Same class of gap as Extrapolation above: real components pass
    // `reduceMotion: ReduceMotion.System` to withTiming, and an undefined enum
    // throws the instant a test renders one — which is exactly how this was
    // found. SocietySeal, the auth chrome and the verdict all rely on it.
    ReduceMotion: { System: 'system', Always: 'always', Never: 'never' },
    createAnimatedComponent: animatedComponent,
    useAnimatedRef: jest.fn(() => ({ current: null })),
    measure: jest.fn(() => ({ x: 0, y: 0, width: 0, height: 0, pageX: 0, pageY: 0 })),
    scrollTo: jest.fn(),
    useReducedMotion: jest.fn(() => false),
    useAnimatedKeyboard: jest.fn(() => ({ height: { value: 0 }, state: { value: 0 } })),
    useAnimatedProps: jest.fn((fn: any) => fn()),
    useAnimatedReaction: jest.fn(),
    withDecay: jest.fn((_c: any, cb?: any) => { if (cb) cb(true); return 0; }),
  };
});

// ─────────────────────────────────────────────────────────────────────────────
// Mock dynamic imports in films store (prevents module load errors in Jest)
// ─────────────────────────────────────────────────────────────────────────────

// Mock react-native-url-polyfill (imported by supabase.ts)
jest.mock('react-native-url-polyfill/auto', () => ({}));

// Mock imagePrefetcher and tmdb (used by films store onRehydrateStorage)
jest.mock('./src/utils/imagePrefetcher', () => ({
  ImagePrefetcher: {
    preloadFilmBatch: jest.fn(),
    prefetchImage: jest.fn(),
  },
}));
// The same hand-list problem as the reanimated builders above: this mock had
// two of the real module's SIX pure URL builders, so a component reaching for
// `tmdb.profile()` — the one that draws the faces in CinematicInsights — died
// with "tmdb.profile is not a function" the moment a test rendered it. The URL
// builders are pure string functions, so the mock implements them for real
// rather than stubbing them; tmdbMockCoverage.test.ts re-derives the set the
// app calls and fails if this falls behind again.
jest.mock('./src/lib/tmdb', () => {
  const IMG = 'https://image.tmdb.org/t/p';
  return {
    tmdb: {
      // Each stub resolves to the SAME fallback the real module returns when a
      // request fails, so a component rendered here behaves exactly as it does
      // when TMDB is unreachable — a defined state the app already handles,
      // rather than a shape invented for the test.
      trending: jest.fn().mockResolvedValue({ results: [] }),
      search: jest.fn().mockResolvedValue({ results: [] }),
      movie: jest.fn().mockResolvedValue({}),
      canon: jest.fn().mockResolvedValue({ results: [] }),
      discover: jest.fn().mockResolvedValue({ results: [] }),
      detail: jest.fn().mockResolvedValue(null),
      person: jest.fn().mockResolvedValue(null),
      personCredits: jest.fn().mockResolvedValue(null),
      movieImages: jest.fn().mockResolvedValue({ posters: [], backdrops: [], logos: [] }),
      // Synchronous in the real module — a cache peek, not a request. Returning
      // a promise here would make `peekDetail(id)?.title` a truthy object.
      peekDetail: jest.fn(() => undefined),
      // poster/backdrop return `null` where the real module returns `undefined`.
      // Kept as-is deliberately: tests have been asserting against it for a long
      // time, and both are falsy everywhere the app checks them.
      poster: jest.fn((path: string, size?: string) => path ? `${IMG}/${size || 'w500'}${path}` : null),
      backdrop: jest.fn((path: string, size?: string) => path ? `${IMG}/${size || 'original'}${path}` : null),
      profile: jest.fn((path?: string | null, size = 'w185') => path ? `${IMG}/${size}${path}` : undefined),
      logo: jest.fn((path?: string | null, size = 'w45') => path ? `${IMG}/${size}${path}` : undefined),
      posterThumb: jest.fn((path?: string | null) => path ? `${IMG}/w92${path}` : undefined),
      youtubeThumbnail: jest.fn((key: string) => `https://img.youtube.com/vi/${key}/hqdefault.jpg`),
    },
  };
});

// ─────────────────────────────────────────────────────────────────────────────
// Mock expo-notifications
// ─────────────────────────────────────────────────────────────────────────────
jest.mock('expo-notifications', () => ({
  getPermissionsAsync: jest.fn().mockResolvedValue({ status: 'granted' }),
  requestPermissionsAsync: jest.fn().mockResolvedValue({ status: 'granted' }),
  getExpoPushTokenAsync: jest.fn().mockResolvedValue({ data: 'test-push-token' }),
  setNotificationHandler: jest.fn(),
  addNotificationReceivedListener: jest.fn(() => ({ remove: jest.fn() })),
  addNotificationResponseReceivedListener: jest.fn(() => ({ remove: jest.fn() })),
  scheduleNotificationAsync: jest.fn(),
  AndroidImportance: { MAX: 5, HIGH: 4, DEFAULT: 3, LOW: 2, MIN: 1 },
}));

// ─────────────────────────────────────────────────────────────────────────────
// Mock react-native-safe-area-context
// ─────────────────────────────────────────────────────────────────────────────
jest.mock('react-native-safe-area-context', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    SafeAreaProvider: ({ children }: any) => React.createElement(View, null, children),
    SafeAreaView: ({ children, ...props }: any) => React.createElement(View, props, children),
    useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
    useSafeAreaFrame: () => ({ x: 0, y: 0, width: 375, height: 812 }),
  };
});

// ─────────────────────────────────────────────────────────────────────────────
// Silence console.warn for tests (noisy reanimated/navigation warnings)
// ─────────────────────────────────────────────────────────────────────────────
const originalWarn = console.warn;
console.warn = (...args: any[]) => {
  const msg = typeof args[0] === 'string' ? args[0] : '';
  if (
    msg.includes('[Reanimated]') ||
    msg.includes('Animated:') ||
    msg.includes('[react-native-gesture-handler]')
  ) return;
  originalWarn(...args);
};
