import { createDefaultMorphGenome } from '../../genomes/morphGenome.js';
import { createDefaultControllerGenome } from '../../genomes/ctrlGenome.js';
import { createRng, splitRng } from './rng.js';
import { mutateMorphGenome, mutateControllerGenome } from './mutation.js';
import { computeLocomotionFitness } from './fitness.js';
import { runEvolution } from './evolutionEngine.js';

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

function createSyntheticTrace(individual, rng, steps = 30) {
  const oscillator = individual.controller.nodes.find((node) => node.type === 'oscillator');
  const amplitude = Math.max(Math.abs(oscillator?.amplitude ?? 0.7), 0.1);
  const frequency = Math.max(Math.abs(oscillator?.frequency ?? 1.2), 0.1);
  const limbs = Math.max(1, individual.morph.bodies.length - 1);
  const strideGain = limbs * amplitude * frequency * 0.05;
  let displacement = 0;
  const samples = [];
  for (let step = 0; step <= steps; step += 1) {
    const t = step / steps;
    displacement += strideGain + rng.range(-0.004, 0.004);
    const heightBase = 0.75 + amplitude * 0.12;
    samples.push({
      timestamp: t,
      centerOfMass: { x: displacement, y: heightBase, z: 0 },
      rootHeight: heightBase - Math.abs(Math.sin(t * Math.PI * frequency)) * 0.1
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
    logger = console
  } = options;

  const mutationConfig = {
    morph: overrideMutationConfig?.morph ?? morphMutation ?? {},
    controller: overrideMutationConfig?.controller ?? controllerMutation ?? {}
  };

  const rng = createRng(seed);
  const baseMorph = options.baseMorph ?? createDefaultMorphGenome();
  const baseController = options.baseController ?? createDefaultControllerGenome();
  const initialPopulation = buildInitialPopulation({
    populationSize,
    baseMorph,
    baseController,
    rng,
    mutationConfig
  });

  const result = await runEvolution({
    initialPopulation,
    generations,
    elitism,
    tournamentSize,
    rng,
    mutationConfig,
    signal,
    logger,
    onGeneration,
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
