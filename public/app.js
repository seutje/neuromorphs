import { createViewer } from './render/viewer.js';
import { createViewControls } from './ui/viewControls.js';
import { createEvolutionPanel } from './ui/evolutionPanel.js';
import { createGenerationViewer } from './ui/generationViewer.js';
import { runEvolutionDemo } from './evolution/demo.js';
import {
  saveRunState,
  loadRunState,
  clearRunState,
  saveReplayRecord,
  loadReplayRecord,
  clearReplayRecord
} from './persistence/runStorage.js';

const canvas = document.querySelector('#viewport');
const statusMessage = document.querySelector('#status-message');
const viewModeSelect = document.querySelector('#view-mode');
const simulationToggleButton = document.querySelector('#simulation-toggle');
const evolutionForm = document.querySelector('#evolution-config');
const evolutionStartButton = document.querySelector('#evolution-start');
const previewBestButton = document.querySelector('#preview-best');
const evolutionProgress = document.querySelector('#evolution-progress');
const statGeneration = document.querySelector('#stat-generation');
const statBest = document.querySelector('#stat-best');
const statMean = document.querySelector('#stat-mean');
const generationViewerContainer = document.querySelector('#generation-viewer');
const generationSlider = document.querySelector('#generation-slider');
const generationPlayButton = document.querySelector('#generation-play');
const generationLatestButton = document.querySelector('#generation-latest');
const generationTimeline = document.querySelector('#generation-timeline');
const generationSummaryNodes = {
  generation: document.querySelector('#generation-summary-generation'),
  count: document.querySelector('#generation-summary-count'),
  best: document.querySelector('#generation-summary-best'),
  mean: document.querySelector('#generation-summary-mean'),
  displacement: document.querySelector('#generation-summary-displacement'),
  speed: document.querySelector('#generation-summary-speed'),
  height: document.querySelector('#generation-summary-height'),
  upright: document.querySelector('#generation-summary-upright'),
  runtime: document.querySelector('#generation-summary-runtime')
};

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

function deepClone(value) {
  return JSON.parse(JSON.stringify(value));
}

let persistedRunState = loadRunState() ?? null;
let latestReplay = loadReplayRecord() ?? null;
let latestBestIndividual = null;
let activeRunConfig = null;
let activeRunTotalGenerations = 0;
let generationViewer = null;

function updatePreviewButtonState() {
  if (previewBestButton) {
    previewBestButton.disabled = !latestBestIndividual;
  }
}

function setLatestBestIndividual(individual) {
  latestBestIndividual = individual ? deepClone(individual) : null;
  updatePreviewButtonState();
}

updatePreviewButtonState();

function applyConfigToForm(config) {
  if (!config || !evolutionForm) {
    return;
  }
  const assign = (name, value) => {
    if (evolutionForm[name]) {
      evolutionForm[name].value = String(value ?? '');
    }
  };
  assign('seed', config.seed ?? 42);
  assign('populationSize', config.populationSize ?? 12);
  assign('generations', config.generations ?? 10);
  assign('morphAddLimbChance', config.morphMutation?.addLimbChance ?? 0.35);
  assign('morphResizeChance', config.morphMutation?.resizeChance ?? 0.85);
  assign('morphJointJitterChance', config.morphMutation?.jointJitterChance ?? 0.65);
  assign('controllerWeightChance', config.controllerMutation?.weightJitterChance ?? 0.85);
  assign('controllerOscillatorChance', config.controllerMutation?.oscillatorChance ?? 0.6);
  assign('controllerAddConnectionChance', config.controllerMutation?.addConnectionChance ?? 0.45);
}

function resolveBestMetrics(entry) {
  if (!entry) {
    return null;
  }
  if (entry.bestMetrics) {
    return deepClone(entry.bestMetrics);
  }
  if (Array.isArray(entry.evaluated) && entry.evaluated.length > 0) {
    const bestId = entry.bestIndividual?.id ?? entry.evaluated[0]?.id;
    const candidate =
      entry.evaluated.find((evaluated) => evaluated.id === bestId) ?? entry.evaluated[0];
    return candidate?.metrics ? deepClone(candidate.metrics) : null;
  }
  return null;
}

function buildGenerationViewerEntry(entry, absoluteGeneration) {
  if (!entry) {
    return null;
  }
  return {
    generation: Number.isFinite(absoluteGeneration) ? Number(absoluteGeneration) : 0,
    bestFitness: Number.isFinite(entry.bestFitness) ? Number(entry.bestFitness) : 0,
    meanFitness: Number.isFinite(entry.meanFitness) ? Number(entry.meanFitness) : 0,
    bestMetrics: resolveBestMetrics(entry),
    bestIndividual: entry.bestIndividual ? deepClone(entry.bestIndividual) : null
  };
}

function handleGenerationUpdate(entry) {
  if (!entry) {
    return;
  }
  if (entry.bestIndividual) {
    setLatestBestIndividual(entry.bestIndividual);
  }
  const total = activeRunTotalGenerations || activeRunConfig?.generations || 1;
  const absoluteGeneration = Number.isFinite(entry.absoluteGeneration)
    ? entry.absoluteGeneration
    : Number(entry.generation ?? 0);
  evolutionPanel.updateProgress({
    generation: Math.min(total, absoluteGeneration + 1),
    total
  });
  evolutionPanel.updateStats({
    generation: absoluteGeneration + 1,
    bestFitness: entry.bestFitness,
    meanFitness: entry.meanFitness
  });
  if (generationViewer) {
    const viewerEntry = buildGenerationViewerEntry(entry, absoluteGeneration);
    if (viewerEntry) {
      generationViewer.addGeneration(viewerEntry);
    }
  }
}

function persistSnapshot(snapshot) {
  if (!snapshot || !activeRunConfig) {
    return;
  }
  const total = activeRunTotalGenerations || activeRunConfig.generations || 0;
  const state = {
    status: snapshot.generation >= total ? 'completed' : 'running',
    config: deepClone(activeRunConfig),
    generation: snapshot.generation,
    totalGenerations: total,
    history: snapshot.history ?? [],
    population: snapshot.population ?? [],
    rngState: snapshot.rngState ?? null,
    updatedAt: Date.now()
  };
  saveRunState(state);
  persistedRunState = state;
}

function handleRunComplete(result) {
  if (!activeRunConfig || !result) {
    return;
  }
  if (result.best) {
    setLatestBestIndividual(result.best);
  }
  const total = activeRunTotalGenerations || activeRunConfig.generations || 0;
  const state = {
    status: 'completed',
    config: deepClone(activeRunConfig),
    generation: total,
    totalGenerations: total,
    history: result.history ?? [],
    population: result.population ?? [],
    rngState: result.rngState ?? null,
    best: result.best ?? null,
    updatedAt: Date.now()
  };
  saveRunState(state);
  persistedRunState = state;
  updateStatus('Evolution run complete. Results saved locally.');
  generationViewer?.jumpToLatest({ silent: true });
}

function getReplayBuffer(record) {
  if (!record || typeof record.json !== 'string') {
    return null;
  }
  return textEncoder.encode(record.json).buffer;
}

function storeReplay(buffer, metadata) {
  if (!(buffer instanceof ArrayBuffer)) {
    return;
  }
  try {
    const json = textDecoder.decode(buffer);
    latestReplay = {
      json,
      metadata: metadata ?? null,
      updatedAt: Date.now()
    };
    saveReplayRecord({ json, metadata });
    updateStatus(
      'Replay captured. Call window.Neuromorphs.replays.playLatest() to watch the playback.'
    );
  } catch (error) {
    console.warn('Failed to store replay:', error);
  }
}

function applySavedRunStateToUi(state) {
  if (!state) {
    generationViewer?.reset();
    setLatestBestIndividual(null);
    return;
  }
  if (state.config) {
    applyConfigToForm(state.config);
  }
  const total = state.totalGenerations ?? state.config?.generations ?? 0;
  const generation = state.generation ?? 0;
  evolutionPanel.updateProgress({ generation, total });
  if (Array.isArray(state.history) && state.history.length > 0) {
    const last = state.history[state.history.length - 1];
    setLatestBestIndividual(state.best ?? last?.bestIndividual ?? null);
    evolutionPanel.updateStats({
      generation: (last?.generation ?? generation) + 1,
      bestFitness: last?.bestFitness,
      meanFitness: last?.meanFitness
    });
    if (generationViewer) {
      const entries = state.history
        .map((entry) => buildGenerationViewerEntry(entry, entry?.generation ?? 0))
        .filter(Boolean);
      generationViewer.setEntries(entries);
      generationViewer.jumpToLatest({ silent: true });
    }
  } else {
    evolutionPanel.resetStats();
    generationViewer?.reset();
    setLatestBestIndividual(state.best ?? null);
  }
}

async function executeEvolutionRun({ config, resumeState = null, resetStats = true } = {}) {
  if (!config || evolutionAbortController) {
    return;
  }
  activeRunConfig = deepClone(config);
  activeRunTotalGenerations = config.generations;
  if (!resumeState) {
    clearRunState();
    persistedRunState = null;
    generationViewer?.reset();
    setLatestBestIndividual(null);
  } else {
    generationViewer?.jumpToLatest({ silent: true });
  }
  if (resetStats) {
    evolutionPanel.resetStats();
  }
  const startingGeneration = resumeState?.generation ?? 0;
  evolutionPanel.updateProgress({
    generation: startingGeneration,
    total: activeRunTotalGenerations
  });
  evolutionPanel.setRunning(true);
  generationViewer?.setRunning(true);
  updateStatus('Evolution run in progress…');
  const controller = new AbortController();
  evolutionAbortController = controller;
  try {
    await runEvolutionDemo({
      seed: config.seed,
      generations: config.generations,
      populationSize: config.populationSize,
      mutationConfig: {
        morph: config.morphMutation,
        controller: config.controllerMutation
      },
      resume: resumeState,
      signal: controller.signal,
      onGeneration: (entry) => {
        handleGenerationUpdate(entry);
      },
      onStateSnapshot: (snapshot) => {
        persistSnapshot(snapshot);
      },
      onComplete: (result) => {
        handleRunComplete(result);
      }
    });
  } catch (error) {
    if (error?.name === 'AbortError') {
      console.info('Evolution run aborted by user.');
      if (persistedRunState) {
        const abortedState = {
          ...persistedRunState,
          status: 'aborted',
          updatedAt: Date.now()
        };
        saveRunState(abortedState);
        persistedRunState = abortedState;
      }
    } else {
      console.warn('Evolution run failed:', error);
      updateStatus('Evolution run failed — check the console for details.');
    }
  } finally {
    evolutionPanel.setRunning(false);
    generationViewer?.setRunning(false);
    generationViewer?.stopPlayback();
    evolutionAbortController = null;
    activeRunConfig = null;
    activeRunTotalGenerations = 0;
  }
}

if (!canvas) {
  throw new Error('Viewport canvas not found.');
}

const viewer = createViewer(canvas);
const viewControls = createViewControls({ select: viewModeSelect, button: simulationToggleButton });
const evolutionPanel = createEvolutionPanel({
  form: evolutionForm,
  button: evolutionStartButton,
  progress: evolutionProgress,
  stats: {
    generation: statGeneration,
    best: statBest,
    mean: statMean
  }
});
if (
  generationViewerContainer &&
  generationSlider &&
  generationPlayButton &&
  generationLatestButton &&
  generationTimeline
) {
  generationViewer = createGenerationViewer({
    container: generationViewerContainer,
    slider: generationSlider,
    playButton: generationPlayButton,
    latestButton: generationLatestButton,
    summary: generationSummaryNodes,
    timeline: generationTimeline
  });
}

if (persistedRunState) {
  applySavedRunStateToUi(persistedRunState);
  const resumeTotal =
    persistedRunState.totalGenerations ?? persistedRunState.config?.generations ?? 0;
  if (
    persistedRunState.status === 'running' &&
    persistedRunState.config &&
    (persistedRunState.generation ?? 0) < resumeTotal
  ) {
    const resumeState = {
      generation: persistedRunState.generation ?? 0,
      history: persistedRunState.history ?? [],
      population: persistedRunState.population ?? [],
      rngState: persistedRunState.rngState ?? null
    };
    executeEvolutionRun({
      config: persistedRunState.config,
      resumeState,
      resetStats: false
    });
  } else if (persistedRunState.status === 'completed') {
    updateStatus('Loaded previous evolution run from storage.');
  }
}

viewControls.setViewMode(viewControls.getViewMode());
viewControls.onViewModeChange((mode) => viewer.setViewMode(mode));

if (simulationToggleButton) {
  simulationToggleButton.disabled = true;
}

const physicsWorker = new Worker(new URL('../workers/physics.worker.js', import.meta.url), {
  type: 'module'
});

if (previewBestButton) {
  previewBestButton.addEventListener('click', () => {
    if (!latestBestIndividual) {
      return;
    }
    updateStatus('Previewing best individual in physics viewer…');
    physicsWorker.postMessage({
      type: 'preview-individual',
      individual: deepClone(latestBestIndividual)
    });
  });
}

let workerReady = false;
let physicsRunning = false;
let sharedStateEnabled = false;
let lastHeightLog = 0;
let sensorLogTimestamp = 0;
let evolutionAbortController = null;

function updateStatus(message) {
  if (statusMessage) {
    statusMessage.textContent = message;
  }
}

function setPhysicsRunning(next) {
  physicsRunning = Boolean(next);
  viewControls.setSimulationRunning(physicsRunning);
}

viewControls.onSimulationToggle(() => {
  if (!workerReady) {
    return;
  }
  physicsWorker.postMessage({ type: physicsRunning ? 'pause' : 'start' });
});

physicsWorker.addEventListener('message', (event) => {
  const data = event.data;
  if (!data || typeof data !== 'object') {
    return;
  }

  if (data.type === 'ready') {
    workerReady = true;
    if (simulationToggleButton) {
      simulationToggleButton.disabled = false;
    }
    updateStatus('Physics worker ready. Streaming hopper morph simulation…');
    physicsWorker.postMessage({ type: 'start' });
  } else if (data.type === 'shared-state') {
    viewer.applySharedLayout(data.layout);
    if (data.buffer instanceof SharedArrayBuffer) {
      viewer.setSharedStateBuffer(data.buffer, data.layout);
      sharedStateEnabled = true;
      updateStatus('Shared memory bridge established. Hopper pose updates are live.');
    } else {
      viewer.clearSharedState();
      sharedStateEnabled = false;
      updateStatus('Shared memory unavailable — falling back to message-based updates.');
    }
  } else if (data.type === 'shared-state-error') {
    console.warn('Shared memory unavailable:', data.message);
  } else if (data.type === 'state') {
    setPhysicsRunning(Boolean(data.running));
    if (!sharedStateEnabled) {
      updateStatus(
        physicsRunning
          ? 'Physics worker stepping. Awaiting shared memory access…'
          : 'Simulation paused. Resume to continue the hopper test.'
      );
    }
  } else if (data.type === 'tick') {
    if (!viewer.isSharedStateActive()) {
      viewer.updateBodiesFromTick(Array.isArray(data.bodies) ? data.bodies : []);
      if (typeof data.timestamp === 'number') {
        const now = data.timestamp;
        if (now - lastHeightLog >= 500) {
          lastHeightLog = now;
          const position = viewer.getPrimaryBodyPosition();
          console.info('[Physics Worker] primary body height:', position.y.toFixed(3));
        }
      }
    } else if (physicsRunning) {
      updateStatus('Shared memory synchronized. Hopper pose streaming from worker.');
    }
    if (data.sensors?.summary && typeof data.timestamp === 'number') {
      if (data.timestamp - sensorLogTimestamp >= 500) {
        const summary = data.sensors.summary;
        const height = Number(summary.rootHeight ?? 0).toFixed(3);
        const contact = summary.footContact ? 'yes' : 'no';
        const angle = Number(summary.primaryJointAngle ?? 0).toFixed(3);
        console.info(
          '[Sensors] height=%sm, contact=%s, jointAngle=%srad',
          height,
          contact,
          angle
        );
        sensorLogTimestamp = data.timestamp;
      }
    }
  } else if (data.type === 'replay-recorded') {
    if (data.buffer instanceof ArrayBuffer) {
      storeReplay(data.buffer, data.metadata ?? null);
    }
  } else if (data.type === 'replay-started') {
    updateStatus('Playing recorded replay…');
  } else if (data.type === 'replay-complete') {
    updateStatus('Replay playback finished.');
  } else if (data.type === 'replay-stopped') {
    updateStatus('Replay playback stopped.');
  } else if (data.type === 'replay-error') {
    console.warn('Replay error:', data.message);
    updateStatus('Replay failed — see console for details.');
  } else if (data.type === 'error') {
    console.error('Physics worker failed to initialize:', data.message);
    updateStatus('Physics worker failed to start. Check the console for details.');
    if (simulationToggleButton) {
      simulationToggleButton.disabled = true;
    }
  }
});

evolutionPanel.onStart((config) => {
  executeEvolutionRun({ config, resetStats: true });
});

evolutionPanel.onStop(() => {
  if (evolutionAbortController) {
    evolutionAbortController.abort();
  }
});

const neuromorphsApi = {
  replays: {
    hasReplay() {
      return Boolean(latestReplay);
    },
    getMetadata() {
      return latestReplay?.metadata ?? null;
    },
    playLatest() {
      if (!latestReplay) {
        console.warn('No replay available yet.');
        return;
      }
      const buffer = getReplayBuffer(latestReplay);
      if (!buffer) {
        console.warn('Replay data is unavailable.');
        return;
      }
      physicsWorker.postMessage({ type: 'play-replay', buffer }, [buffer]);
    },
    clear() {
      latestReplay = null;
      clearReplayRecord();
      updateStatus('Cleared stored replay data.');
    }
  },
  runs: {
    getState() {
      return persistedRunState ? deepClone(persistedRunState) : null;
    },
    clear() {
      clearRunState();
      persistedRunState = null;
      evolutionPanel.resetStats();
      evolutionPanel.updateProgress({ generation: 0, total: 1 });
      generationViewer?.reset();
      setLatestBestIndividual(null);
      updateStatus('Cleared stored evolution run.');
    }
  }
};

if (typeof window !== 'undefined') {
  const target = window.Neuromorphs ? { ...window.Neuromorphs } : {};
  target.replays = neuromorphsApi.replays;
  target.runs = neuromorphsApi.runs;
  window.Neuromorphs = target;
}
