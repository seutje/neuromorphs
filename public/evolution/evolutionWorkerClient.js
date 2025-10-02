import {
  DEFAULT_SELECTION_WEIGHTS,
  resolveSelectionWeights
} from './fitness.js';

let workerInstance = null;
let runCounter = 0;
const pendingRuns = new Map();

function ensureWorker() {
  if (workerInstance) {
    return workerInstance;
  }
  workerInstance = new Worker(new URL('../../workers/evolution.worker.js', import.meta.url), {
    type: 'module'
  });
  workerInstance.addEventListener('message', handleWorkerMessage);
  workerInstance.addEventListener('error', handleWorkerError);
  return workerInstance;
}

function handleWorkerError(event) {
  const error = new Error(event?.message ?? 'Evolution worker error');
  pendingRuns.forEach((run, id) => {
    cleanupRun(id);
    run.reject(error);
  });
  if (workerInstance) {
    workerInstance.removeEventListener('message', handleWorkerMessage);
    workerInstance.removeEventListener('error', handleWorkerError);
    workerInstance.terminate();
    workerInstance = null;
  }
}

function cleanupRun(id) {
  const record = pendingRuns.get(id);
  if (!record) {
    return;
  }
  pendingRuns.delete(id);
  if (record.signal && record.abortHandler) {
    record.signal.removeEventListener('abort', record.abortHandler);
  }
}

function reviveError(data, fallbackName = 'Error') {
  const error = new Error(data?.message ?? 'Evolution worker error');
  error.name = data?.name ?? fallbackName;
  if (data?.stack) {
    error.stack = data.stack;
  }
  return error;
}

function handleWorkerMessage(event) {
  const message = event.data;
  if (!message || typeof message !== 'object') {
    return;
  }
  const record = pendingRuns.get(message.id);
  if (!record) {
    return;
  }
  if (message.type === 'generation') {
    record.onGeneration?.(message.payload);
    return;
  }
  if (message.type === 'snapshot') {
    record.onStateSnapshot?.(message.payload);
    return;
  }
  if (message.type === 'complete') {
    cleanupRun(record.id);
    record.resolve(message.payload);
    return;
  }
  if (message.type === 'aborted') {
    cleanupRun(record.id);
    record.reject(reviveError(message.payload, 'AbortError'));
    return;
  }
  if (message.type === 'error') {
    cleanupRun(record.id);
    record.reject(reviveError(message.payload));
  }
}

function createAbortError() {
  try {
    return new DOMException('Evolution aborted', 'AbortError');
  } catch (_error) {
    const fallback = new Error('Evolution aborted');
    fallback.name = 'AbortError';
    return fallback;
  }
}

export function runEvolutionInWorker({
  initialPopulation,
  generations,
  elitism,
  tournamentSize,
  mutationConfig,
  rngState,
  seed,
  startGeneration = 0,
  history = [],
  selectionWeights = DEFAULT_SELECTION_WEIGHTS,
  simulation,
  onGeneration,
  onStateSnapshot,
  signal
} = {}) {
  const worker = ensureWorker();
  const runId = `evo-${runCounter++}`;

  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(createAbortError());
      return;
    }

    let abortBuffer = null;
    let abortView = null;
    if (typeof SharedArrayBuffer === 'function') {
      try {
        abortBuffer = new SharedArrayBuffer(Int32Array.BYTES_PER_ELEMENT);
        abortView = new Int32Array(abortBuffer);
      } catch (_error) {
        abortBuffer = null;
        abortView = null;
      }
    }

    const record = {
      id: runId,
      resolve,
      reject,
      onGeneration,
      onStateSnapshot,
      signal,
      abortHandler: null,
      abortView
    };

    pendingRuns.set(runId, record);

    if (signal) {
      const abortHandler = () => {
        if (record.abortView && typeof Atomics?.store === 'function') {
          Atomics.store(record.abortView, 0, 1);
        }
        worker.postMessage({ type: 'abort', id: runId });
      };
      record.abortHandler = abortHandler;
      signal.addEventListener('abort', abortHandler);
    }

    const weights = resolveSelectionWeights(selectionWeights);

    worker.postMessage({
      type: 'start',
      id: runId,
      payload: {
        initialPopulation,
        generations,
        elitism,
        tournamentSize,
        mutationConfig,
        rngSeed: seed,
        rngState,
        startGeneration,
        history,
        selectionWeights: weights,
        simulation,
        abortBuffer
      }
    });
  });
}
