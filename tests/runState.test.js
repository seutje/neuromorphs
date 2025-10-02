import { deepClone, resolveResumeState, runConfigsMatch } from '../public/evolution/runState.js';

describe('runConfigsMatch', () => {
  it('considers nested objects with identical values equal', () => {
    const left = {
      seed: 42,
      populationSize: 12,
      selectionWeights: { distance: 0.5, speed: 1, upright: 1 },
      morphMutation: { addLimbChance: 0.3 },
      controllerMutation: { weightJitterChance: 0.8 },
      stageId: 'arena'
    };
    const right = {
      seed: 42,
      populationSize: 12,
      selectionWeights: { distance: 0.5, speed: 1, upright: 1 },
      morphMutation: { addLimbChance: 0.3 },
      controllerMutation: { weightJitterChance: 0.8 },
      stageId: 'arena'
    };

    expect(runConfigsMatch(left, right)).toBe(true);
  });

  it('treats differences in nested values as unequal', () => {
    const left = { seed: 42, selectionWeights: { distance: 0.5, speed: 1 } };
    const right = { seed: 42, selectionWeights: { distance: 0.6, speed: 1 } };

    expect(runConfigsMatch(left, right)).toBe(false);
  });
});

describe('deepClone', () => {
  it('creates a structural copy of nested data', () => {
    const source = { a: 1, b: { c: [1, 2, 3] } };
    const copy = deepClone(source);

    expect(copy).not.toBe(source);
    expect(copy).toEqual(source);
    copy.b.c[0] = 99;
    expect(source.b.c[0]).toBe(1);
  });
});

describe('resolveResumeState', () => {
  const baseConfig = {
    seed: 123,
    generations: 10,
    selectionWeights: { distance: 0.5, speed: 1, upright: 1 },
    morphMutation: { addLimbChance: 0.35 },
    controllerMutation: { weightJitterChance: 0.85 },
    stageId: 'arena'
  };

  it('returns null when there is no aborted run', () => {
    const state = { status: 'completed', config: baseConfig };
    expect(resolveResumeState(state, baseConfig)).toBeNull();
    expect(resolveResumeState(null, baseConfig)).toBeNull();
  });

  it('returns null when the config no longer matches', () => {
    const persisted = {
      status: 'aborted',
      config: baseConfig,
      generation: 2,
      history: [],
      population: []
    };

    const nextConfig = { ...baseConfig, generations: 12 };
    expect(resolveResumeState(persisted, nextConfig)).toBeNull();
  });

  it('clones the persisted state when resuming an aborted run', () => {
    const persisted = {
      status: 'aborted',
      config: baseConfig,
      generation: 3,
      history: [{ generation: 2, bestFitness: 1.23 }],
      population: [{ id: 'a' }],
      rngState: { seed: 999 }
    };

    const resume = resolveResumeState(persisted, baseConfig);

    expect(resume).not.toBeNull();
    expect(resume.generation).toBe(3);
    expect(resume.history).toEqual(persisted.history);
    expect(resume.history).not.toBe(persisted.history);
    expect(resume.population).toEqual(persisted.population);
    expect(resume.population).not.toBe(persisted.population);
    expect(resume.rngState).toEqual({ seed: 999 });

    resume.history.push({ generation: 3, bestFitness: 1.5 });
    expect(persisted.history).toHaveLength(1);
  });
});
