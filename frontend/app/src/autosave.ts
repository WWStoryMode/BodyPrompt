/**
 * The browser's copy of the session.
 *
 * This is the smaller half of remembering, and the one that fixes the failure the parked
 * note in the README named first: **a reload destroys the poem**. It is not a substitute
 * for the session file — that file is the writer's copy, portable and theirs — but nobody
 * remembers to export before the tab crashes, and this is what is there when they did not.
 *
 * ## Why IndexedDB and not `localStorage`
 *
 * A session is not small. One five-second motion is roughly 150 frames × 22 joints × 7
 * numbers — a few hundred KB of JSON — and a poem keeps every line's history as well as its
 * current motion. A few lines with a few revisions each is comfortably past
 * `localStorage`'s ~5 MB ceiling, and `localStorage` fails by throwing on write: the poem
 * would autosave happily for the first few generations and then silently stop, which is
 * worse than never having saved at all.
 *
 * IndexedDB stores structured clones with no such ceiling, and it is asynchronous, so a
 * multi-megabyte write does not freeze the instrument mid-performance.
 *
 * ## Why the session is stored in pieces
 *
 * The sentence above is true of the *write*. It is not true of the **structured clone**,
 * which `put` performs on the calling thread before the write goes anywhere. What that
 * costs is set by the shape of the object, not its size in bytes: a single Day 2 batch is
 * 105 motions, 25,200 frames and about 1.18 million small arrays to walk.
 *
 * Measured on two appended batches — 210 lines, the size a rating run actually reaches —
 * cloning the whole session takes **769 ms**, and cloning the same poem with its motions
 * left out takes **1 ms**. Rating one line changed a single integer and paid for all 210
 * motions, every 1.2 seconds, on the thread drawing the body.
 *
 * So the session is stored in pieces. The poem — its lines, its ratings, what each line
 * came from — is one small record rewritten whenever anything changes. Each motion is its
 * own record, written once. A motion never changes after it is generated, so re-writing one
 * is only ever necessary when a line's slot comes to hold a *different* motion, and this
 * module remembers which object it put in each slot so it can tell.
 *
 * ## When it is not there
 *
 * Private windows, blocked site data, and a few older browsers refuse IndexedDB outright.
 * That is a supported state: `available` goes false, `problem` says why, and the UI says so
 * rather than implying a save happened. Autosave is a convenience; losing it must never
 * take the instrument down with it.
 */

import type { Session } from "./session.ts";
import type { CanonicalMotion } from "./types.ts";

const DB_NAME = "bodyprompt";
/** 2 split the motions out of the session record. A v1 database opens and is read as it is. */
const DB_VERSION = 2;
const STORE = "session";
/** One slot. The session file is how you keep more than one — that is the point of it. */
const KEY = "current";
/** Every motion record's key begins with this, so the orphans can be found and swept. */
const MOTION = "motion:";

/** How long to wait after the last change before writing. */
const DEBOUNCE_MS = 1200;

export interface Autosave {
  /** False when this browser will not keep anything for us. */
  readonly available: boolean;
  /** Why, when it will not. Shown to the writer verbatim rather than swallowed. */
  readonly problem: string | null;
  load(): Promise<Session | null>;
  save(session: Session): Promise<void>;
  /** Save soon, not now — coalesces a burst of keystrokes into one write. */
  queue(build: () => Session): void;
  clear(): Promise<void>;
  /** Called after every completed write, and after every failure. */
  onStatus(listener: (status: AutosaveStatus) => void): void;
}

export interface AutosaveStatus {
  saved: boolean;
  at: Date | null;
  problem: string | null;
}

/** Where a motion used to be, in the stored record. */
interface MotionRef {
  $motion: string;
}

const isRef = (value: unknown): value is MotionRef =>
  !!value && typeof value === "object" && typeof (value as MotionRef).$motion === "string";

/**
 * The session with every motion lifted out and replaced by the key it is filed under.
 *
 * Pure, and exported, because this and `join` are the pair that can silently lose someone's
 * work: everything else here is a database call that fails loudly.
 */
export function split(session: Session): {
  record: unknown;
  motions: Map<string, CanonicalMotion>;
} {
  const motions = new Map<string, CanonicalMotion>();
  const lift = (key: string, motion: CanonicalMotion | null): MotionRef | null => {
    if (!motion) return null;
    motions.set(key, motion);
    return { $motion: key };
  };
  const lines = session.poem.lines.map((line) => ({
    ...line,
    motion: lift(`${MOTION}${line.id}:current`, line.motion),
    history: line.history.map((motion, at) => lift(`${MOTION}${line.id}:${at}`, motion)),
  }));
  return {
    record: {
      ...session,
      poem: { ...session.poem, lines, baked: lift(`${MOTION}baked`, session.poem.baked) },
    },
    motions,
  };
}

/**
 * Put the motions back, and report which slot each one came out of.
 *
 * A value that is not a reference is passed through as it is, which is what lets a record
 * written by version 1 — motions inline — be read without a migration step. A reference
 * whose motion has gone becomes `null`, and the session layer already treats a line with no
 * motion as a line that has not been generated.
 *
 * `slots` is what the caller seeds its "what is already written where" map from, so the
 * first save after a reload does not rewrite everything it has just read.
 */
export function join(
  record: unknown,
  motions: Map<string, unknown>,
): { session: Session; slots: Map<string, CanonicalMotion> } {
  const slots = new Map<string, CanonicalMotion>();
  const found = (value: unknown): CanonicalMotion | null => {
    if (!isRef(value)) return (value as CanonicalMotion | null) ?? null;
    return (motions.get(value.$motion) as CanonicalMotion | undefined) ?? null;
  };
  const session = record as Session;
  const lines = session.poem.lines.map((line) => {
    const motion = found(line.motion);
    if (motion) slots.set(`${MOTION}${line.id}:current`, motion);
    const history: CanonicalMotion[] = [];
    (line.history ?? []).forEach((entry, at) => {
      const restored = found(entry);
      if (!restored) return;
      slots.set(`${MOTION}${line.id}:${at}`, restored);
      history.push(restored);
    });
    return { ...line, motion, history };
  });
  const baked = found(session.poem.baked);
  if (baked) slots.set(`${MOTION}baked`, baked);
  return { session: { ...session, poem: { ...session.poem, lines, baked } }, slots };
}

export function openAutosave(): Autosave {
  let db: Promise<IDBDatabase> | null = null;
  let problem: string | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  const listeners: ((status: AutosaveStatus) => void)[] = [];
  const supported = typeof indexedDB !== "undefined";
  if (!supported) problem = "this browser keeps no local data, so nothing is autosaved";

  /**
   * Which motion object is currently in each slot.
   *
   * The point of the split is that a motion is written once, and the only way to know a
   * write can be skipped is to know what is already there. Motions are immutable after
   * generation, so object identity is enough — and seeding this from `load` is what stops
   * the first save after a reload rewriting everything it just read.
   */
  const stored = new Map<string, CanonicalMotion>();

  function announce(status: AutosaveStatus): void {
    for (const listener of listeners) listener(status);
  }

  function open(): Promise<IDBDatabase> {
    if (!db) {
      db = new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);
        request.onupgradeneeded = () => {
          if (!request.result.objectStoreNames.contains(STORE)) {
            request.result.createObjectStore(STORE);
          }
          // Coming from version 1 there is nothing to migrate: the old record holds its
          // motions inline, and `join` reads that shape unchanged. The first save after it
          // splits them out.
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error ?? new Error("could not open storage"));
        // A second tab holding an older version open. Rare, and it resolves itself when
        // that tab closes; failing loudly beats hanging on a promise that never settles.
        request.onblocked = () => reject(new Error("another tab is holding the session store"));
      });
      db.catch(() => {
        db = null; // let a later attempt try again rather than caching the failure forever
      });
    }
    return db;
  }

  /** One request, one transaction — for the reads that stand on their own. */
  function transact<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>) {
    return open().then(
      (database) =>
        new Promise<T>((resolve, reject) => {
          const tx = database.transaction(STORE, mode);
          const request = run(tx.objectStore(STORE));
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => reject(request.error ?? new Error("storage refused"));
          tx.onabort = () => reject(tx.error ?? new Error("storage refused"));
        }),
    );
  }

  /**
   * Many requests, one transaction, resolving when the whole thing lands.
   *
   * Every request is issued synchronously inside `run`. A transaction goes inactive as soon
   * as control returns to the event loop, so nothing is awaited part-way through one.
   */
  function batch(run: (store: IDBObjectStore) => void): Promise<void> {
    return open().then(
      (database) =>
        new Promise<void>((resolve, reject) => {
          const tx = database.transaction(STORE, "readwrite");
          run(tx.objectStore(STORE));
          tx.oncomplete = () => resolve();
          tx.onabort = () => reject(tx.error ?? new Error("storage refused"));
          tx.onerror = () => reject(tx.error ?? new Error("storage refused"));
        }),
    );
  }

  return {
    get available() {
      return supported && problem === null;
    },
    get problem() {
      return problem;
    },

    async load(): Promise<Session | null> {
      if (!supported) return null;
      try {
        // Every record in one pass rather than a `get` per motion: a rating run is a few
        // hundred of them, and that is a few hundred round trips before anything is drawn.
        const keys = await transact<IDBValidKey[]>("readonly", (store) => store.getAllKeys());
        const values = await transact<unknown[]>("readonly", (store) => store.getAll());
        const at = keys.indexOf(KEY);
        if (at < 0) return null;
        const motions = new Map<string, unknown>();
        keys.forEach((key, index) => {
          if (typeof key === "string" && key.startsWith(MOTION)) motions.set(key, values[index]);
        });
        const { session, slots } = join(values[at], motions);
        stored.clear();
        for (const [key, motion] of slots) stored.set(key, motion);
        return session;
      } catch (err) {
        problem = `could not read the autosaved session: ${(err as Error).message}`;
        return null;
      }
    },

    async save(session: Session): Promise<void> {
      if (!supported) return;
      try {
        const { record, motions } = split(session);
        // Read the key list in its own transaction, so nothing is awaited inside the one
        // that writes. What it is for — finding orphans — is unaffected by being a moment
        // stale, and this is the only writer.
        const keys = await transact<IDBValidKey[]>("readonly", (store) => store.getAllKeys());
        const present = new Set(
          keys.filter((key): key is string => typeof key === "string" && key.startsWith(MOTION)),
        );

        const written: string[] = [];
        await batch((store) => {
          store.put(record, KEY);
          for (const [key, motion] of motions) {
            // Skip only when this slot already holds *this* motion. A re-drafted line keeps
            // its key and changes what is in it, so presence alone would leave the browser
            // holding a body the poem has moved on from.
            if (present.has(key) && stored.get(key) === motion) continue;
            store.put(motion, key);
            written.push(key);
          }
          for (const key of present) {
            if (!motions.has(key)) {
              store.delete(key); // a deleted line, or a poem replaced by another
              stored.delete(key);
            }
          }
        });
        for (const key of written) stored.set(key, motions.get(key)!);

        problem = null;
        announce({ saved: true, at: new Date(), problem: null });
      } catch (err) {
        // Most likely a quota refusal on a poem with a lot of history. Say it; do not
        // retry silently and do not let the last successful save's timestamp stand as if
        // it covered this one.
        problem = `autosave failed: ${(err as Error).message}`;
        announce({ saved: false, at: null, problem });
      }
    },

    queue(build: () => Session): void {
      if (!supported) return;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = null;
        void this.save(build());
      }, DEBOUNCE_MS);
    },

    async clear(): Promise<void> {
      if (timer) clearTimeout(timer);
      timer = null;
      if (!supported) return;
      try {
        // The motions go with it. Leaving them would keep tens of megabytes of bodies for a
        // poem that no longer exists, and the next save would only sweep them one by one.
        await batch((store) => store.clear());
        stored.clear();
        announce({ saved: false, at: null, problem: null });
      } catch {
        // Nothing to tell the writer: they asked for it gone, and it is either gone or
        // about to be overwritten by the poem they are starting.
      }
    },

    onStatus(listener): void {
      listeners.push(listener);
    },
  };
}
