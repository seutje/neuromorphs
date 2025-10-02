import { DEFAULT_SELECTION_WEIGHTS, resolveSelectionWeights } from '../evolution/fitness.js';

function clamp01(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    return 0;
  }
  return Math.min(Math.max(number, 0), 1);
}

function parseInteger(value, fallback) {
  const number = Number.parseInt(value, 10);
  return Number.isFinite(number) ? number : fallback;
}

function parseFloatValue(value, fallback) {
  const number = Number.parseFloat(value);
  return Number.isFinite(number) ? number : fallback;
}

function parseWeight(value, fallback) {
  const number = Number.parseFloat(value);
  if (!Number.isFinite(number)) {
    return Math.max(fallback, 0);
  }
  return Math.max(number, 0);
}

export function createEvolutionPanel({
  form,
  button,
  progress,
  stats
} = {}) {
  if (!form) {
    throw new Error('createEvolutionPanel requires a configuration form.');
  }
  if (!button) {
    throw new Error('createEvolutionPanel requires a start button.');
  }
  if (!progress) {
    throw new Error('createEvolutionPanel requires a progress element.');
  }

  const generationNode = stats?.generation ?? document.querySelector('#stat-generation');
  const bestNode = stats?.best ?? document.querySelector('#stat-best');
  const meanNode = stats?.mean ?? document.querySelector('#stat-mean');

  const inputs = Array.from(form.querySelectorAll('input, select'));
  let running = false;
  let currentGeneration = 0;
  let generationTarget = 1;

  const startListeners = new Set();
  const stopListeners = new Set();

  button.addEventListener('click', () => {
    if (running) {
      stopListeners.forEach((listener) => listener());
    } else {
      startListeners.forEach((listener) => listener(getConfig()));
    }
  });

  function getConfig() {
    return {
      seed: parseInteger(form.seed?.value, 42),
      populationSize: Math.max(4, parseInteger(form.populationSize?.value, 12)),
      generations: Math.max(1, parseInteger(form.generations?.value, 10)),
      selectionWeights: resolveSelectionWeights({
        distance: parseWeight(
          form.selectionWeightDistance?.value,
          DEFAULT_SELECTION_WEIGHTS.distance
        ),
        speed: parseWeight(
          form.selectionWeightSpeed?.value,
          DEFAULT_SELECTION_WEIGHTS.speed
        ),
        upright: parseWeight(
          form.selectionWeightUpright?.value,
          DEFAULT_SELECTION_WEIGHTS.upright
        )
      }),
      morphMutation: {
        addLimbChance: clamp01(parseFloatValue(form.morphAddLimbChance?.value, 0.35)),
        resizeChance: clamp01(parseFloatValue(form.morphResizeChance?.value, 0.85)),
        jointJitterChance: clamp01(parseFloatValue(form.morphJointJitterChance?.value, 0.65))
      },
      controllerMutation: {
        weightJitterChance: clamp01(
          parseFloatValue(form.controllerWeightChance?.value, 0.85)
        ),
        oscillatorChance: clamp01(parseFloatValue(form.controllerOscillatorChance?.value, 0.6)),
        addConnectionChance: clamp01(
          parseFloatValue(form.controllerAddConnectionChance?.value, 0.45)
        )
      }
    };
  }

  function setRunning(next) {
    running = Boolean(next);
    button.textContent = running ? 'Stop Evolution' : 'Start Evolution';
    button.disabled = false;
    inputs.forEach((input) => {
      input.disabled = running;
    });
    form.classList.toggle('is-running', running);
  }

  function updateProgress({ generation = 0, total = generationTarget }) {
    generationTarget = Math.max(1, total);
    currentGeneration = Math.max(0, generation);
    progress.max = generationTarget;
    progress.value = Math.min(generationTarget, currentGeneration);
  }

  function resetStats() {
    if (generationNode) {
      generationNode.textContent = '—';
    }
    if (bestNode) {
      bestNode.textContent = '—';
    }
    if (meanNode) {
      meanNode.textContent = '—';
    }
    progress.value = 0;
    currentGeneration = 0;
  }

  function updateStats({ generation, bestFitness, meanFitness }) {
    if (generationNode) {
      generationNode.textContent = Number.isFinite(generation) ? `${generation}` : '—';
    }
    if (bestNode) {
      const formatted = Number.isFinite(bestFitness) ? bestFitness.toFixed(3) : '—';
      bestNode.textContent = formatted;
    }
    if (meanNode) {
      const formatted = Number.isFinite(meanFitness) ? meanFitness.toFixed(3) : '—';
      meanNode.textContent = formatted;
    }
  }

  return {
    onStart(callback) {
      if (typeof callback === 'function') {
        startListeners.add(callback);
      }
      return () => startListeners.delete(callback);
    },
    onStop(callback) {
      if (typeof callback === 'function') {
        stopListeners.add(callback);
      }
      return () => stopListeners.delete(callback);
    },
    setRunning,
    updateProgress,
    updateStats,
    resetStats,
    getConfig,
    isRunning() {
      return running;
    }
  };
}
