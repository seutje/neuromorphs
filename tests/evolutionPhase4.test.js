import { createDefaultMorphGenome, validateMorphGenome } from '../genomes/morphGenome.js';
import { createDefaultControllerGenome, validateControllerGenome } from '../genomes/ctrlGenome.js';
import { mutateMorphGenome, mutateControllerGenome } from '../public/evolution/mutation.js';
import { createRng } from '../public/evolution/rng.js';
import { computeLocomotionFitness } from '../public/evolution/fitness.js';
import { OBJECTIVE_POSITION } from '../public/environment/arena.js';
import { runEvolution } from '../public/evolution/evolutionEngine.js';
import { simulateLocomotion } from '../public/evolution/simulator.js';

function createResizeOnlyRng(targetIndex = 0) {
  return {
    bool(probability = 0.5) {
      if (!Number.isFinite(probability)) {
        return false;
      }
      if (probability <= 0) {
        return false;
      }
      if (probability >= 1) {
        return true;
      }
      return probability > 0.5;
    },
    range(min, _max) {
      return Number.isFinite(min) ? min : 0.75;
    },
    int(max) {
      if (!Number.isFinite(max) || max <= 0) {
        return 0;
      }
      const clamped = Math.max(0, Math.min(targetIndex, max - 1));
      return clamped;
    }
  };
}

describe('simulateLocomotion', () => {
  jest.setTimeout(20000);

  it('produces a physics-derived trace with runtime matching the requested duration', async () => {
    const morph = createDefaultMorphGenome();
    const controller = createDefaultControllerGenome();

    const result = await simulateLocomotion({
      morphGenome: morph,
      controllerGenome: controller,
      duration: 1.2,
      sampleInterval: 1 / 20
    });

    expect(result.trace.length).toBeGreaterThan(2);
    expect(result.trace[0].timestamp).toBeCloseTo(0, 5);
    const finalSample = result.trace[result.trace.length - 1];
    expect(finalSample.timestamp).toBeGreaterThan(0);
    expect(result.runtime).toBeCloseTo(finalSample.timestamp, 2);
    expect(Number.isFinite(finalSample.centerOfMass.x)).toBe(true);
    expect(Number.isFinite(finalSample.rootHeight ?? 0)).toBe(true);
  });

  it('reflects shorter simulations with fewer samples and reduced runtime', async () => {
    const morph = createDefaultMorphGenome();
    const controller = createDefaultControllerGenome();

    const longRun = await simulateLocomotion({
      morphGenome: morph,
      controllerGenome: controller,
      duration: 1.5,
      sampleInterval: 1 / 30
    });
    const shortRun = await simulateLocomotion({
      morphGenome: morph,
      controllerGenome: controller,
      duration: 0.6,
      sampleInterval: 1 / 30
    });

    expect(shortRun.trace.length).toBeLessThan(longRun.trace.length);
    expect(shortRun.runtime).toBeLessThan(longRun.runtime);
    expect(shortRun.trace[shortRun.trace.length - 1].timestamp).toBeLessThan(
      longRun.trace[longRun.trace.length - 1].timestamp
    );
  });

  it('simulates locomotion in the obstacle stage without errors', async () => {
    const morph = createDefaultMorphGenome();
    const controller = createDefaultControllerGenome();

    const result = await simulateLocomotion({
      morphGenome: morph,
      controllerGenome: controller,
      duration: 0.8,
      sampleInterval: 1 / 30,
      stageId: 'obstacle'
    });

    expect(result.trace.length).toBeGreaterThan(0);
    expect(result.runtime).toBeGreaterThan(0);
  });

  it('honors an explicit abort callback during simulation', async () => {
    const morph = createDefaultMorphGenome();
    const controller = createDefaultControllerGenome();
    const abortError = new Error('stop-now');
    let calls = 0;

    await expect(
      simulateLocomotion({
        morphGenome: morph,
        controllerGenome: controller,
        duration: 2,
        sampleInterval: 1 / 60,
        shouldAbort: () => {
          calls += 1;
          if (calls > 5) {
            throw abortError;
          }
        }
      })
    ).rejects.toBe(abortError);
    expect(calls).toBeGreaterThan(5);
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

  it('keeps child joint anchors inside the resized body extents', () => {
    const base = createDefaultMorphGenome();
    const rng = createResizeOnlyRng(1);

    const { genome } = mutateMorphGenome(base, rng, {
      addLimbChance: 0,
      resizeChance: 1,
      jointJitterChance: 0
    });

    const leg = genome.bodies.find((body) => body.id === 'leg');
    expect(leg).toBeDefined();
    expect(Array.isArray(leg?.joint?.childAnchor)).toBe(true);
    const childAnchor = leg?.joint?.childAnchor ?? [0, 0, 0];
    leg.halfExtents.forEach((extent, index) => {
      expect(Math.abs(childAnchor[index])).toBeLessThanOrEqual(
        Math.abs(extent) + 1e-6
      );
    });
  });

  it('clamps parent anchors on children when resizing a parent body', () => {
    const base = createDefaultMorphGenome();
    const rng = createResizeOnlyRng(0);

    const { genome } = mutateMorphGenome(base, rng, {
      addLimbChance: 0,
      resizeChance: 1,
      jointJitterChance: 0
    });

    const torso = genome.bodies.find((body) => body.id === 'torso');
    const leg = genome.bodies.find((body) => body.id === 'leg');
    expect(torso).toBeDefined();
    expect(leg).toBeDefined();
    expect(Array.isArray(leg?.joint?.parentAnchor)).toBe(true);
    const parentAnchor = leg?.joint?.parentAnchor ?? [0, 0, 0];
    torso.halfExtents.forEach((extent, index) => {
      expect(Math.abs(parentAnchor[index])).toBeLessThanOrEqual(
        Math.abs(extent) + 1e-6
      );
    });
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
    const startX = 0;
    const closerX = OBJECTIVE_POSITION.x + 1.5;
    const travelDistance = Math.abs(startX - closerX);
    const fartherX = startX + travelDistance;

    const towardObjective = [
      { timestamp: 0, centerOfMass: { x: startX, y: 0.8, z: 0 }, rootHeight: 0.8 },
      { timestamp: 1, centerOfMass: { x: closerX, y: 0.82, z: 0 }, rootHeight: 0.82 }
    ];
    const awayFromObjective = [
      { timestamp: 0, centerOfMass: { x: startX, y: 0.8, z: 0 }, rootHeight: 0.8 },
      { timestamp: 1, centerOfMass: { x: fartherX, y: 0.82, z: 0 }, rootHeight: 0.82 }
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
