import { createUpdateQueue } from '../public/evolution/updateQueue.js';

function createTimerHarness() {
  let currentTime = 0;
  let timerIdCounter = 0;
  const timers = new Map();

  function schedule(callback, delay) {
    const id = ++timerIdCounter;
    timers.set(id, {
      callback,
      triggerAt: currentTime + Math.max(0, Number(delay) || 0)
    });
    return id;
  }

  function clear(id) {
    timers.delete(id);
  }

  function advance(amount) {
    currentTime += Math.max(0, amount);
    let next = resolveNextTimer();
    while (next) {
      timers.delete(next.id);
      next.timer.callback();
      next = resolveNextTimer();
    }
  }

  function resolveNextTimer() {
    let candidate = null;
    for (const [id, timer] of timers.entries()) {
      if (timer.triggerAt <= currentTime) {
        if (!candidate || timer.triggerAt < candidate.timer.triggerAt) {
          candidate = { id, timer };
        }
      }
    }
    return candidate;
  }

  function now() {
    return currentTime;
  }

  return {
    setTimeout: schedule,
    clearTimeout: clear,
    advance,
    now
  };
}

describe('createUpdateQueue', () => {
  it('batches entries when pushes occur within the interval', () => {
    const batches = [];
    const timers = createTimerHarness();
    const queue = createUpdateQueue({
      intervalMs: 200,
      flush: (entries) => {
        batches.push(entries.slice());
      },
      now: timers.now,
      setTimeoutFn: timers.setTimeout,
      clearTimeoutFn: timers.clearTimeout
    });

    queue.push('a');
    expect(batches).toEqual([['a']]);

    queue.push('b');
    queue.push('c');
    expect(batches).toHaveLength(1);

    timers.advance(199);
    expect(batches).toHaveLength(1);

    timers.advance(1);
    expect(batches).toHaveLength(2);
    expect(batches[1]).toEqual(['b', 'c']);

    queue.push('d');
    timers.advance(200);
    expect(batches).toHaveLength(3);
    expect(batches[2]).toEqual(['d']);
  });

  it('flushes immediately when forced and resets internal state', () => {
    const batches = [];
    const timers = createTimerHarness();
    const queue = createUpdateQueue({
      intervalMs: 200,
      flush: (entries) => {
        batches.push(entries.slice());
      },
      now: timers.now,
      setTimeoutFn: timers.setTimeout,
      clearTimeoutFn: timers.clearTimeout
    });

    queue.push('a');
    queue.push('b');
    expect(batches).toHaveLength(1);

    queue.flush({ force: true });
    expect(batches).toHaveLength(2);
    expect(batches[1]).toEqual(['b']);

    queue.push('c');
    expect(batches).toHaveLength(3);
    expect(batches[2]).toEqual(['c']);
  });

  it('cancels pending timers and clears queued entries', () => {
    const batches = [];
    const timers = createTimerHarness();
    const queue = createUpdateQueue({
      intervalMs: 200,
      flush: (entries) => {
        batches.push(entries.slice());
      },
      now: timers.now,
      setTimeoutFn: timers.setTimeout,
      clearTimeoutFn: timers.clearTimeout
    });

    queue.push('a');
    queue.push('b');
    expect(batches).toHaveLength(1);

    queue.cancel();
    timers.advance(1000);
    expect(batches).toHaveLength(1);

    queue.push('c');
    expect(batches).toHaveLength(2);
    expect(batches[1]).toEqual(['c']);
  });
});
