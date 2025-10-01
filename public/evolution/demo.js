import { createDefaultMorphGenome } from '../../genomes/morphGenome.js';
import { createDefaultControllerGenome } from '../../genomes/ctrlGenome.js';
import { createRng, splitRng } from './rng.js';
import { mutateMorphGenome, mutateControllerGenome } from './mutation.js';
import { computeLocomotionFitness } from './fitness.js';
import { runEvolution } from './evolutionEngine.js';

function cloneValue(value) {
  return JSON.parse(JSON.stringify(value));
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
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

export function createSyntheticTrace(individual, rng, steps = 30) {
  const oscillator = individual.controller.nodes.find((node) => node.type === 'oscillator');
  const amplitude = clamp(Math.abs(oscillator?.amplitude ?? 0.7), 0.1, 1.5);
  const frequency = clamp(Math.abs(oscillator?.frequency ?? 1.2), 0.1, 2.5);

  const limbCount = Math.max(1, individual.morph.bodies.length - 1);
  const effectiveLimbs = clamp(limbCount, 1, 6);

  const stepDuration = 1 / Math.max(1, steps);
  const strideLength = 0.18 + amplitude * 0.22 + (effectiveLimbs - 1) * 0.03;
  const baseSpeed = strideLength * frequency;
  const maxSpeed = 2.6; // meters per second observed from recorded physics runs
  const strideGain = Math.min(baseSpeed, maxSpeed) * stepDuration;

  let displacement = 0;
  const samples = [];
  for (let step = 0; step <= steps; step += 1) {
    const t = step * stepDuration;
    const noise = rng.range(-0.015, 0.015) * stepDuration;
    displacement += strideGain + noise;
    const heightBase = 0.7 + amplitude * 0.1;
    const rootHeightOscillation = Math.abs(Math.sin(t * Math.PI * frequency)) * 0.12;
    const rootHeight = Math.max(0.25, heightBase - rootHeightOscillation);
    samples.push({
      timestamp: t,
      centerOfMass: { x: displacement, y: heightBase, z: 0 },
      rootHeight
    });
  }
  return samples;
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
    logger = console
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

  const result = await runEvolution({
    initialPopulation,
    generations: remainingGenerations,
    elitism,
    tournamentSize,
    rng,
    mutationConfig,
    signal,
    logger,
    onGeneration,
    onStateSnapshot,
    startGeneration: resumeGeneration,
    history: resumeHistory,
    evaluate: async (individual, context) => {
      const evalTrace = createSyntheticTrace(individual, context.rng);
      const metrics = computeLocomotionFitness(evalTrace);
      return {
        fitness: metrics.fitness,
        metrics
      };
    }
  });

  if (typeof onComplete === 'function') {
    onComplete(result);
  }

  return result;
}
