import {
  saveRunState,
  loadRunState,
  clearRunState,
  saveReplayRecord,
  loadReplayRecord,
  clearReplayRecord,
  saveModelRecord,
  loadModelRecord,
  listModelRecords,
  deleteModelRecord,
  clearModelRecords
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

  test('saves, lists, and loads named model records', () => {
    const storage = createMockStorage();
    const individual = { id: 'best-1', morph: { blocks: 4 }, controller: { neurons: 12 } };
    const config = { seed: 7, generations: 5 };
    const saved = saveModelRecord({ name: 'Demo Creature', individual, config }, { storage });
    expect(saved).toBeTruthy();
    expect(saved.id).toBeTruthy();
    const listed = listModelRecords({ storage });
    expect(listed).toHaveLength(1);
    expect(listed[0].name).toBe('Demo Creature');
    expect(listed[0].individual).not.toBe(individual);
    expect(listed[0].individual).toEqual(individual);
    const loaded = loadModelRecord(saved.id, { storage });
    expect(loaded?.config).toEqual(config);
    expect(loaded?.individual).toEqual(individual);
  });

  test('saving with an existing name updates the entry', () => {
    const storage = createMockStorage();
    saveModelRecord({ name: 'Lecture', individual: { id: 'first' } }, { storage });
    const updated = saveModelRecord({ name: 'lecture', individual: { id: 'second' } }, { storage });
    expect(updated).toBeTruthy();
    const listed = listModelRecords({ storage });
    expect(listed).toHaveLength(1);
    expect(listed[0].individual.id).toBe('second');
  });

  test('deleteModelRecord removes stored models', () => {
    const storage = createMockStorage();
    const record = saveModelRecord({ name: 'To Remove', individual: { id: 1 } }, { storage });
    expect(listModelRecords({ storage })).toHaveLength(1);
    expect(deleteModelRecord(record.id, { storage })).toBe(true);
    expect(listModelRecords({ storage })).toHaveLength(0);
    saveModelRecord({ name: 'Another', individual: { id: 2 } }, { storage });
    expect(clearModelRecords({ storage })).toBe(true);
    expect(listModelRecords({ storage })).toHaveLength(0);
  });
});
