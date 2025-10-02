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
  simulation,
  onGeneration,
  onStateSnapshot,
  signal,
  fitnessWeights
} = {}) {
  const worker = ensureWorker();
  const runId = `evo-${runCounter++}`;

  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(createAbortError());
      return;
    }

    const record = {
      id: runId,
      resolve,
      reject,
      onGeneration,
      onStateSnapshot,
      signal,
      abortHandler: null
    };

    pendingRuns.set(runId, record);

    if (signal) {
      const abortHandler = () => {
        worker.postMessage({ type: 'abort', id: runId });
      };
      record.abortHandler = abortHandler;
      signal.addEventListener('abort', abortHandler);
    }

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
        simulation,
        fitnessWeights
      }
    });
  });
}
