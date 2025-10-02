import { runEvolution } from '../public/evolution/evolutionEngine.js';
import { simulateLocomotion } from '../public/evolution/simulator.js';
import {
  computeLocomotionFitness,
  resolveSelectionWeights,
  scoreLocomotionWithWeights
} from '../public/evolution/fitness.js';
import { createRng } from '../public/evolution/rng.js';
import { DEFAULT_STAGE_ID } from '../public/environment/stages.js';

const activeRuns = new Map();

function createAbortError() {
  try {
    return new DOMException('Evolution aborted', 'AbortError');
  } catch (_error) {
    const fallback = new Error('Evolution aborted');
    fallback.name = 'AbortError';
    return fallback;
  }
}

function serializeError(error) {
  if (!error || typeof error !== 'object') {
    return {
      message: error ? String(error) : 'Unknown error',
      name: 'Error'
    };
  }
  return {
    message: error.message ?? 'Unknown error',
    name: error.name ?? 'Error',
    stack: error.stack ?? null
  };
}

self.addEventListener('message', async (event) => {
  const data = event.data;
  if (!data || typeof data !== 'object') {
    return;
  }
  if (data.type === 'abort') {
    const controller = activeRuns.get(data.id);
    if (controller && !controller.signal.aborted) {
      controller.abort(createAbortError());
    }
    return;
  }
  if (data.type !== 'start') {
    return;
  }

  const {
    id,
    payload
  } = data;

  if (!id || !payload) {
    return;
  }

  const {
    initialPopulation,
    generations,
    elitism,
    tournamentSize,
    mutationConfig,
    rngSeed,
    rngState,
    startGeneration,
    history,
    simulation,
    selectionWeights
  } = payload;

  const controller = new AbortController();
  activeRuns.set(id, controller);

  const evalRng = createRng(rngState ?? rngSeed ?? 1);
  const weights = resolveSelectionWeights(selectionWeights);

  try {
    const result = await runEvolution({
      initialPopulation,
      generations,
      elitism,
      tournamentSize,
      mutationConfig,
      rng: evalRng,
      signal: controller.signal,
      logger: console,
      startGeneration,
      history,
      onGeneration: (entry) => {
        self.postMessage({
          type: 'generation',
          id,
          payload: entry
        });
      },
      onStateSnapshot: (snapshot) => {
        self.postMessage({
          type: 'snapshot',
          id,
          payload: snapshot
        });
      },
      evaluate: async (individual) => {
        const simulationResult = await simulateLocomotion({
          morphGenome: individual.morph,
          controllerGenome: individual.controller,
          duration: simulation?.duration,
          timestep: simulation?.timestep,
          sampleInterval: simulation?.sampleInterval,
          signal: controller.signal,
          stageId: simulation?.stageId ?? DEFAULT_STAGE_ID
        });
        const metrics = computeLocomotionFitness(simulationResult.trace);
        const fitnessScore = scoreLocomotionWithWeights(metrics, weights);
        return {
          fitness: fitnessScore,
          metrics,
          extras: {
            trace: simulationResult.trace,
            runtime: simulationResult.runtime
          }
        };
      }
    });

    self.postMessage({
      type: 'complete',
      id,
      payload: result
    });
  } catch (error) {
    const isAbort = controller.signal.aborted || error?.name === 'AbortError';
    self.postMessage({
      type: isAbort ? 'aborted' : 'error',
      id,
      payload: serializeError(error)
    });
  } finally {
    activeRuns.delete(id);
  }
});
