/**
 * Global, concurrency-limited image-decode queue.
 *
 * The grid can have dozens of thumbnails become visible at once (virtualizer
 * overscan + multi-column rows). If every one fires its own fetch+decode
 * immediately, the browser opens 40+ parallel requests, saturates the network,
 * and the main thread janks probing dimensions. This queue caps how many
 * decodes run at once and serves the rest FIFO, so the UI stays responsive and
 * images "fill in" progressively.
 *
 * Cancelling a queued task (e.g. the row scrolled out of view before it started)
 * drops it without decoding.
 */

type TaskFn = () => Promise<void>;

// Default concurrency. Image decoding here is network-bound (each task fetches
// a remote image through the proxy), so the browser can sustain more than the
// old conservative 8. Override with NEXT_PUBLIC_IMAGE_CONCURRENCY (1–32).
let maxConcurrent = (() => {
  const v = Number(process.env.NEXT_PUBLIC_IMAGE_CONCURRENCY);
  return Number.isFinite(v) && v > 0 ? Math.max(1, Math.min(32, Math.floor(v))) : 12;
})();
let active = 0;
const queue: Array<{ run: TaskFn; cancelled: () => boolean }> = [];

// In-flight de-dupe: identical keys share one decode so the virtualizer
// remounting the same row (overscan) doesn't re-fetch the same URL.
const inflight = new Map<string, Promise<void>>();

export function setImageConcurrency(n: number): void {
  maxConcurrent = Math.max(1, Math.min(32, Math.floor(n)));
  pump();
}

export function getImageConcurrency(): number {
  return maxConcurrent;
}

function pump(): void {
  while (active < maxConcurrent && queue.length > 0) {
    const task = queue.shift()!;
    if (task.cancelled()) continue; // dropped before it could start
    active++;
    // Run outside the pump loop so a synchronous throw can't break draining.
    Promise.resolve()
      .then(() => task.run())
      .catch(() => {
        /* errors are handled inside the task (cached as failure) */
      })
      .finally(() => {
        active--;
        pump();
      });
  }
}

export interface QueueHandle {
  cancel: () => void;
  done: Promise<void>;
}

/**
 * Enqueue an async decode task. Returns a handle with `cancel()` and `done`.
 * If cancelled before it starts running, the task is dropped silently.
 *
 * `key` (optional) de-dupes: if a task with the same key is already running,
 * the new call attaches to the existing promise instead of fetching again.
 */
export function enqueueDecode(run: TaskFn, key?: string): QueueHandle {
  let cancelled = false;

  const start = (): Promise<void> =>
    new Promise<void>((resolve) => {
      const task = {
        cancelled: () => cancelled,
        run: () =>
          run().finally(() => {
            resolve();
          }),
      };
      queue.push(task);
      pump();
    });

  if (key && inflight.has(key)) {
    const existing = inflight.get(key)!;
    return { cancel: () => { cancelled = true; }, done: existing };
  }

  const done = (async () => {
    try {
      await start();
    } finally {
      if (key) inflight.delete(key);
    }
  })();

  if (key) inflight.set(key, done);
  return { cancel: () => { cancelled = true; }, done };
}

/** Approximate number of tasks waiting (not yet started). */
export function pendingCount(): number {
  return queue.length;
}
