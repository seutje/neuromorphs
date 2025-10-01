import { createDefaultMorphGenome } from '../../genomes/morphGenome.js';
import { createDefaultControllerGenome } from '../../genomes/ctrlGenome.js';
import { createRng, splitRng } from './rng.js';
import { mutateMorphGenome, mutateControllerGenome } from './mutation.js';
import { computeLocomotionFitness } from './fitness.js';
import { runEvolution } from './evolutionEngine.js';

function buildInitialPopulation({ populationSize, baseMorph, baseController, rng }) {
  return Array.from({ length: populationSize }, (_, index) => {
    const morph = mutateMorphGenome(baseMorph, splitRng(rng, `init-morph-${index}`)).genome;
    const controller = mutateControllerGenome(
      baseController,
      splitRng(rng, `init-ctrl-${index}`)
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
  const config = {
    seed: 42,
    generations: 10,
    populationSize: 12,
    elitism: 2,
    tournamentSize: 3,
    ...options
  };
  const rng = createRng(config.seed);
  const baseMorph = createDefaultMorphGenome();
  const baseController = createDefaultControllerGenome();
  const initialPopulation = buildInitialPopulation({
    populationSize: config.populationSize,
    baseMorph,
    baseController,
    rng
  });

  const result = await runEvolution({
    initialPopulation,
    generations: config.generations,
    elitism: config.elitism,
    tournamentSize: config.tournamentSize,
    rng,
    evaluate: async (individual, context) => {
      const evalTrace = createSyntheticTrace(individual, context.rng);
      const metrics = computeLocomotionFitness(evalTrace);
      return {
        fitness: metrics.fitness,
        metrics
      };
    }
  });

  return result;
}

export function startDemoOnLoad() {
  runEvolutionDemo()
    .then((result) => {
      const final = result.history[result.history.length - 1];
      if (!final) {
        return;
      }
      const bestFitness = Number(final.bestFitness ?? 0).toFixed(3);
      const meanFitness = Number(final.meanFitness ?? 0).toFixed(3);
      console.info(
        `[EA Demo] generations=${result.history.length} bestFitness=${bestFitness} meanFitness=${meanFitness}`
      );
    })
    .catch((error) => {
      console.warn('Evolution demo failed:', error);
    });
}
