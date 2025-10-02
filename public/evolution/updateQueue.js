const DEFAULT_INTERVAL_MS = 200;

function toNumber(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

export function createUpdateQueue({
  intervalMs = DEFAULT_INTERVAL_MS,
  flush,
  now = () => Date.now(),
  setTimeoutFn = (callback, delay) => setTimeout(callback, delay),
  clearTimeoutFn = (id) => clearTimeout(id)
} = {}) {
  if (typeof flush !== 'function') {
    throw new Error('createUpdateQueue requires a flush function.');
  }

  const interval = Math.max(0, toNumber(intervalMs, DEFAULT_INTERVAL_MS));
  let lastFlushTime = Number.NEGATIVE_INFINITY;
  let timerId = null;
  const queue = [];

  function clearTimer() {
    if (timerId !== null) {
      clearTimeoutFn(timerId);
      timerId = null;
    }
  }

  function drain({ force = false } = {}) {
    if (queue.length === 0) {
      return;
    }
    const currentTime = Number(now());
    const elapsed = currentTime - lastFlushTime;
    if (!force && elapsed < interval) {
      schedule(Math.max(0, interval - elapsed));
      return;
    }
    clearTimer();
    lastFlushTime = currentTime;
    const batch = queue.splice(0, queue.length);
    flush(batch);
  }

  function schedule(delay) {
    if (timerId !== null) {
      return;
    }
    const clampedDelay = Math.max(0, toNumber(delay, interval));
    timerId = setTimeoutFn(() => {
      timerId = null;
      drain({ force: true });
    }, clampedDelay);
  }

  function push(entry) {
    if (entry === undefined || entry === null) {
      return;
    }
    queue.push(entry);
    drain();
  }

  function flushNow(options = {}) {
    drain({ force: Boolean(options.force) });
  }

  function cancel() {
    clearTimer();
    queue.splice(0, queue.length);
    lastFlushTime = Number.NEGATIVE_INFINITY;
  }

  return {
    push,
    flush: flushNow,
    cancel
  };
}
