import {
  saveRunState,
  loadRunState,
  clearRunState,
  saveReplayRecord,
  loadReplayRecord,
  clearReplayRecord
} from '../public/persistence/runStorage.js';

function createMockStorage() {
  const map = new Map();
  return {
    getItem(key) {
      return map.has(key) ? map.get(key) : null;
    },
    setItem(key, value) {
      map.set(key, value);
    },
    removeItem(key) {
      map.delete(key);
    }
  };
}

describe('runStorage', () => {
  test('run state round-trips through storage', () => {
    const storage = createMockStorage();
    const state = {
      status: 'running',
      config: { seed: 7, populationSize: 8, generations: 4 },
      generation: 2,
      totalGenerations: 4,
      history: [{ generation: 1, bestFitness: 1.23, meanFitness: 0.9 }],
      population: [{ id: 'a', morph: {}, controller: {} }],
      rngState: { state: 12345 }
    };
    expect(saveRunState(state, { storage })).toBe(true);
    const loaded = loadRunState({ storage });
    expect(loaded).toBeTruthy();
    expect(loaded.status).toBe('running');
    expect(loaded.totalGenerations).toBe(4);
    expect(loaded.history).toHaveLength(1);
    expect(loaded.population).toHaveLength(1);
    clearRunState({ storage });
    expect(loadRunState({ storage })).toBeNull();
  });

  test('replay record persists as json and reconstructs buffer', () => {
    const storage = createMockStorage();
    const payload = JSON.stringify({ metadata: { version: 1 }, frames: [] });
    const encoder = new TextEncoder();
    const buffer = encoder.encode(payload).buffer;
    expect(saveReplayRecord({ buffer, metadata: { version: 1 } }, { storage })).toBe(true);
    const record = loadReplayRecord({ storage });
    expect(record).toBeTruthy();
    expect(record.metadata.version).toBe(1);
    const decoder = new TextDecoder();
    const decoded = decoder.decode(record.buffer);
    expect(decoded).toBe(payload);
    clearReplayRecord({ storage });
    expect(loadReplayRecord({ storage })).toBeNull();
  });
});
