const frameDuration = 16;

function now() {
  if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
    return performance.now();
  }
  return Date.now();
}

function waitForNextFrame() {
  if (typeof requestAnimationFrame === 'function') {
    return new Promise((resolve) => requestAnimationFrame(() => resolve()));
  }
  return new Promise((resolve) => setTimeout(resolve, frameDuration));
}

/**
 * Yields control back to the main thread so the browser can process UI work.
 * Falls back to a short timeout when requestAnimationFrame is unavailable.
 */
export async function yieldToMainThread({ signal } = {}) {
  if (signal?.aborted) {
    return;
  }
  await waitForNextFrame();
}

export async function yieldIfLongRunning({
  lastYieldTimestamp,
  signal,
  minInterval = frameDuration
} = {}) {
  const previous = lastYieldTimestamp ?? 0;
  const current = now();
  if (current - previous < minInterval) {
    return previous;
  }
  await yieldToMainThread({ signal });
  return now();
}
