const FNV_OFFSET_BASIS = 2166136261;
const FNV_PRIME = 16777619;

function toSeedNumber(seed) {
  if (typeof seed === 'number' && Number.isFinite(seed)) {
    return seed >>> 0;
  }
  const str = String(seed ?? '');
  let hash = FNV_OFFSET_BASIS;
  for (let index = 0; index < str.length; index += 1) {
    hash ^= str.charCodeAt(index);
    hash = Math.imul(hash, FNV_PRIME);
  }
  return hash >>> 0;
}

function mulberry32(seed) {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function createRng(seed = 1) {
  const generator = mulberry32(toSeedNumber(seed) || 1);

  function next() {
    return generator();
  }

  function float(min = 0, max = 1) {
    return min + (max - min) * next();
  }

  function int(maxExclusive) {
    if (!Number.isFinite(maxExclusive) || maxExclusive <= 0) {
      return 0;
    }
    return Math.floor(next() * maxExclusive);
  }

  function range(min, max) {
    if (!Number.isFinite(min) || !Number.isFinite(max)) {
      return 0;
    }
    return min + next() * (max - min);
  }

  function choice(values) {
    if (!Array.isArray(values) || values.length === 0) {
      return undefined;
    }
    return values[int(values.length)];
  }

  function sign() {
    return next() < 0.5 ? -1 : 1;
  }

  function bool(probability = 0.5) {
    return next() < probability;
  }

  return {
    next,
    float,
    range,
    int,
    choice,
    sign,
    bool
  };
}

export function splitRng(rng, salt) {
  const seed = Math.floor((rng?.next?.() ?? Math.random()) * 0xffffffff) ^ toSeedNumber(salt);
  return createRng(seed);
}
