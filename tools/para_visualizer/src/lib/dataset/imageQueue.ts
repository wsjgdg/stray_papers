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

let maxConcurrent = 8;
let active = 0;
const queue: Array<{ run: TaskFn; cancelled: () => boolean }> = [];

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
 */
export function enqueueDecode(run: TaskFn): QueueHandle {
  let cancelled = false;
  const done = new Promise<void>((resolve) => {
    const task = {
      cancelled: () => cancelled,
      run: () =>
        run().finally(() => {
          /* resolution handled by caller's own logic; always settle here */
          resolve();
        }),
    };
    queue.push(task);
    pump();
  });
  return {
    cancel: () => {
      cancelled = true;
    },
    done,
  };
}

/** Approximate number of tasks waiting (not yet started). */
export function pendingCount(): number {
  return queue.length;
}
