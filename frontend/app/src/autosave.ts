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
 * ## When it is not there
 *
 * Private windows, blocked site data, and a few older browsers refuse IndexedDB outright.
 * That is a supported state: `available` goes false, `problem` says why, and the UI says so
 * rather than implying a save happened. Autosave is a convenience; losing it must never
 * take the instrument down with it.
 */

import type { Session } from "./session.ts";

const DB_NAME = "bodyprompt";
const DB_VERSION = 1;
const STORE = "session";
/** One slot. The session file is how you keep more than one — that is the point of it. */
const KEY = "current";

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

export function openAutosave(): Autosave {
  let db: Promise<IDBDatabase> | null = null;
  let problem: string | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  const listeners: ((status: AutosaveStatus) => void)[] = [];
  const supported = typeof indexedDB !== "undefined";
  if (!supported) problem = "this browser keeps no local data, so nothing is autosaved";

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
        const found = await transact<Session | undefined>("readonly", (store) => store.get(KEY));
        return found ?? null;
      } catch (err) {
        problem = `could not read the autosaved session: ${(err as Error).message}`;
        return null;
      }
    },

    async save(session: Session): Promise<void> {
      if (!supported) return;
      try {
        await transact("readwrite", (store) => store.put(session, KEY));
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
        await transact("readwrite", (store) => store.delete(KEY));
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
