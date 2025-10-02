import { createViewer } from './render/viewer.js';
import { createViewControls } from './ui/viewControls.js';
import { createEvolutionPanel } from './ui/evolutionPanel.js';
import { createGenerationViewer } from './ui/generationViewer.js';
import { runEvolutionDemo } from './evolution/demo.js';
import { createUpdateQueue } from './evolution/updateQueue.js';
import {
  DEFAULT_SELECTION_WEIGHTS,
  objectiveToSelectionWeights,
  resolveSelectionWeights
} from './evolution/fitness.js';
import { DEFAULT_STAGE_ID, getStageDefinition, listStages } from './environment/stages.js';
import { deepClone, resolveResumeState, runConfigsMatch } from './evolution/runState.js';
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
  deleteModelRecord
} from './persistence/runStorage.js';
import { createModelLibrary } from './ui/modelLibrary.js';

const canvas = document.querySelector('#viewport');
const statusMessage = document.querySelector('#status-message');
const viewModeSelect = document.querySelector('#view-mode');
const simulationToggleButton = document.querySelector('#simulation-toggle');
const stageSelect = document.querySelector('#stage-select');
const loadStageButton = document.querySelector('#load-stage');
const clearStageButton = document.querySelector('#clear-stage');
const resetAllButton = document.querySelector('#reset-all');
const evolutionForm = document.querySelector('#evolution-config');
const evolutionStartButton = document.querySelector('#evolution-start');
const previewBestButton = document.querySelector('#preview-best');
const startingModelSelect = document.querySelector('#starting-model');
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
const modelLibraryContainer = document.querySelector('#model-library');
const DEFAULT_MODEL_URL = new URL('../models/catdog.json', import.meta.url);
const DEFAULT_MODEL_ID = '9ca351f8-e466-414f-89e4-de08bd771d9b';
const DEFAULT_MODEL_NAME = 'catdog';
const HOOMAN_MODEL_URL = new URL('../models/hooman.json', import.meta.url);
const HOOMAN_MODEL_ID = 'd9c1b1a1-869d-4f6a-a3e1-30d8f02c587b';
const HOOMAN_MODEL_NAME = 'hooman';
const QUAD_MODEL_URL = new URL('../models/quad.json', import.meta.url);
const QUAD_MODEL_ID = 'df9d6c08-6b1a-4fa5-9d16-f6a74b8c4f8f';
const QUAD_MODEL_NAME = 'quad';

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();
const DOM_UPDATE_INTERVAL_MS = 200;
let statusTextCache = statusMessage?.textContent ?? '';
const statusUpdateQueue = createUpdateQueue({
  intervalMs: DOM_UPDATE_INTERVAL_MS,
  flush: (messages) => {
    if (!Array.isArray(messages) || messages.length === 0) {
      return;
    }
    const latest = messages[messages.length - 1];
    const nextText =
      typeof latest === 'string'
        ? latest
        : latest !== undefined && latest !== null
          ? String(latest)
          : '';
    if (nextText === statusTextCache) {
      return;
    }
    statusTextCache = nextText;
    if (statusMessage) {
      statusMessage.textContent = nextText;
    }
  }
});

let persistedRunState = loadRunState() ?? null;
let latestReplay = loadReplayRecord() ?? null;
let latestBestIndividual = null;
let activeRunConfig = null;
let activeRunTotalGenerations = 0;
let generationViewer = null;
let modelLibrary = null;
let savedModelRecords = listModelRecords();
refreshStartingModelSelect();
let pendingDefaultModelRecord = resolveDefaultModelRecord(savedModelRecords);
let defaultModelRecordId = pendingDefaultModelRecord?.id ?? null;
let defaultModelSpawnedForStage = false;
let activeStageId = DEFAULT_STAGE_ID;
let queuedStageId = DEFAULT_STAGE_ID;
let workerReady = false;
let physicsRunning = false;
let sharedStateEnabled = false;
let lastHeightLog = 0;
let sensorLogTimestamp = 0;
let evolutionAbortController = null;
let physicsWorker = null;
let viewer = null;
let viewControls = null;
let evolutionPanel = null;

const defaultModelPromise = seedDefaultModelIfNeeded();
const prefabSeedPromise = seedAdditionalPrefabs();
defaultModelPromise.then((record) => {
  if (!record) {
    return;
  }
  defaultModelRecordId = record.id ?? defaultModelRecordId;
  refreshModelLibrary(defaultModelRecordId);
  if (!defaultModelSpawnedForStage) {
    tryAddPendingDefaultModelToStage();
  }
});

prefabSeedPromise
  .then((changed) => {
    if (!changed) {
      return;
    }
    savedModelRecords = listModelRecords();
    refreshStartingModelSelect(defaultModelRecordId);
    if (modelLibrary) {
      modelLibrary.setModels(savedModelRecords);
      if (defaultModelRecordId) {
        modelLibrary.setSelectedId(defaultModelRecordId);
      }
    }
  })
  .catch((error) => {
    console.warn('Failed to seed prefab models:', error);
  });

function updatePreviewButtonState() {
  if (previewBestButton) {
    previewBestButton.disabled = !latestBestIndividual;
  }
  if (modelLibrary) {
    modelLibrary.setHasModelAvailable(Boolean(latestBestIndividual));
  }
}

function setLatestBestIndividual(individual) {
  latestBestIndividual = individual ? deepClone(individual) : null;
  updatePreviewButtonState();
}

function refreshStartingModelSelect(selectedId = undefined) {
  if (!startingModelSelect) {
    return;
  }
  const doc = startingModelSelect.ownerDocument ?? document;
  const previousValue =
    selectedId !== undefined ? selectedId ?? '' : startingModelSelect.value ?? '';
  startingModelSelect.innerHTML = '';

  const defaultOption = doc.createElement('option');
  defaultOption.value = '';
  defaultOption.textContent = 'Hopper (default)';
  startingModelSelect.append(defaultOption);

  savedModelRecords.forEach((record) => {
    if (!record || !record.id) {
      return;
    }
    const option = doc.createElement('option');
    option.value = record.id;
    option.textContent = typeof record.name === 'string' && record.name.trim()
      ? record.name.trim()
      : 'Saved model';
    startingModelSelect.append(option);
  });

  if (
    previousValue &&
    savedModelRecords.some((record) => record && record.id === previousValue)
  ) {
    startingModelSelect.value = previousValue;
  } else {
    startingModelSelect.value = '';
  }
}

function resolveStartingModel(modelId) {
  if (!modelId) {
    return {
      id: null,
      morph: null,
      controller: null
    };
  }
  const memoryRecord = savedModelRecords.find((entry) => entry && entry.id === modelId);
  const record = memoryRecord ?? loadModelRecord(modelId);
  if (!record || !record.individual) {
    return {
      id: null,
      morph: null,
      controller: null
    };
  }
  const individual = record.individual;
  if (!individual.morph || !individual.controller) {
    return {
      id: null,
      morph: null,
      controller: null
    };
  }
  return {
    id: record.id ?? modelId,
    morph: deepClone(individual.morph),
    controller: deepClone(individual.controller)
  };
}

updatePreviewButtonState();

function refreshModelLibrary(selectedId = null) {
  if (!modelLibrary) {
    return;
  }
  modelLibrary.setModels(savedModelRecords);
  if (selectedId) {
    modelLibrary.setSelectedId(selectedId);
  }
  refreshStartingModelSelect();
}

function addModelRecordToStage(record, { announce = false } = {}) {
  if (!record || !record.individual) {
    return false;
  }
  if (!physicsWorker || !workerReady) {
    return false;
  }
  const clone = deepClone(record.individual);
  if (!clone) {
    return false;
  }
  physicsWorker.postMessage({
    type: 'add-individual',
    individual: clone
  });
  if (announce) {
    const label = typeof record.name === 'string' && record.name.trim() ? record.name.trim() : 'model';
    updateStatus(`Loaded model "${label}" to the scene.`);
  }
  return true;
}

function tryAddPendingDefaultModelToStage() {
  if (defaultModelSpawnedForStage) {
    return;
  }
  if (!pendingDefaultModelRecord) {
    let candidate = null;
    if (defaultModelRecordId) {
      candidate = loadModelRecord(defaultModelRecordId);
    }
    if (!candidate) {
      candidate = resolveDefaultModelRecord(savedModelRecords);
    }
    if (candidate) {
      pendingDefaultModelRecord = candidate;
    }
  }
  if (!pendingDefaultModelRecord) {
    return;
  }
  const record = pendingDefaultModelRecord;
  if (addModelRecordToStage(record, { announce: true })) {
    defaultModelRecordId = record.id ?? defaultModelRecordId;
    pendingDefaultModelRecord = null;
    defaultModelSpawnedForStage = true;
  }
}

function resolveDefaultModelRecord(records = []) {
  if (!Array.isArray(records)) {
    return null;
  }
  const byId = records.find((entry) => entry && entry.id === DEFAULT_MODEL_ID);
  if (byId) {
    return deepClone(byId);
  }
  const lowerName = DEFAULT_MODEL_NAME.toLowerCase();
  const byName = records.find((entry) => {
    if (!entry || typeof entry.name !== 'string') {
      return false;
    }
    return entry.name.trim().toLowerCase() === lowerName;
  });
  return byName ? deepClone(byName) : null;
}

async function seedDefaultModelIfNeeded() {
  const existingRecord = resolveDefaultModelRecord(savedModelRecords);
  if (existingRecord) {
    if (!pendingDefaultModelRecord) {
      pendingDefaultModelRecord = deepClone(existingRecord);
    }
    defaultModelRecordId = existingRecord.id ?? defaultModelRecordId;
    return existingRecord;
  }
  try {
    const response = await fetch(DEFAULT_MODEL_URL);
    if (!response.ok) {
      throw new Error(`Request failed with status ${response.status}`);
    }
    const payload = await response.json();
    if (!payload || typeof payload !== 'object' || !payload.individual) {
      throw new Error('Default model payload missing individual data.');
    }
    const name =
      typeof payload.name === 'string' && payload.name.trim() ? payload.name.trim() : 'Default Model';
    const record = {
      id: typeof payload.id === 'string' && payload.id.trim() ? payload.id.trim() : undefined,
      name,
      individual: payload.individual,
      config: payload.config ?? null
    };
    const stored = saveModelRecord(record);
    if (stored) {
      savedModelRecords = listModelRecords();
      refreshStartingModelSelect();
      pendingDefaultModelRecord = deepClone(stored);
      defaultModelRecordId = stored.id ?? null;
      return stored;
    }
    pendingDefaultModelRecord = {
      id: record.id ?? null,
      name: record.name,
      individual: deepClone(record.individual),
      config: record.config ? deepClone(record.config) : null
    };
    defaultModelRecordId = pendingDefaultModelRecord.id;
    savedModelRecords = listModelRecords();
    refreshStartingModelSelect();
    return pendingDefaultModelRecord;
  } catch (error) {
    console.warn('Failed to load default model for the stage:', error);
    return null;
  }
}

async function seedAdditionalPrefabs() {
  const references = [
    {
      id: HOOMAN_MODEL_ID,
      name: HOOMAN_MODEL_NAME,
      url: HOOMAN_MODEL_URL
    },
    {
      id: QUAD_MODEL_ID,
      name: QUAD_MODEL_NAME,
      url: QUAD_MODEL_URL
    }
  ];
  let changed = false;
  for (const reference of references) {
    // Fetch and store each prefab if it's not already persisted.
    if (await seedPrefabModelIfMissing(reference)) {
      changed = true;
    }
  }
  return changed;
}

async function seedPrefabModelIfMissing(reference) {
  if (!reference || !reference.url) {
    return false;
  }
  const lowerName =
    typeof reference.name === 'string' && reference.name.trim()
      ? reference.name.trim().toLowerCase()
      : '';
  const existing = listModelRecords();
  const matched = existing.some((record) => {
    if (!record) {
      return false;
    }
    if (reference.id && record.id === reference.id) {
      return true;
    }
    if (lowerName && typeof record.name === 'string') {
      return record.name.trim().toLowerCase() === lowerName;
    }
    return false;
  });
  if (matched) {
    return false;
  }
  try {
    const response = await fetch(reference.url);
    if (!response.ok) {
      console.warn(
        `Failed to load prefab model ${reference.name ?? reference.id ?? reference.url} (status ${response.status}).`
      );
      return false;
    }
    const payload = await response.json();
    if (!payload || typeof payload !== 'object' || !payload.individual) {
      console.warn('Prefab model payload missing individual data.');
      return false;
    }
    const recordName =
      typeof reference.name === 'string' && reference.name.trim()
        ? reference.name.trim()
        : typeof payload.name === 'string' && payload.name.trim()
          ? payload.name.trim()
          : 'Prefab Model';
    const stored = saveModelRecord({
      id:
        typeof reference.id === 'string' && reference.id.trim() ? reference.id.trim() : payload.id ?? undefined,
      name: recordName,
      individual: payload.individual,
      config: payload.config ?? null
    });
    return Boolean(stored);
  } catch (error) {
    console.warn('Failed to seed prefab model:', error);
    return false;
  }
}

function loadStage(stageId, { announce = true } = {}) {
  const stage = getStageDefinition(stageId ?? activeStageId ?? DEFAULT_STAGE_ID);
  if (!stage) {
    return;
  }
  activeStageId = stage.id;
  queuedStageId = stage.id;
  if (viewControls) {
    viewControls.setStage(stage.id);
  }
  if (viewer) {
    viewer.setStage(stage.id);
  }
  if (announce) {
    updateStatus(`Loading ${stage.label} stage…`);
  }
  if (physicsWorker && workerReady) {
    physicsWorker.postMessage({ type: 'load-stage', stageId: stage.id });
  }
}

function clearStageModels() {
  if (!physicsWorker || !workerReady) {
    updateStatus('Physics worker is still initializing. Please try again once ready.');
    return;
  }
  updateStatus('Clearing models from the stage…');
  physicsWorker.postMessage({ type: 'clear-stage-models' });
}

function applyStageFromConfig(config, { announce = false } = {}) {
  if (!config) {
    return;
  }
  const stageId = config.stageId ?? DEFAULT_STAGE_ID;
  if (stageId !== activeStageId || viewer?.getStageId?.() !== stageId) {
    loadStage(stageId, { announce });
  } else if (viewControls) {
    viewControls.setStage(stageId);
    queuedStageId = stageId;
  }
}

function applyConfigToForm(config) {
  if (!config || !evolutionForm) {
    return;
  }
  refreshStartingModelSelect(config.startingModelId ?? undefined);
  const assign = (name, value) => {
    if (evolutionForm[name]) {
      evolutionForm[name].value = String(value ?? '');
    }
  };
  assign('startingModelId', config.startingModelId ?? '');
  assign('seed', config.seed ?? 42);
  assign('populationSize', config.populationSize ?? 12);
  assign('generations', config.generations ?? 10);
  assign('morphAddLimbChance', config.morphMutation?.addLimbChance ?? 0.35);
  assign('morphResizeChance', config.morphMutation?.resizeChance ?? 0.85);
  assign('morphJointJitterChance', config.morphMutation?.jointJitterChance ?? 0.65);
  assign('controllerWeightChance', config.controllerMutation?.weightJitterChance ?? 0.85);
  assign('controllerOscillatorChance', config.controllerMutation?.oscillatorChance ?? 0.6);
  assign('controllerAddConnectionChance', config.controllerMutation?.addConnectionChance ?? 0.45);
  const legacyObjectiveWeights = config.selectionObjective
    ? objectiveToSelectionWeights(config.selectionObjective)
    : null;
  const weights = resolveSelectionWeights(config.selectionWeights ?? legacyObjectiveWeights);
  assign('selectionWeightDistance', weights.distance);
  assign('selectionWeightSpeed', weights.speed);
  assign('selectionWeightUpright', weights.upright);
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

function applyGenerationUpdateBatch(entries) {
  if (!Array.isArray(entries) || entries.length === 0) {
    return;
  }

  const totalGenerations = activeRunTotalGenerations || activeRunConfig?.generations || 1;
  const viewerEntries = [];
  let latestEntry = null;
  let latestAbsoluteGeneration = 0;

  entries.forEach((entry) => {
    if (!entry) {
      return;
    }
    const absoluteGeneration = Number.isFinite(entry.absoluteGeneration)
      ? entry.absoluteGeneration
      : Number(entry.generation ?? 0);

    if (generationViewer) {
      const viewerEntry = buildGenerationViewerEntry(entry, absoluteGeneration);
      if (viewerEntry) {
        viewerEntries.push(viewerEntry);
      }
    }

    latestEntry = entry;
    latestAbsoluteGeneration = absoluteGeneration;
  });

  if (!latestEntry) {
    return;
  }

  if (generationViewer && viewerEntries.length > 0) {
    viewerEntries.forEach((viewerEntry) => {
      generationViewer.addGeneration(viewerEntry);
    });
  }

  if (latestEntry.bestIndividual) {
    setLatestBestIndividual(latestEntry.bestIndividual);
  }

  if (!evolutionPanel) {
    return;
  }

  const total = totalGenerations > 0 ? totalGenerations : 1;
  evolutionPanel.updateProgress({
    generation: Math.min(total, latestAbsoluteGeneration + 1),
    total
  });
  evolutionPanel.updateStats({
    generation: latestAbsoluteGeneration + 1,
    bestFitness: latestEntry.bestFitness,
    meanFitness: latestEntry.meanFitness
  });
}

const generationUpdateQueue = createUpdateQueue({
  intervalMs: DOM_UPDATE_INTERVAL_MS,
  flush: applyGenerationUpdateBatch
});

function handleGenerationUpdate(entry) {
  if (!entry) {
    return;
  }
  generationUpdateQueue.push(entry);
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
  generationUpdateQueue.flush({ force: true });
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

function resolveAbortedResumeState(config) {
  if (!config) {
    return null;
  }
  return resolveResumeState(persistedRunState, config);
}

function applySavedRunStateToUi(state) {
  if (!state) {
    generationViewer?.reset();
    setLatestBestIndividual(null);
    return;
  }
  if (state.config) {
    applyConfigToForm(state.config);
    applyStageFromConfig(state.config, { announce: false });
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

async function executeEvolutionRun({
  config,
  resumeState = null,
  resetStats = true,
  baseMorph = null,
  baseController = null
} = {}) {
  if (!config || evolutionAbortController) {
    return;
  }
  activeRunConfig = deepClone(config);
  activeRunTotalGenerations = config.generations;
  generationUpdateQueue.cancel();
  applyStageFromConfig(config, { announce: false });
  const selectionWeights = resolveSelectionWeights(
    config.selectionWeights ??
      (config.selectionObjective
        ? objectiveToSelectionWeights(config.selectionObjective)
        : DEFAULT_SELECTION_WEIGHTS)
  );
  if (resumeState) {
    if (persistedRunState && runConfigsMatch(persistedRunState.config, config)) {
      const runningState = {
        ...persistedRunState,
        status: 'running',
        updatedAt: Date.now()
      };
      saveRunState(runningState);
      persistedRunState = runningState;
    }
    generationViewer?.jumpToLatest({ silent: true });
  } else {
    clearRunState();
    persistedRunState = null;
    generationViewer?.reset();
    setLatestBestIndividual(null);
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
      selectionWeights,
      stageId: config.stageId ?? activeStageId,
      baseMorph: baseMorph ?? undefined,
      baseController: baseController ?? undefined,
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
    generationUpdateQueue.flush({ force: true });
    generationUpdateQueue.cancel();
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

viewer = createViewer(canvas);
viewControls = createViewControls({
  select: viewModeSelect,
  button: simulationToggleButton,
  stageSelect,
  stageButton: loadStageButton,
  stageClearButton: clearStageButton
});
const availableStages = listStages();
viewControls.setStages(availableStages);
viewControls.setStage(activeStageId);
if (viewer) {
  viewer.setStage(activeStageId);
}
const defaultStage = getStageDefinition(activeStageId);
queuedStageId = defaultStage.id;
viewControls.onStageLoad((stageId) => {
  loadStage(stageId);
});
viewControls.onStageClear(() => {
  clearStageModels();
});
loadStage(activeStageId, { announce: false });
evolutionPanel = createEvolutionPanel({
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

if (modelLibraryContainer) {
  modelLibrary = createModelLibrary({ container: modelLibraryContainer });
  modelLibrary.setHasModelAvailable(Boolean(latestBestIndividual));
  modelLibrary.setModels(savedModelRecords);
  if (defaultModelRecordId) {
    modelLibrary.setSelectedId(defaultModelRecordId);
  }
  modelLibrary.onSave((name) => {
    if (!latestBestIndividual) {
      updateStatus('No evolved individual to save yet.');
      return;
    }
    const sourceConfig = persistedRunState?.config
      ? deepClone(persistedRunState.config)
      : deepClone(evolutionPanel.getConfig());
    if (sourceConfig) {
      sourceConfig.stageId = activeStageId;
    }
    const record = saveModelRecord({
      name,
      individual: latestBestIndividual,
      config: sourceConfig ?? null
    });
    if (!record) {
      updateStatus('Failed to save model — local storage may be unavailable.');
      return;
    }
    savedModelRecords = listModelRecords();
    refreshStartingModelSelect();
    modelLibrary.setModels(savedModelRecords);
    modelLibrary.setSelectedId(record.id);
    modelLibrary.clearName();
    updateStatus(`Saved model "${record.name}".`);
  });
  modelLibrary.onAdd((id) => {
    const record = loadModelRecord(id);
    if (!record) {
      updateStatus('Unable to add the selected model.');
      return;
    }
    savedModelRecords = listModelRecords();
    refreshStartingModelSelect(id);
    modelLibrary.setModels(savedModelRecords);
    modelLibrary.setSelectedId(id);
    const clone = deepClone(record.individual);
    if (!clone) {
      updateStatus('Unable to prepare the selected model for adding.');
      return;
    }
    if (!physicsWorker || !workerReady) {
      updateStatus('Physics worker is not ready yet.');
      return;
    }
    physicsWorker.postMessage({
      type: 'add-individual',
      individual: clone
    });
    updateStatus(`Added model "${record.name}" to the scene.`);
  });
  modelLibrary.onExport((id) => {
    const record = savedModelRecords.find((entry) => entry.id === id) ?? loadModelRecord(id);
    if (!record) {
      updateStatus('Unable to export the selected model.');
      return;
    }
    const payload = {
      id: record.id,
      name: record.name,
      createdAt: record.createdAt ?? null,
      updatedAt: record.updatedAt ?? null,
      config: record.config ?? null,
      individual: record.individual ?? null
    };
    const json = JSON.stringify(payload, null, 2);
    copyTextToClipboard(json)
      .then((success) => {
        if (success) {
          updateStatus('Model copied to clipboard');
        } else {
          updateStatus('Unable to copy model to clipboard.');
        }
      })
      .catch(() => {
        updateStatus('Unable to copy model to clipboard.');
      });
  });
  modelLibrary.onDelete((id) => {
    const record = savedModelRecords.find((entry) => entry.id === id) ?? loadModelRecord(id);
    const label = record?.name ?? 'saved model';
    let confirmed = true;
    if (typeof window !== 'undefined' && typeof window.confirm === 'function') {
      confirmed = window.confirm(`Delete ${label}? This action cannot be undone.`);
    }
    if (!confirmed) {
      return;
    }
    if (!deleteModelRecord(id)) {
      updateStatus('Failed to delete the selected model.');
      return;
    }
    savedModelRecords = listModelRecords();
    refreshStartingModelSelect();
    modelLibrary.setModels(savedModelRecords);
    modelLibrary.setHasModelAvailable(Boolean(latestBestIndividual));
    updateStatus(`Deleted model "${label}".`);
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

physicsWorker = new Worker(new URL('../workers/physics.worker.js', import.meta.url), {
  type: 'module'
});

if (previewBestButton) {
  previewBestButton.addEventListener('click', () => {
    previewIndividual(latestBestIndividual, {
      message: 'Previewing best individual in physics viewer…'
    });
  });
}

if (resetAllButton) {
  resetAllButton.addEventListener('click', handleResetAllClick);
}

function updateStatus(message) {
  const value = message === undefined || message === null ? '' : String(message);
  if (value === statusTextCache) {
    return;
  }
  statusUpdateQueue.push(value);
}

function handleResetAllClick() {
  const message =
    'Reset all saved data and reload the page? This clears local storage for Neuromorphs.';
  if (!window.confirm(message)) {
    return;
  }
  try {
    localStorage.clear();
  } catch (error) {
    console.warn('Failed to clear localStorage during reset.', error);
  }
  updateStatus('All saved data cleared. Reloading…');
  statusUpdateQueue.flush({ force: true });
  window.location.reload();
}

function copyTextToClipboard(text) {
  if (typeof navigator !== 'undefined' && navigator.clipboard && navigator.clipboard.writeText) {
    return navigator.clipboard
      .writeText(text)
      .then(() => true)
      .catch(() => false);
  }
  if (typeof document === 'undefined') {
    return Promise.resolve(false);
  }
  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.setAttribute('readonly', '');
  textarea.style.position = 'absolute';
  textarea.style.left = '-9999px';
  document.body.append(textarea);
  const selection = document.getSelection();
  let originalRange = null;
  if (selection && selection.rangeCount > 0) {
    originalRange = selection.getRangeAt(0);
  }
  textarea.select();
  let successful = false;
  try {
    successful = document.execCommand('copy');
  } catch (_error) {
    successful = false;
  }
  if (selection) {
    selection.removeAllRanges();
    if (originalRange) {
      selection.addRange(originalRange);
    }
  }
  textarea.remove();
  return Promise.resolve(successful);
}

function setPhysicsRunning(next) {
  physicsRunning = Boolean(next);
  if (viewControls) {
    viewControls.setSimulationRunning(physicsRunning);
  }
}

function previewIndividual(individual, { message } = {}) {
  if (!individual) {
    updateStatus('No evolved individual available for preview yet.');
    return;
  }
  if (!physicsWorker || !workerReady) {
    updateStatus('Physics worker is still initializing. Please try again once ready.');
    return;
  }
  const clone = deepClone(individual);
  if (!clone) {
    updateStatus('Unable to prepare the individual for preview.');
    return;
  }
  if (message) {
    updateStatus(message);
  }
  physicsWorker.postMessage({
    type: 'preview-individual',
    individual: clone
  });
}

viewControls.onSimulationToggle(() => {
  if (!physicsWorker || !workerReady) {
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
    updateStatus('Physics worker ready. Streaming catdog morph simulation…');
    if (queuedStageId) {
      physicsWorker.postMessage({ type: 'load-stage', stageId: queuedStageId });
    }
    physicsWorker.postMessage({ type: 'start' });
  } else if (data.type === 'shared-state') {
    viewer.applySharedLayout(data.layout);
    if (data.buffer instanceof SharedArrayBuffer) {
      viewer.setSharedStateBuffer(data.buffer, data.layout);
      sharedStateEnabled = true;
      updateStatus('Shared memory bridge established. Catdog pose updates are live.');
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
          : 'Simulation paused. Resume to continue the catdog test.'
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
      updateStatus('Shared memory synchronized. Catdog pose streaming from worker.');
    }
    if (data.sensors?.summary && typeof data.timestamp === 'number') {
      if (data.timestamp - sensorLogTimestamp >= 500) {
        const summary = data.sensors.summary;
        const height = Number(summary.rootHeight ?? 0).toFixed(3);
        const contact = summary.footContact ? 'yes' : 'no';
        const angle = Number(summary.primaryJointAngle ?? 0).toFixed(3);
        const objectiveDistance = Number(summary.objectiveDistance ?? 0).toFixed(3);
        console.info(
          '[Sensors] height=%sm, contact=%s, jointAngle=%srad, objectiveDistance=%sm',
          height,
          contact,
          angle,
          objectiveDistance
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
  } else if (data.type === 'stage-loaded') {
    const stage = getStageDefinition(data.stageId ?? activeStageId);
    activeStageId = stage.id;
    queuedStageId = stage.id;
    if (viewControls) {
      viewControls.setStage(stage.id);
    }
    if (viewer) {
      viewer.setStage(stage.id);
    }
    const label = stage.label ?? stage.id;
    updateStatus(`${label} stage ready. Simulation reset.`);
    defaultModelSpawnedForStage = false;
    tryAddPendingDefaultModelToStage();
  } else if (data.type === 'stage-cleared') {
    updateStatus('Cleared all models from the stage.');
  } else if (data.type === 'stage-error') {
    console.error('Stage load failed:', data.message);
    updateStatus('Unable to load the requested stage.');
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
  const startingModel = resolveStartingModel(config.startingModelId);
  if (config.startingModelId && !startingModel.id) {
    updateStatus('Selected starting model unavailable. Using Hopper baseline.');
  }
  config.startingModelId = startingModel.id;
  refreshStartingModelSelect(startingModel.id ?? undefined);
  const runConfig = { ...config, stageId: activeStageId };
  const resumeState = resolveAbortedResumeState(runConfig);
  if (resumeState) {
    updateStatus('Resuming aborted evolution run…');
  } else if (
    persistedRunState?.status === 'aborted' &&
    persistedRunState.config &&
    !runConfigsMatch(persistedRunState.config, runConfig)
  ) {
    updateStatus('Starting a new evolution run. Previous progress will be cleared.');
  }
  executeEvolutionRun({
    config: runConfig,
    resumeState: resumeState ?? null,
    resetStats: !resumeState,
    baseMorph: startingModel.morph,
    baseController: startingModel.controller
  });
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
  },
  stages: {
    list() {
      return listStages();
    },
    getActiveId() {
      return activeStageId;
    },
    getActiveDefinition() {
      return getStageDefinition(activeStageId);
    },
    load(stageId, options) {
      const stage = getStageDefinition(stageId ?? activeStageId);
      loadStage(stage.id, options);
      return stage;
    }
  }
};

if (typeof window !== 'undefined') {
  const target = window.Neuromorphs ? { ...window.Neuromorphs } : {};
  target.replays = neuromorphsApi.replays;
  target.runs = neuromorphsApi.runs;
  target.stages = neuromorphsApi.stages;
  window.Neuromorphs = target;
}
