import { createDefaultMorphGenome, validateMorphGenome } from '../genomes/morphGenome.js';
import { createDefaultControllerGenome, validateControllerGenome } from '../genomes/ctrlGenome.js';
import { mutateMorphGenome, mutateControllerGenome } from '../public/evolution/mutation.js';
import { createRng } from '../public/evolution/rng.js';
import { computeLocomotionFitness } from '../public/evolution/fitness.js';
import { runEvolution } from '../public/evolution/evolutionEngine.js';
import { createSyntheticTrace } from '../public/evolution/demo.js';

describe('createSyntheticTrace', () => {
  it('caps extreme oscillator parameters to plausible displacement', () => {
    const individual = {
      morph: { bodies: Array.from({ length: 10 }, () => ({})) },
      controller: {
        nodes: [
          { type: 'oscillator', amplitude: 50, frequency: 40 },
          { type: 'bias' }
        ]
      }
    };
    const rng = createRng(7);
    const steps = 60;

    const trace = createSyntheticTrace(individual, rng, steps);

    expect(trace).toHaveLength(steps + 1);
    const finalSample = trace[trace.length - 1];
    expect(finalSample.timestamp).toBeCloseTo(1, 5);
    expect(finalSample.centerOfMass.x).toBeLessThanOrEqual(2.65);

    const segmentSpeeds = trace.slice(1).map((sample, index) => {
      const prev = trace[index];
      const deltaTime = sample.timestamp - prev.timestamp;
      return deltaTime > 0 ? (sample.centerOfMass.x - prev.centerOfMass.x) / deltaTime : 0;
    });
    expect(Math.max(...segmentSpeeds)).toBeLessThanOrEqual(2.63);
  });
});

describe('morph genome mutations', () => {
  it('produces schema-valid variants with recorded operations', () => {
    const base = createDefaultMorphGenome();
    const rng = createRng(123);

    const { genome, operations } = mutateMorphGenome(base, rng);
    const { valid, errors } = validateMorphGenome(genome);

    expect(valid).toBe(true);
    expect(errors).toHaveLength(0);
    expect(operations.length).toBeGreaterThan(0);
    expect(genome).not.toBe(base);
    expect(JSON.stringify(genome)).not.toEqual(JSON.stringify(base));
  });
});

describe('controller genome mutations', () => {
  it('jitter weights and topology while preserving validity', () => {
    const base = createDefaultControllerGenome();
    const rng = createRng(987);

    const { genome, operations } = mutateControllerGenome(base, rng);
    const { valid, errors } = validateControllerGenome(genome);

    expect(valid).toBe(true);
    expect(errors).toHaveLength(0);
    expect(operations.length).toBeGreaterThan(0);
    expect(JSON.stringify(genome)).not.toEqual(JSON.stringify(base));
  });
});

describe('computeLocomotionFitness', () => {
  it('rewards greater horizontal displacement and penalizes falls', () => {
    const slowTrace = Array.from({ length: 6 }, (_, index) => ({
      timestamp: index * 0.5,
      centerOfMass: { x: index * 0.05, y: 0.8, z: 0 },
      rootHeight: 0.8
    }));
    const fastTrace = Array.from({ length: 6 }, (_, index) => ({
      timestamp: index * 0.5,
      centerOfMass: { x: index * 0.12, y: 0.9, z: 0 },
      rootHeight: 0.9
    }));

    const slowFitness = computeLocomotionFitness(slowTrace);
    const fastFitness = computeLocomotionFitness(fastTrace);

    expect(fastFitness.displacement).toBeGreaterThan(slowFitness.displacement);
    expect(fastFitness.fitness).toBeGreaterThan(slowFitness.fitness);
  });

  it('adds an objective reward when moving closer to the target cube', () => {
    const towardObjective = [
      { timestamp: 0, centerOfMass: { x: 0, y: 0.8, z: 0 }, rootHeight: 0.8 },
      { timestamp: 1, centerOfMass: { x: 6.5, y: 0.82, z: 0 }, rootHeight: 0.82 }
    ];
    const awayFromObjective = [
      { timestamp: 0, centerOfMass: { x: 0, y: 0.8, z: 0 }, rootHeight: 0.8 },
      { timestamp: 1, centerOfMass: { x: -6.5, y: 0.82, z: 0 }, rootHeight: 0.82 }
    ];

    const towardFitness = computeLocomotionFitness(towardObjective);
    const awayFitness = computeLocomotionFitness(awayFromObjective);

    expect(towardFitness.displacement).toBeCloseTo(awayFitness.displacement, 5);
    expect(towardFitness.objectiveReward).toBeGreaterThan(awayFitness.objectiveReward);
    expect(towardFitness.fitness).toBeGreaterThan(awayFitness.fitness);
  });

  it('detects prolonged loss of upright height even without ground contact', () => {
    const trace = [
      { timestamp: 0, centerOfMass: { x: 0, y: 0.8, z: 0 }, rootHeight: 0.8 },
      { timestamp: 0.5, centerOfMass: { x: 0.1, y: 0.78, z: 0 }, rootHeight: 0.78 },
      { timestamp: 1.0, centerOfMass: { x: 0.2, y: 0.76, z: 0 }, rootHeight: 0.76 },
      { timestamp: 1.5, centerOfMass: { x: 0.3, y: 0.5, z: 0 }, rootHeight: 0.5 },
      { timestamp: 2.0, centerOfMass: { x: 0.4, y: 0.4, z: 0 }, rootHeight: 0.4 },
      { timestamp: 2.5, centerOfMass: { x: 0.5, y: 0.35, z: 0 }, rootHeight: 0.35 }
    ];

    const metrics = computeLocomotionFitness(trace);

    expect(metrics.runtime).toBeCloseTo(2.5, 5);
    expect(metrics.fallFraction).toBeGreaterThan(0);
    expect(metrics.fallFraction).toBeCloseTo(0.4, 2);
    expect(1 - metrics.fallFraction).toBeLessThan(0.7);
  });
});

describe('runEvolution', () => {
  it('improves best fitness across generations', async () => {
    const rng = createRng(42);
    const population = Array.from({ length: 4 }, (_, index) => ({
      id: `candidate-${index}`,
      score: 0
    }));

    const evaluate = async (individual) => ({ fitness: individual.score });
    const mutate = (individual) => ({
      id: `${individual.id}-next`,
      score: individual.score + 1
    });

    const result = await runEvolution({
      initialPopulation: population,
      evaluate,
      mutate,
      rng,
      generations: 3,
      elitism: 1,
      tournamentSize: 2
    });

    expect(result.history).toHaveLength(3);
    expect(result.history[0].bestFitness).toBe(0);
    expect(result.history[result.history.length - 1].bestFitness).toBe(2);
  });
});
