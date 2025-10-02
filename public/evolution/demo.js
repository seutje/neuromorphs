import { createDefaultMorphGenome } from '../../genomes/morphGenome.js';
import { createDefaultControllerGenome } from '../../genomes/ctrlGenome.js';
import { createRng, splitRng } from './rng.js';
import { mutateMorphGenome, mutateControllerGenome } from './mutation.js';
import { runEvolutionInWorker } from './evolutionWorkerClient.js';

function cloneValue(value) {
  return JSON.parse(JSON.stringify(value));
}

function buildInitialPopulation({
  populationSize,
  baseMorph,
  baseController,
  rng,
  mutationConfig
}) {
  return Array.from({ length: populationSize }, (_, index) => {
    const morph = mutateMorphGenome(
      baseMorph,
      splitRng(rng, `init-morph-${index}`),
      mutationConfig?.morph
    ).genome;
    const controller = mutateControllerGenome(
      baseController,
      splitRng(rng, `init-ctrl-${index}`),
      mutationConfig?.controller
    ).genome;
    return {
      id: `demo-${index}`,
      morph,
      controller
    };
  });
}

export async function runEvolutionDemo(options = {}) {
  const {
    seed = 42,
    generations = 10,
    populationSize = 12,
    elitism = 2,
    tournamentSize = 3,
    mutationConfig: overrideMutationConfig,
    morphMutation,
    controllerMutation,
    signal,
    onGeneration,
    onComplete,
    onStateSnapshot,
    resume,
    logger = console,
    simulationDuration = 60,
    simulationTimestep = 1 / 60,
    simulationSampleInterval = 1 / 30
  } = options;

  const mutationConfig = {
    morph: overrideMutationConfig?.morph ?? morphMutation ?? {},
    controller: overrideMutationConfig?.controller ?? controllerMutation ?? {}
  };

  const resumeState = resume ?? options.resumeState ?? null;
  const resumeGeneration = Math.max(0, Math.floor(resumeState?.generation ?? 0));
  const resumeHistory = Array.isArray(resumeState?.history) ? resumeState.history : [];
  const totalGenerations = Math.max(0, generations);
  const remainingGenerations = Math.max(0, totalGenerations - resumeGeneration);

  const rng = createRng(resumeState?.rngState ?? seed);
  const baseMorph = options.baseMorph ?? createDefaultMorphGenome();
  const baseController = options.baseController ?? createDefaultControllerGenome();

  const initialPopulation = Array.isArray(resumeState?.population) && resumeState.population.length
    ? resumeState.population.map((individual) => cloneValue(individual))
    : buildInitialPopulation({
        populationSize,
        baseMorph,
        baseController,
        rng,
        mutationConfig
      });

  if (resumeGeneration > 0 && Array.isArray(resumeHistory) && typeof onGeneration === 'function') {
    resumeHistory.forEach((entry, index) => {
      if (!entry) {
        return;
      }
      onGeneration({
        generation: index,
        absoluteGeneration: entry.generation ?? index,
        bestFitness: entry.bestFitness,
        meanFitness: entry.meanFitness,
        bestIndividual: entry.bestIndividual,
        replayed: true,
        evaluated: entry.evaluated ?? []
      });
    });
  }

  if (remainingGenerations === 0) {
    const result = {
      history: resumeHistory,
      population: initialPopulation,
      best: resumeHistory[resumeHistory.length - 1]?.bestIndividual ?? null,
      rngState: typeof rng.serialize === 'function' ? rng.serialize() : null
    };
    if (typeof onComplete === 'function') {
      onComplete(result);
    }
    return result;
  }

  const rngState = typeof rng.serialize === 'function' ? rng.serialize() : null;

  const result = await runEvolutionInWorker({
    initialPopulation,
    generations: remainingGenerations,
    elitism,
    tournamentSize,
    mutationConfig,
    rngState,
    seed,
    signal,
    onGeneration,
    onStateSnapshot,
    startGeneration: resumeGeneration,
    history: resumeHistory,
    simulation: {
      duration: simulationDuration,
      timestep: simulationTimestep,
      sampleInterval: simulationSampleInterval
    }
  });

  if (typeof onComplete === 'function') {
    onComplete(result);
  }

  return result;
}
