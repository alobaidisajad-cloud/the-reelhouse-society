// ─────────────────────────────────────────────────────────────────────────────
// jest.setup.ts — Global mocks for ReelHouse mobile test suite
// ─────────────────────────────────────────────────────────────────────────────

// The app's Supabase URL and key are deliberately NOT set here: `src/lib/supabase.ts`
// falls back to a dummy host, which is what keeps a test that builds a real client
// off PRODUCTION. The one test that needs credentials reads them itself
// (loungeEmbeds.contract.test.ts).

// AccessibilityInfo, WITH a `default`: React Native's own index reads this module's
// default, so without one `AccessibilityInfo` from 'react-native' is undefined.
const mockAccessibilityInfo = {
  announceForAccessibility: jest.fn(),
  isReduceMotionEnabled: jest.fn().mockResolvedValue(false),
  addEventListener: jest.fn(() => ({ remove: jest.fn() })),
  isBoldTextEnabled: jest.fn().mockResolvedValue(false),
  isScreenReaderEnabled: jest.fn().mockResolvedValue(false),
  // An action toast moves VoiceOver focus onto its message (ToastHost).
  sendAccessibilityEvent: jest.fn(),
  setAccessibilityFocus: jest.fn(),
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

// ── FlashList, rendered SYNCHRONOUSLY ───────────────────────────────────────
// The real one measures a tick after mount (an act() warning in every suite) and
// lays nothing out in the test renderer, so its rows are drawn straight through:
// a test can assert on what a list was asked to draw. Every prop reaches the host,
// as suites assert on what the list RECEIVED; the ref's scroll methods are no-ops.
// The host is a ScrollView, as FlashList is one (a plain View shrinks its rows).
jest.mock('@shopify/flash-list', () => {
  const RNActual = jest.requireActual('react-native');
  const ReactActual = jest.requireActual('react');

  const FlashList = ReactActual.forwardRef((props: Record<string, unknown>, ref: unknown) => {
    const {
      data, renderItem, ListHeaderComponent, ListFooterComponent, ListEmptyComponent,
      keyExtractor, ...rest
    } = props as Record<string, (...a: unknown[]) => unknown> & Record<string, unknown>;

    ReactActual.useImperativeHandle(ref, () => ({
      scrollToOffset: () => {}, scrollToIndex: () => {}, scrollToItem: () => {},
      scrollToEnd: () => {}, prepareForLayoutAnimationRender: () => {},
      recordInteraction: () => {}, getScrollableNode: () => null,
    }));

    const node = (C: unknown) =>
      typeof C === 'function' ? ReactActual.createElement(C as never) : (C ?? null);

    const rows = Array.isArray(data) ? data : [];
    // The separator goes BETWEEN rows, as FlashList draws it.
    const Separator = (rest as { ItemSeparatorComponent?: unknown }).ItemSeparatorComponent;
    const body = rows.length === 0
      ? node(ListEmptyComponent)
      : rows.flatMap((item: unknown, index: number) => {
          const key = typeof keyExtractor === 'function' ? keyExtractor(item, index) : String(index);
          const row = ReactActual.createElement(
            RNActual.View,
            { key },
            typeof renderItem === 'function' ? renderItem({ item, index, target: 'Cell' }) : null,
          );
          return Separator && index < rows.length - 1
            ? [row, ReactActual.createElement(Separator as never, { key: `${key}-separator` })]
            : [row];
        });

    return ReactActual.createElement(
      RNActual.ScrollView,
      { ...rest, data, testID: (rest as { testID?: string }).testID },
      node(ListHeaderComponent),
      body,
      node(ListFooterComponent),
    );
  });
  FlashList.displayName = 'FlashList';
  return { __esModule: true, FlashList, default: FlashList };
});

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
  // Member content reaches disk only when storage is encrypted: these stand in for
  // that case; the refusal has its own guard test, on the real module.
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

// expo-crypto: a REAL uuid (payload schemas demand one, and a fake one refuses a
// write for a reason the app never has), sequential so two are never equal.
jest.mock('expo-crypto', () => {
  let seq = 0;
  return {
    randomUUID: jest.fn(
      () => `00000000-0000-4000-8000-${(++seq).toString(16).padStart(12, '0')}`,
    ),
  };
});

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
    // An effect WITH its cleanup, as the real hook is; a memoised callback runs once.
    useFocusEffect: (cb: any) => React.useEffect(cb, [cb]),
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
  // `Image` is BOTH a component and the carrier of the static `prefetch`; a host
  // element (not RN's Image), so expo-image's own props are recorded, not warned on.
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
// Mock @shopify/react-native-skia — native module, shipped as untranspiled ESM
// ─────────────────────────────────────────────────────────────────────────────
// The room's light blooms a hero's artwork through Skia, and every screen that
// hangs a photograph at its top mounts it. Without this, importing any such
// screen fails to parse. Each drawing element becomes a host element that
// records its props and renders its children, so a tree can still be asserted
// on; `useImage` resolves nothing, as an image that has not loaded yet would,
// so the bloom's own wrapper (which carries the recipe) is what a test sees.
jest.mock('@shopify/react-native-skia', () => {
  const React = require('react');
  const host = (name: string) => (props: Record<string, unknown>) =>
    React.createElement(`Skia${name}`, props, props.children as never);
  const names = ['Canvas', 'Group', 'Paint', 'Blur', 'ColorMatrix', 'Mask', 'Image', 'Rect',
    'LinearGradient', 'RadialGradient', 'RuntimeShader', 'Fill', 'Shader'];
  return {
    ...Object.fromEntries(names.map((n) => [n, host(n)])),
    useImage: () => null,
    vec: (x: number, y: number) => ({ x, y }),
    Skia: {
      RuntimeEffect: { Make: () => ({}) },
      // A picture still on its way: the shared loader waits, and nothing that
      // waits on it is drawn — exactly the state before an image arrives.
      Data: { fromURI: () => new Promise(() => {}) },
      Image: { MakeImageFromEncoded: () => null },
    },
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
    // STABLE across renders, as the real one is: a fresh one each render re-runs
    // every effect that lists it, a loop the app cannot have.
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
    // Every entering/exiting builder, GENERATED from Reanimated's closed naming scheme
    // (a hand list always misses one), each modifier chainable as the real ones are.
    // An extra name costs nothing; tsc catches a wrong import.
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
    // scrollBridge.ts calls makeMutable(0) at module load.
    makeMutable: jest.fn((v: any) => ({ value: v })),
    runOnJS: jest.fn((fn: any) => fn),
    runOnUI: jest.fn((fn: any) => fn),
    // The real piecewise linear map (a stub returning its input draws an opaque
    // backdrop at opacity 0). `extend` is the default; `clamp`, `identity` honoured.
    interpolate: jest.fn((v: any, input?: any, output?: any, extrapolate?: any) => {
      if (!Array.isArray(input) || !Array.isArray(output)) return v;
      const n = Math.min(input.length, output.length);
      if (n < 2 || typeof v !== 'number') return v;
      const mode = typeof extrapolate === 'string' ? extrapolate : extrapolate?.extrapolateLeft ?? 'extend';
      const seg = (i: number) => {
        const span = input[i + 1] - input[i];
        const t = span === 0 ? 0 : (v - input[i]) / span;
        return output[i] + t * (output[i + 1] - output[i]);
      };
      if (mode === 'identity') return v;
      if (v <= input[0]) return mode === 'clamp' ? output[0] : seg(0);
      if (v >= input[n - 1]) return mode === 'clamp' ? output[n - 1] : seg(n - 2);
      for (let i = 0; i < n - 1; i++) if (v <= input[i + 1]) return seg(i);
      return output[n - 1];
    }),
    Extrapolate: { CLAMP: 'clamp', EXTEND: 'extend' },
    // `Extrapolation` is the current name; `Extrapolate` the deprecated one.
    Extrapolation: { CLAMP: 'clamp', EXTEND: 'extend', IDENTITY: 'identity' },
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
// The URL builders are pure, so implemented for real; tmdbMockCoverage.test.ts
// fails if the set the app calls outgrows this mock.
jest.mock('./src/lib/tmdb', () => {
  const IMG = 'https://image.tmdb.org/t/p';
  return {
    tmdb: {
      // Each resolves to the real module's own failure fallback: TMDB unreachable.
      trending: jest.fn().mockResolvedValue({ results: [] }),
      search: jest.fn().mockResolvedValue({ results: [] }),
      movie: jest.fn().mockResolvedValue({}),
      canon: jest.fn().mockResolvedValue({ results: [] }),
      discover: jest.fn().mockResolvedValue({ results: [] }),
      detail: jest.fn().mockResolvedValue(null),
      person: jest.fn().mockResolvedValue(null),
      personCredits: jest.fn().mockResolvedValue(null),
      movieImages: jest.fn().mockResolvedValue({ posters: [], backdrops: [], logos: [] }),
      // Synchronous, as the real cache peek is (a promise would be a truthy object).
      peekDetail: jest.fn(() => undefined),
      // null where the real module gives undefined: tests assert it, and the app
      // only ever tests either for falsiness.
      poster: jest.fn((path: string, size?: string) => path ? `${IMG}/${size || 'w500'}${path}` : null),
      backdrop: jest.fn((path: string, size?: string) => path ? `${IMG}/${size || 'original'}${path}` : null),
      profile: jest.fn((path?: string | null, size = 'w185') => path ? `${IMG}/${size}${path}` : undefined),
      logo: jest.fn((path?: string | null, size = 'w45') => path ? `${IMG}/${size}${path}` : undefined),
      posterThumb: jest.fn((path?: string | null) => path ? `${IMG}/w92${path}` : undefined),
      youtubeThumbnail: jest.fn((key: string) => `https://img.youtube.com/vi/${key}/hqdefault.jpg`),
    },

    // The module's pure formatters, implemented for real: a stub would print
    // "undefined" into a page and let a test call it correct.
    formatRuntime: (minutes?: number | null) => {
      if (!minutes) return '—';
      const h = Math.floor(minutes / 60);
      const m = minutes % 60;
      return h ? `${h}h ${m}m` : `${m}m`;
    },
    getYear: (dateStr?: string | null) => (dateStr ? String(dateStr).slice(0, 4) : ''),
    obscurityScore: (movie: { popularity?: number }) => {
      const pop = movie?.popularity || 0;
      if (pop <= 0) return 99;
      const score = Math.round(100 - (Math.log10(Math.max(pop, 1)) / Math.log10(5000)) * 98);
      return Math.max(2, Math.min(99, score));
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
// The provider is `flex: 1`, as the real one is (a bare View collapses its screen).
jest.mock('react-native-safe-area-context', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    SafeAreaProvider: ({ children, style }: any) => React.createElement(View, { style: [{ flex: 1 }, style] }, children),
    SafeAreaView: ({ children, ...props }: any) => React.createElement(View, props, children),
    useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
    useSafeAreaFrame: () => ({ x: 0, y: 0, width: 375, height: 812 }),
  };
});

// ── ORDINARY TYPE: jest-expo reports `fontScale: 2`; a test that wants a larger
// scale sets it. (Required here: this file registers its mocks first.)
const { Dimensions: RNDimensions } = require('react-native');
const realDimensionsGet = RNDimensions.get.bind(RNDimensions);
jest.spyOn(RNDimensions, 'get').mockImplementation((...args: unknown[]) => ({
  ...realDimensionsGet(args[0] as 'window' | 'screen'),
  // A capture run lays tests out on a phone (devices.json), not jest-expo's tablet.
  ...(process.env.MOCKUPS_CAPTURE ? require('./mockups/paths').PHONE : null),
  fontScale: 1,
}));

// Drawing runs only: each control and text records WHERE it was written
// (mockups/srcMark.ts), so a layout finding names its source line.
if (process.env.MOCKUPS_CAPTURE || process.env.MOCKUPS) {
  // React keeps those stacks for 10,000 elements a second, which tests outrun:
  // the count is pinned at zero, a cost only drawing runs pay.
  const internals = (require('react') as Record<string, Record<string, unknown>>)
    .__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE;
  if (internals && 'recentlyCreatedOwnerStacks' in internals) {
    Object.defineProperty(internals, 'recentlyCreatedOwnerStacks', { get: () => 0, set: () => {}, configurable: true });
  }
  jest.mock('@/src/components/PressableScale', () => ({
    __esModule: true,
    default: require('./mockups/srcMark').markSource(
      jest.requireActual('@/src/components/PressableScale').default, /PressableScale\.tsx$/, 'PressableScale'),
  }));
  jest.mock('@/src/components/text', () => {
    const actual = jest.requireActual('@/src/components/text');
    return {
      ...actual,
      Text: require('./mockups/srcMark').markSource(actual.Text, /components[\\/]text[\\/]index\.tsx$/, 'Text'),
    };
  });
}

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
  noteIfMockGap(args);
  originalWarn(...args);
};

// ── A MOCK MISSING A PIECE MUST NOT PASS QUIETLY (see noteIfMockGap) ──────────
const MOCK_GAP =
  /\b(?:is not a function|is not a constructor|is not iterable|is not defined)\b|Cannot read propert(?:y|ies) .*of (?:undefined|null)|undefined is not an object/;
(globalThis as Record<string, unknown>).__mockGaps = [] as string[];

/**
 * A test's own mock replaces this file's, and a shorter one throws "X is not a
 * function" inside a store's try/catch: the suite passes having tested nothing.
 * Every phrasing of that in a warn or error is RECORDED (a setupFiles entry has
 * no beforeEach) and fails its test in jest.afterEnv.ts. The suite has none.
 */
function noteIfMockGap(args: any[]): void {
  const text = args
    .map((a) => (a instanceof Error ? a.message : typeof a === 'string' ? a : ''))
    .join(' ');
  if (MOCK_GAP.test(text)) {
    ((globalThis as Record<string, unknown>).__mockGaps as string[]).push(text.trim());
  }
}

const originalError = console.error;
console.error = (...args: any[]) => {
  noteIfMockGap(args);
  originalError(...args);
};
