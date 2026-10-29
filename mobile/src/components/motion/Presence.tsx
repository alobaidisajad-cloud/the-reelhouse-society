/**
 * Presence — a view that plays its own exit, and is removed by React only once it has left.
 *
 * Reanimated's `exiting` withholds a removal React has already made: the view, and every
 * ancestor React removed with it, stay on the screen until the exit ends. On Android, React
 * can delete and re-create such a view under the same tag; it stays mounted with no view
 * state, and the next view added into it destroys React (exitingIsNeverUsed.guard.test.ts).
 *
 * Here nothing is withheld. `<Presence>` keeps a child React has dropped, by key, until every
 * `<PresenceView>` inside it has played its exit, then lets it go. A removed child steps out
 * of the layout at the frame it last had, so what follows it moves up at once and it leaves
 * over it, as the presets do. The motions are Reanimated's own presets, by name, with the same
 * distances, the same default duration and curve, and the system's reduced motion honoured:
 * under it there is no motion, and a leaving view is removed at once.
 */
import React, {
  createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useReducer, useRef, useState,
} from 'react';
import type { LayoutChangeEvent, LayoutRectangle, StyleProp, ViewProps, ViewStyle } from 'react-native';
import Animated, { cancelAnimation, ReduceMotion, runOnJS, useAnimatedStyle, useSharedValue, withDelay, withTiming, type AnimatedStyle, type SharedValue, type WithTimingConfig } from 'react-native-reanimated';
import { useReduceMotion } from '@/src/hooks/useReduceMotion';
import { useSafeAreaFrame } from 'react-native-safe-area-context';
import { ARRIVAL_GRACE_MS, ARRIVAL_RISE } from '@/src/hooks/useArrival';
import { e2eTrace } from '@/src/utils/e2eTrace';

/** Reanimated's duration for a preset given none. */
export const PRESET_MS = 300;

/** The entrances, named as Reanimated names them. */
export type Entrance = 'FadeIn' | 'FadeInUp' | 'FadeInDown' | 'SlideInDown';
/** The exits, named as Reanimated names them. */
export type Exit = 'FadeOut' | 'FadeOutUp' | 'FadeOutDown' | 'SlideOutDown' | 'SlideOutRight';

export interface Motion<Kind> {
  kind: Kind;
  /** PRESET_MS when none is given. */
  duration?: number;
  delay?: number;
  /** None: withTiming's own default, as a preset given none. */
  easing?: WithTimingConfig['easing'];
}

type Pose = { opacity: number; x: number; y: number };
const REST: Pose = { opacity: 1, x: 0, y: 0 };

/** REST as plain styles, for the properties its motion animates: what an arrived view is drawn with. */
const AT_REST = {
  fade: { opacity: 1 },
  move: { transform: [{ translateX: 0 }, { translateY: 0 }] },
  both: { opacity: 1, transform: [{ translateX: 0 }, { translateY: 0 }] },
} as const;
export const restingStyle = (fading: boolean, moving: boolean) =>
  (fading && moving ? AT_REST.both : moving ? AT_REST.move : fading ? AT_REST.fade : null);

/** Where an entrance starts. `screenH` is the root's height, as Reanimated's window is. */
function entranceFrom(kind: Entrance, screenH: number): Pose {
  switch (kind) {
    case 'FadeIn': return { opacity: 0, x: 0, y: 0 };
    case 'FadeInUp': return { opacity: 0, x: 0, y: -ARRIVAL_RISE };
    case 'FadeInDown': return { opacity: 0, x: 0, y: ARRIVAL_RISE };
    case 'SlideInDown': return { opacity: 1, x: 0, y: screenH };
  }
}

/** Where an exit ends, from the frame it left at (origin in its parent, as the presets read). */
function exitTo(kind: Exit, at: LayoutRectangle, screen: { width: number; height: number }): Pose {
  switch (kind) {
    case 'FadeOut': return { opacity: 0, x: 0, y: 0 };
    case 'FadeOutUp': return { opacity: 0, x: 0, y: -ARRIVAL_RISE };
    case 'FadeOutDown': return { opacity: 0, x: 0, y: ARRIVAL_RISE };
    case 'SlideOutDown': return { opacity: 1, x: 0, y: Math.max(at.y + screen.height, screen.height) - at.y };
    case 'SlideOutRight': return { opacity: 1, x: Math.max(at.x + screen.width, screen.width) - at.x, y: 0 };
  }
}

const fades = (kind?: string) => !!kind && kind.startsWith('Fade');
const moves = (kind?: string) => !!kind && kind !== 'FadeIn' && kind !== 'FadeOut';

/** One channel's timing as a preset runs it; configs literal (animationConfigsAreLiterals). */
function timing(to: number, m: Motion<string>, done?: (finished?: boolean) => void) {
  const duration = m.duration ?? PRESET_MS;
  const t = m.easing
    ? withTiming(to, { duration, easing: m.easing, reduceMotion: ReduceMotion.System }, done)
    : withTiming(to, { duration, reduceMotion: ReduceMotion.System }, done);
  return m.delay ? withDelay(m.delay, t, ReduceMotion.System) : t;
}

// ── who is leaving ───────────────────────────────────────────────────────────

/** A kept child's ledger: who inside it plays an exit, and who has finished. */
interface Book {
  members: Set<number>;
  left: Set<number>;
  next: number;
  join: () => number;
  quit: (id: number) => void;
  done: (id: number) => void;
  stage?: Stage;
}

interface Stage {
  /** Removed by its Presence, or inside a child that is. */
  leaving: boolean;
  /** Removed itself, not carried out inside a leaving ancestor: it steps out of the layout. */
  removed: boolean;
  /** A PresenceView of this child already holds this one; only the outermost steps out. */
  held: boolean;
  book: Book;
}

const StageContext = createContext<Stage | null>(null);

type Kept = { key: string; element: React.ReactElement; removed: boolean };

const finished = (book?: Book) => !book || [...book.members].every((m) => book.left.has(m));

/**
 * Keeps each child React drops, by key, until its exits have ended. A dropped child keeps its
 * place in the order, after anything that arrived where it stood, as a withheld view does.
 *
 * Its ledger is kept in refs and read as it renders, as every exit-presence keeps one: what a
 * render writes there stays true if React throws that render away (a book made once per key, a
 * returned child's marks cleared, a stage cached per state), and the list is committed only after
 * the commit. Held in state, every view joining a book would draw its Presence once more. The
 * compiler is told to leave it as written.
 */
/* eslint-disable react-hooks/refs -- the ledger above, read as it renders on purpose */
export function Presence({ children }: { children?: React.ReactNode }) {
  'use no memo';
  const outer = useContext(StageContext);
  const [, redraw] = useReducer((n: number) => n + 1, 0);
  const shown = useRef<Kept[]>([]);
  const books = useRef(new Map<string, Book>());

  const bookFor = (key: string): Book => {
    let book = books.current.get(key);
    if (!book) {
      const b: Book = {
        members: new Set(), left: new Set(), next: 0,
        join: () => { b.next += 1; b.members.add(b.next); return b.next; },
        quit: (id) => { b.members.delete(id); b.left.delete(id); redraw(); },
        done: (id) => { if (b.members.has(id) && !b.left.has(id)) { b.left.add(id); redraw(); } },
      };
      book = b;
      books.current.set(key, book);
    }
    return book;
  };

  const present = React.Children.toArray(children).filter(React.isValidElement);
  const presentKeys = new Set(present.map((e) => String(e.key)));
  const list: Kept[] = present.map((element) => ({ key: String(element.key), element, removed: false }));
  const prev = shown.current;
  for (let i = prev.length - 1; i >= 0; i--) {
    const p = prev[i];
    if (presentKeys.has(p.key)) continue;
    const book = books.current.get(p.key);
    // Gone once its exits have ended; at once when nothing in it has one to play.
    if (finished(book) && (p.removed || !book || book.members.size === 0)) continue;
    let at = list.length;
    for (let j = i + 1; j < prev.length; j++) {
      const k = list.findIndex((kept) => kept.key === prev[j].key);
      if (k >= 0) { at = k; break; }
    }
    list.splice(at, 0, { ...p, removed: true });
  }

  const leavingAll = outer?.leaving ?? false;
  const stageFor = (kept: Kept): Stage => {
    const book = bookFor(kept.key);
    const leaving = kept.removed || leavingAll;
    // Back before it had gone: it arrives again, and its exits start over when it next leaves.
    if (!leaving && book.left.size) book.left.clear();
    if (!book.stage || book.stage.leaving !== leaving || book.stage.removed !== kept.removed) {
      book.stage = { leaving, removed: kept.removed, held: false, book };
    }
    return book.stage;
  };

  const self = useRef(0);
  useLayoutEffect(() => {
    if (!outer) return undefined;
    const book = outer.book;
    self.current = book.join();
    return () => book.quit(self.current);
  }, [outer]);

  useLayoutEffect(() => {
    shown.current = list;
    for (const key of [...books.current.keys()]) {
      if (!list.some((k) => k.key === key)) books.current.delete(key);
    }
    if (list.some((k) => k.removed && finished(books.current.get(k.key)))) redraw();
    // Inside a leaving child, this one has left once every child of its own has.
    if (outer?.leaving && list.every((k) => finished(books.current.get(k.key)))) outer.book.done(self.current);
  });

  return (
    <>
      {list.map((kept) => (
        <StageContext.Provider key={kept.key} value={stageFor(kept)}>{kept.element}</StageContext.Provider>
      ))}
    </>
  );
}
/* eslint-enable react-hooks/refs */

// ── the view that moves ──────────────────────────────────────────────────────

export interface PresenceViewProps extends Omit<ViewProps, 'style'> {
  /** What arrived, for the E2E report when an entrance had to be set. */
  name: string;
  enter?: Motion<Entrance>;
  /** Without one, it is removed at once. */
  exit?: Motion<Exit>;
  style?: StyleProp<AnimatedStyle<ViewStyle>>;
}

/** A frame a removed view keeps while it leaves: out of the layout, where it last stood. */
const pinAt = (f: LayoutRectangle): ViewStyle => ({
  position: 'absolute', left: f.x, top: f.y, width: f.width, height: f.height,
  right: undefined, bottom: undefined, start: undefined, end: undefined,
  margin: 0, marginHorizontal: 0, marginVertical: 0, marginTop: 0, marginBottom: 0,
  marginLeft: 0, marginRight: 0, marginStart: 0, marginEnd: 0,
});

const pose = (o: SharedValue<number>, x: SharedValue<number>, y: SharedValue<number>, p: Pose) => {
  o.value = p.opacity;
  x.value = p.x;
  y.value = p.y;
};

/** An Animated.View that enters and leaves on a preset's motion, inside a Presence. */
export function PresenceView({
  name, enter, exit, style, onLayout, pointerEvents, children, ...rest
}: PresenceViewProps) {
  const stage = useContext(StageContext);
  const reduced = useReduceMotion();
  const screen = useSafeAreaFrame();
  const leaving = stage?.leaving ?? false;

  const start = enter && !reduced ? entranceFrom(enter.kind, screen.height) : REST;
  const opacity = useSharedValue(start.opacity);
  const x = useSharedValue(start.x);
  const y = useSharedValue(start.y);
  // Arrived, it is drawn with plain styles. A value can reach rest while its animated style
  // never reaches the view just mounted (the film tray, Sealed E2E run 38790116312: open, and
  // nothing of it on the screen), so where a view rests never waits on an animation having
  // drawn it. Leaving, it takes its animated style back.
  const [arrived, setArrived] = useState(start === REST);

  // The frame the layout last gave it: read by the exit as it starts, and drawn by the pin.
  const box = useRef<LayoutRectangle | null>(null);
  const [frame, setFrame] = useState<LayoutRectangle | null>(null);
  const measured = useCallback((e: LayoutChangeEvent) => {
    const f = e.nativeEvent.layout;
    box.current = f;
    setFrame((was) => (was && was.x === f.x && was.y === f.y && was.width === f.width && was.height === f.height ? was : f));
    onLayout?.(e);
  }, [onLayout]);

  // Read when an effect runs, not when it was scheduled: written after each commit, before them.
  const live = useRef({ stage, enter, exit, reduced, screen });
  useLayoutEffect(() => { live.current = { stage, enter, exit, reduced, screen }; });

  const id = useRef(0);
  const book = stage?.book;
  useLayoutEffect(() => {
    if (!book) return undefined;
    id.current = book.join();
    return () => book.quit(id.current);
  }, [book]);

  // Only while still leaving: an exit that ends as the view is shown again lets nothing go.
  const leave = useCallback(() => {
    const now = live.current.stage;
    if (now?.leaving) now.book.done(id.current);
  }, []);

  // Arriving: on mount, and again if it comes back while leaving.
  useEffect(() => {
    if (leaving) return undefined;
    const { enter: e, reduced: r, screen: s } = live.current;
    if (!e || r) {
      [opacity, x, y].forEach((v) => cancelAnimation(v));
      pose(opacity, x, y, REST);
      setArrived(true);
      return undefined;
    }
    pose(opacity, x, y, entranceFrom(e.kind, s.height));
    if (fades(e.kind)) opacity.value = timing(1, e);
    if (e.kind === 'FadeInUp' || e.kind === 'FadeInDown' || e.kind === 'SlideInDown') y.value = timing(0, e);
    const rescue = setTimeout(() => {
      if (opacity.value < 1 || y.value !== 0) {
        e2eTrace('arrival.rescued', { name, at: opacity.value });
        pose(opacity, x, y, REST);
      }
      setArrived(true);
    }, (e.delay ?? 0) + (e.duration ?? PRESET_MS) + ARRIVAL_GRACE_MS);
    return () => clearTimeout(rescue);
    // The arrival belongs to the mount and to each return; its motion is read when it runs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leaving]);

  // Leaving: before the frame is drawn, so a view with no exit to play is never seen to stay.
  useLayoutEffect(() => {
    if (!leaving) return undefined;
    const { exit: e, reduced: r, screen: s } = live.current;
    if (!e || r) {
      leave();
      return undefined;
    }
    setArrived(false);
    // Not yet laid out: it leaves from its parent's origin, where the presets read it.
    const to = exitTo(e.kind, box.current ?? { x: 0, y: 0, width: 0, height: 0 }, s);
    const ended = (done?: boolean) => {
      'worklet';
      if (done) runOnJS(leave)();
    };
    [opacity, x, y].forEach((v) => cancelAnimation(v));
    if (fades(e.kind)) opacity.set(1);
    x.set(0);
    y.set(0);
    if (e.kind === 'SlideOutRight') x.set(timing(to.x, e, ended));
    else if (e.kind === 'FadeOut') opacity.set(timing(0, e, ended));
    else {
      if (fades(e.kind)) opacity.set(timing(0, e));
      y.set(timing(to.y, e, ended));
    }
    // Certain to go: an exit whose end never arrives still lets the view leave.
    const fallback = setTimeout(leave, (e.delay ?? 0) + (e.duration ?? PRESET_MS) + ARRIVAL_GRACE_MS);
    return () => clearTimeout(fallback);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leaving]);

  const fading = fades(enter?.kind) || fades(exit?.kind);
  const moving = moves(enter?.kind) || moves(exit?.kind);
  const animated = useAnimatedStyle(() => {
    if (fading && moving) return { opacity: opacity.value, transform: [{ translateX: x.value }, { translateY: y.value }] };
    if (moving) return { transform: [{ translateX: x.value }, { translateY: y.value }] };
    if (fading) return { opacity: opacity.value };
    return {};
  });

  // The outermost PresenceView of a removed child steps out of the layout where it last stood:
  // the frame it had as it stepped, held as it renders, and let go when it is back.
  const [pin, setPin] = useState<LayoutRectangle | null>(null);
  const steps = !!stage?.removed && !stage.held;
  if (steps && !pin && frame) setPin(frame);
  if (!steps && pin) setPin(null);

  const holds = useMemo<Stage | null>(() => (stage ? { ...stage, held: true } : null), [stage]);

  return (
    <StageContext.Provider value={holds}>
      <Animated.View
        {...rest}
        style={[style, arrived ? restingStyle(fading, moving) : animated, pin ? pinAt(pin) : null]}
        onLayout={measured}
        pointerEvents={leaving ? 'none' : pointerEvents}
        accessibilityElementsHidden={leaving || rest.accessibilityElementsHidden}
        importantForAccessibility={leaving ? 'no-hide-descendants' : rest.importantForAccessibility}
      >
        {children}
      </Animated.View>
    </StageContext.Provider>
  );
}
