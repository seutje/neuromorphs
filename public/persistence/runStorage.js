const RUN_STATE_KEY = 'neuromorphs:last-run';
const REPLAY_KEY = 'neuromorphs:last-replay';
const RUN_STATE_VERSION = 1;
const MODEL_COLLECTION_KEY = 'neuromorphs:saved-models';
const MODEL_COLLECTION_VERSION = 1;

function getDefaultStorage() {
  try {
    const candidate = globalThis?.localStorage;
    return candidate ?? null;
  } catch (error) {
    console.warn('Local storage unavailable:', error);
    return null;
  }
}

function resolveStorage(customStorage) {
  if (customStorage) {
    return customStorage;
  }
  return getDefaultStorage();
}

function deepClone(value) {
  return value ? JSON.parse(JSON.stringify(value)) : value;
}

function ensureString(value) {
  return typeof value === 'string' ? value : '';
}

function createModelId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `model-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
}

function getModelCollection(storage) {
  const fallback = { version: MODEL_COLLECTION_VERSION, items: [] };
  if (!storage) {
    return fallback;
  }
  const raw = storage.getItem(MODEL_COLLECTION_KEY);
  if (!raw) {
    return fallback;
  }
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') {
      return fallback;
    }
    if (parsed.version !== MODEL_COLLECTION_VERSION || !Array.isArray(parsed.items)) {
      return fallback;
    }
    const items = parsed.items
      .map((item) => {
        if (!item || typeof item !== 'object') {
          return null;
        }
        const id = ensureString(item.id).trim();
        const name = ensureString(item.name).trim();
        if (!id || !name) {
          return null;
        }
        const createdAt = Number.isFinite(item.createdAt) ? Number(item.createdAt) : Date.now();
        const updatedAt = Number.isFinite(item.updatedAt) ? Number(item.updatedAt) : createdAt;
        const individual = item.individual && typeof item.individual === 'object' ? item.individual : null;
        const config = item.config && typeof item.config === 'object' ? item.config : null;
        return {
          id,
          name,
          createdAt,
          updatedAt,
          individual,
          config
        };
      })
      .filter((item) => item && item.individual);
    return { version: MODEL_COLLECTION_VERSION, items };
  } catch (error) {
    console.warn('Failed to parse model collection from storage:', error);
    return fallback;
  }
}

function writeModelCollection(storage, collection) {
  if (!storage) {
    return false;
  }
  try {
    storage.setItem(
      MODEL_COLLECTION_KEY,
      JSON.stringify({
        version: MODEL_COLLECTION_VERSION,
        items: Array.isArray(collection?.items) ? collection.items : []
      })
    );
    return true;
  } catch (error) {
    console.warn('Failed to persist model collection:', error);
    return false;
  }
}

export function saveRunState(state, options = {}) {
  if (!state || typeof state !== 'object') {
    return false;
  }
  const storage = resolveStorage(options.storage);
  if (!storage) {
    return false;
  }
  const payload = {
    version: RUN_STATE_VERSION,
    updatedAt: Date.now(),
    ...state
  };
  try {
    storage.setItem(RUN_STATE_KEY, JSON.stringify(payload));
    return true;
  } catch (error) {
    console.warn('Failed to persist run state:', error);
    return false;
  }
}

export function loadRunState(options = {}) {
  const storage = resolveStorage(options.storage);
  if (!storage) {
    return null;
  }
  const raw = storage.getItem(RUN_STATE_KEY);
  if (!raw) {
    return null;
  }
  try {
    const data = JSON.parse(raw);
    if (!data || typeof data !== 'object') {
      return null;
    }
    if (data.version !== RUN_STATE_VERSION) {
      return null;
    }
    return data;
  } catch (error) {
    console.warn('Failed to load stored run state:', error);
    return null;
  }
}

export function clearRunState(options = {}) {
  const storage = resolveStorage(options.storage);
  if (!storage) {
    return false;
  }
  try {
    storage.removeItem(RUN_STATE_KEY);
    return true;
  } catch (error) {
    console.warn('Failed to clear stored run state:', error);
    return false;
  }
}

export function saveReplayRecord(record, options = {}) {
  if (!record || (typeof record.json !== 'string' && !(record.buffer instanceof ArrayBuffer))) {
    return false;
  }
  const storage = resolveStorage(options.storage);
  if (!storage) {
    return false;
  }
  let json = record.json;
  if (typeof json !== 'string' && record.buffer instanceof ArrayBuffer) {
    try {
      json = new TextDecoder().decode(record.buffer);
    } catch (error) {
      console.warn('Failed to decode replay buffer for storage:', error);
      return false;
    }
  }
  if (typeof json !== 'string') {
    return false;
  }
  const payload = {
    version: RUN_STATE_VERSION,
    updatedAt: Date.now(),
    metadata: record.metadata ?? null,
    json
  };
  try {
    storage.setItem(REPLAY_KEY, JSON.stringify(payload));
    return true;
  } catch (error) {
    console.warn('Failed to store replay record:', error);
    return false;
  }
}

export function loadReplayRecord(options = {}) {
  const storage = resolveStorage(options.storage);
  if (!storage) {
    return null;
  }
  const raw = storage.getItem(REPLAY_KEY);
  if (!raw) {
    return null;
  }
  try {
    const data = JSON.parse(raw);
    if (!data || typeof data !== 'object') {
      return null;
    }
    if (data.version !== RUN_STATE_VERSION || typeof data.json !== 'string') {
      return null;
    }
    const encoder = new TextEncoder();
    const buffer = encoder.encode(data.json).buffer;
    return {
      metadata: data.metadata ?? null,
      json: data.json,
      buffer,
      updatedAt: data.updatedAt ?? null
    };
  } catch (error) {
    console.warn('Failed to read stored replay record:', error);
    return null;
  }
}

export function clearReplayRecord(options = {}) {
  const storage = resolveStorage(options.storage);
  if (!storage) {
    return false;
  }
  try {
    storage.removeItem(REPLAY_KEY);
    return true;
  } catch (error) {
    console.warn('Failed to clear replay record:', error);
    return false;
  }
}

export function listModelRecords(options = {}) {
  const storage = resolveStorage(options.storage);
  if (!storage) {
    return [];
  }
  const collection = getModelCollection(storage);
  return collection.items
    .map((item) => ({
      id: item.id,
      name: item.name,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
      config: item.config ? deepClone(item.config) : null,
      individual: item.individual ? deepClone(item.individual) : null
    }))
    .sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0));
}

export function loadModelRecord(id, options = {}) {
  if (!id) {
    return null;
  }
  const storage = resolveStorage(options.storage);
  if (!storage) {
    return null;
  }
  const collection = getModelCollection(storage);
  const entry = collection.items.find((item) => item.id === id);
  if (!entry) {
    return null;
  }
  return {
    id: entry.id,
    name: entry.name,
    createdAt: entry.createdAt,
    updatedAt: entry.updatedAt,
    config: entry.config ? deepClone(entry.config) : null,
    individual: entry.individual ? deepClone(entry.individual) : null
  };
}

export function saveModelRecord(record, options = {}) {
  if (!record || typeof record !== 'object') {
    return null;
  }
  const name = ensureString(record.name).trim();
  if (!name) {
    return null;
  }
  if (!record.individual || typeof record.individual !== 'object') {
    return null;
  }
  const storage = resolveStorage(options.storage);
  if (!storage) {
    return null;
  }
  const collection = getModelCollection(storage);
  const now = Date.now();
  const config = record.config && typeof record.config === 'object' ? deepClone(record.config) : null;
  const individual = deepClone(record.individual);
  const trimmedName = name.slice(0, 120);
  const id = ensureString(record.id).trim();
  let target = id ? collection.items.find((item) => item.id === id) : null;
  if (!target) {
    target = collection.items.find((item) => item.name.toLowerCase() === trimmedName.toLowerCase());
  }
  if (target) {
    target.name = trimmedName;
    target.individual = individual;
    target.config = config;
    target.updatedAt = now;
  } else {
    target = {
      id: createModelId(),
      name: trimmedName,
      createdAt: now,
      updatedAt: now,
      individual,
      config
    };
    collection.items.push(target);
  }
  const success = writeModelCollection(storage, collection);
  if (!success) {
    return null;
  }
  return {
    id: target.id,
    name: target.name,
    createdAt: target.createdAt,
    updatedAt: target.updatedAt,
    config: target.config ? deepClone(target.config) : null,
    individual: target.individual ? deepClone(target.individual) : null
  };
}

export function deleteModelRecord(id, options = {}) {
  if (!id) {
    return false;
  }
  const storage = resolveStorage(options.storage);
  if (!storage) {
    return false;
  }
  const collection = getModelCollection(storage);
  const index = collection.items.findIndex((item) => item.id === id);
  if (index === -1) {
    return false;
  }
  collection.items.splice(index, 1);
  return writeModelCollection(storage, collection);
}

export function clearModelRecords(options = {}) {
  const storage = resolveStorage(options.storage);
  if (!storage) {
    return false;
  }
  try {
    storage.removeItem(MODEL_COLLECTION_KEY);
    return true;
  } catch (error) {
    console.warn('Failed to clear saved model records:', error);
    return false;
  }
}
