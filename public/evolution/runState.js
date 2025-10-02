const { toString: objectToString } = Object.prototype;

export function deepClone(value) {
  if (value === undefined) {
    return undefined;
  }
  return JSON.parse(JSON.stringify(value));
}

function isPlainObject(value) {
  return objectToString.call(value) === '[object Object]';
}

function valuesEqual(left, right) {
  if (left === right) {
    return true;
  }
  if (Number.isNaN(left) && Number.isNaN(right)) {
    return true;
  }
  if (Array.isArray(left) && Array.isArray(right)) {
    if (left.length !== right.length) {
      return false;
    }
    for (let index = 0; index < left.length; index += 1) {
      if (!valuesEqual(left[index], right[index])) {
        return false;
      }
    }
    return true;
  }
  if (isPlainObject(left) && isPlainObject(right)) {
    const leftKeys = Object.keys(left);
    const rightKeys = Object.keys(right);
    if (leftKeys.length !== rightKeys.length) {
      return false;
    }
    for (let index = 0; index < leftKeys.length; index += 1) {
      const key = leftKeys[index];
      if (!Object.prototype.hasOwnProperty.call(right, key)) {
        return false;
      }
      if (!valuesEqual(left[key], right[key])) {
        return false;
      }
    }
    return true;
  }
  return false;
}

function cloneHistory(history) {
  if (!Array.isArray(history)) {
    return [];
  }
  return history.map((entry) => deepClone(entry));
}

function clonePopulation(population) {
  if (!Array.isArray(population)) {
    return [];
  }
  return population.map((individual) => deepClone(individual));
}

export function resolveResumeState(persistedState, config) {
  if (!persistedState || persistedState.status !== 'aborted') {
    return null;
  }
  if (!persistedState.config || !config) {
    return null;
  }
  if (!valuesEqual(persistedState.config, config)) {
    return null;
  }
  const generation = Math.max(0, Math.floor(persistedState.generation ?? 0));
  return {
    generation,
    history: cloneHistory(persistedState.history),
    population: clonePopulation(persistedState.population),
    rngState: persistedState.rngState ?? null
  };
}

export function runConfigsMatch(left, right) {
  if (!left || !right) {
    return false;
  }
  return valuesEqual(left, right);
}
