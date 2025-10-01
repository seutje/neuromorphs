const RUN_STATE_KEY = 'neuromorphs:last-run';
const REPLAY_KEY = 'neuromorphs:last-replay';
const RUN_STATE_VERSION = 1;

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
