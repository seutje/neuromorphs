import { createViewer } from './render/viewer.js';
import { createViewControls } from './ui/viewControls.js';
import { createEvolutionPanel } from './ui/evolutionPanel.js';
import { runEvolutionDemo } from './evolution/demo.js';

const canvas = document.querySelector('#viewport');
const statusMessage = document.querySelector('#status-message');
const viewModeSelect = document.querySelector('#view-mode');
const simulationToggleButton = document.querySelector('#simulation-toggle');
const evolutionForm = document.querySelector('#evolution-config');
const evolutionStartButton = document.querySelector('#evolution-start');
const evolutionProgress = document.querySelector('#evolution-progress');
const statGeneration = document.querySelector('#stat-generation');
const statBest = document.querySelector('#stat-best');
const statMean = document.querySelector('#stat-mean');

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

viewControls.setViewMode(viewControls.getViewMode());
viewControls.onViewModeChange((mode) => viewer.setViewMode(mode));

if (simulationToggleButton) {
  simulationToggleButton.disabled = true;
}

const physicsWorker = new Worker(new URL('../workers/physics.worker.js', import.meta.url), {
  type: 'module'
});

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
  } else if (data.type === 'error') {
    console.error('Physics worker failed to initialize:', data.message);
    updateStatus('Physics worker failed to start. Check the console for details.');
    if (simulationToggleButton) {
      simulationToggleButton.disabled = true;
    }
  }
});

evolutionPanel.onStart(async (config) => {
  if (evolutionAbortController) {
    return;
  }
  evolutionPanel.resetStats();
  evolutionPanel.updateProgress({ generation: 0, total: config.generations });
  evolutionPanel.setRunning(true);
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
      signal: controller.signal,
      onGeneration: (entry) => {
        evolutionPanel.updateProgress({
          generation: entry.generation + 1,
          total: config.generations
        });
        evolutionPanel.updateStats({
          generation: entry.generation + 1,
          bestFitness: entry.bestFitness,
          meanFitness: entry.meanFitness
        });
      }
    });
  } catch (error) {
    if (error?.name === 'AbortError') {
      console.info('Evolution run aborted by user.');
    } else {
      console.warn('Evolution run failed:', error);
    }
  } finally {
    evolutionPanel.setRunning(false);
    evolutionAbortController = null;
  }
});

evolutionPanel.onStop(() => {
  if (evolutionAbortController) {
    evolutionAbortController.abort();
  }
});
