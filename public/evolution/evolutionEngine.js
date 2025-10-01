import { createRng, splitRng } from './rng.js';
import { mutateCompositeGenome } from './mutation.js';

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function normalizeEvaluation(result) {
  if (typeof result === 'number' && Number.isFinite(result)) {
    return { fitness: result };
  }
  if (result && typeof result === 'object') {
    const fitness = Number(result.fitness);
    return {
      fitness: Number.isFinite(fitness) ? fitness : 0,
      metrics: result.metrics ?? null,
      extras: result.extras ?? null
    };
  }
  return { fitness: 0 };
}

function stripEvaluation(individual) {
  const copy = clone(individual);
  delete copy.fitness;
  delete copy.metrics;
  delete copy.extras;
  delete copy.evaluation;
  return copy;
}

function tournamentSelect(population, rng, size) {
  const count = Math.max(1, Math.min(size, population.length));
  let best = null;
  for (let index = 0; index < count; index += 1) {
    const candidate = population[rng.int(population.length)];
    if (!best || (candidate?.fitness ?? -Infinity) > (best?.fitness ?? -Infinity)) {
      best = candidate;
    }
  }
  return best ? stripEvaluation(best) : null;
}

function defaultMutate(individual, rng, config) {
  const result = mutateCompositeGenome(individual, rng, config);
  const idSeed = Math.floor((rng?.next?.() ?? Math.random()) * 1e9).toString(16);
  return {
    id: `${individual?.id ?? 'individual'}-${idSeed}`,
    morph: result.morph,
    controller: result.controller,
    lineage: {
      parentId: individual?.id ?? null,
      operations: result.operations
    }
  };
}

export async function runEvolution({
  initialPopulation,
  evaluate,
  mutate = defaultMutate,
  rng = createRng(1),
  generations = 10,
  elitism = 1,
  tournamentSize = 3,
  mutationConfig = {},
  logger,
  signal,
  onGeneration,
  onStateSnapshot,
  startGeneration = 0,
  history: initialHistory = []
}) {
  if (!Array.isArray(initialPopulation) || initialPopulation.length === 0) {
    throw new Error('initialPopulation must contain at least one individual.');
  }
  if (typeof evaluate !== 'function') {
    throw new Error('evaluate callback is required.');
  }

  if (signal?.aborted) {
    throw signal.reason ?? new Error('Evolution aborted');
  }

  let aborted = false;
  const abortListener = signal
    ? () => {
        aborted = true;
      }
    : null;

  if (signal && abortListener) {
    signal.addEventListener('abort', abortListener);
  }

  function throwIfAborted() {
    if (!aborted) {
      return;
    }
    const reason = signal?.reason ?? new Error('Evolution aborted');
    throw reason;
  }

  try {
    let population = initialPopulation.map((individual, index) => ({
      ...clone(individual),
      id: individual.id ?? `ind-${index}`
    }));
    const history = Array.isArray(initialHistory)
      ? initialHistory.map((entry) => clone(entry))
      : [];
    const globalRng = rng;
    const baseGeneration = Math.max(0, Math.floor(startGeneration));
    const steps = Math.max(0, Math.floor(generations));

    if (typeof onStateSnapshot === 'function') {
      onStateSnapshot({
        generation: baseGeneration,
        population: population.map((individual) => stripEvaluation(individual)),
        rngState: typeof globalRng?.serialize === 'function' ? globalRng.serialize() : null,
        history: history.map((entry) => clone(entry))
      });
    }

    for (let step = 0; step < steps; step += 1) {
      throwIfAborted();
      const generation = baseGeneration + step;
      const evaluated = [];
      for (let index = 0; index < population.length; index += 1) {
        throwIfAborted();
        const individual = population[index];
        const evalRng = splitRng(globalRng, `${generation}-${index}`);
        const evaluation = await evaluate(stripEvaluation(individual), {
          generation,
          index,
          rng: evalRng
        });
        throwIfAborted();
        const normalized = normalizeEvaluation(evaluation);
        evaluated.push({
          ...clone(individual),
          fitness: normalized.fitness,
          metrics: normalized.metrics,
          extras: normalized.extras
        });
      }

      evaluated.sort((a, b) => (b.fitness ?? 0) - (a.fitness ?? 0));
      const bestEvaluation = evaluated[0] ?? null;
      const bestFitness = bestEvaluation?.fitness ?? 0;
      const meanFitness =
        evaluated.reduce((total, entry) => total + (entry.fitness ?? 0), 0) /
        Math.max(1, evaluated.length);
      const bestIndividual = bestEvaluation ? stripEvaluation(bestEvaluation) : null;
      const bestMetrics = bestEvaluation?.metrics ? clone(bestEvaluation.metrics) : null;

      const generationSummary = {
        generation,
        bestFitness,
        meanFitness,
        bestIndividual,
        bestMetrics
      };
      history.push(clone(generationSummary));

      if (typeof onGeneration === 'function') {
        onGeneration({
          generation: step,
          absoluteGeneration: generation,
          bestFitness,
          meanFitness,
          bestIndividual,
          bestMetrics,
          evaluated: evaluated.map((entry) => ({
            id: entry.id,
            fitness: entry.fitness,
            metrics: entry.metrics
          }))
        });
      }

      if (typeof logger?.info === 'function') {
        logger.info(
          `[EA] generation=${generation} best=${bestFitness.toFixed(3)} mean=${meanFitness.toFixed(3)}`
        );
      }

      const nextPopulation = [];
      const eliteCount = Math.min(Math.max(0, elitism), evaluated.length);
      for (let i = 0; i < eliteCount; i += 1) {
        nextPopulation.push(stripEvaluation(evaluated[i]));
      }

      while (nextPopulation.length < population.length) {
        throwIfAborted();
        const parent = tournamentSelect(evaluated, globalRng, tournamentSize) ?? evaluated[0];
        const child = mutate(
          parent,
          splitRng(globalRng, `mut-${generation}-${nextPopulation.length}`),
          mutationConfig
        );
        nextPopulation.push(child);
      }

      if (typeof onStateSnapshot === 'function') {
        onStateSnapshot({
          generation: generation + 1,
          population: nextPopulation.map((individual) => stripEvaluation(individual)),
          rngState: typeof globalRng?.serialize === 'function' ? globalRng.serialize() : null,
          history: history.map((entry) => clone(entry))
        });
      }

      population = nextPopulation;
    }

    const finalBest = history[history.length - 1]?.bestIndividual ?? null;

    return {
      history: history.map((entry) => clone(entry)),
      population: population.map((individual) => stripEvaluation(individual)),
      best: finalBest,
      rngState: typeof rng?.serialize === 'function' ? rng.serialize() : null
    };
  } finally {
    if (signal && abortListener) {
      signal.removeEventListener('abort', abortListener);
    }
  }
}
