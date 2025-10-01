const DEFAULT_OPTIONS = {
  fallHeight: 0.25,
  fallPenalty: 2,
  heightWeight: 0.1,
  velocityWeight: 0.5,
  uprightPercentile: 0.6,
  fallHeightRatio: 0.6
};

function toVector(sample) {
  if (sample && typeof sample === 'object') {
    const x = Number(sample.x ?? sample[0]) || 0;
    const y = Number(sample.y ?? sample[1]) || 0;
    const z = Number(sample.z ?? sample[2]) || 0;
    return { x, y, z };
  }
  return { x: 0, y: 0, z: 0 };
}

function horizontalDistance(a, b) {
  return Math.hypot(b.x - a.x, b.z - a.z);
}

function safeNumber(value, fallback = 0) {
  return Number.isFinite(Number(value)) ? Number(value) : fallback;
}

function estimateHeightPercentile(values, percentile) {
  if (!Array.isArray(values) || values.length === 0) {
    return 0;
  }
  const finiteValues = values.filter((value) => Number.isFinite(value));
  if (finiteValues.length === 0) {
    return 0;
  }
  const sorted = [...finiteValues].sort((a, b) => a - b);
  const clamped = Math.min(Math.max(percentile ?? 0.5, 0), 1);
  if (sorted.length === 1) {
    return sorted[0];
  }
  const position = clamped * (sorted.length - 1);
  const lowerIndex = Math.floor(position);
  const upperIndex = Math.min(sorted.length - 1, Math.ceil(position));
  const lower = sorted[lowerIndex];
  const upper = sorted[upperIndex];
  if (lowerIndex === upperIndex) {
    return lower;
  }
  const weight = position - lowerIndex;
  return lower + (upper - lower) * weight;
}

export function analyzeLocomotionTrace(samples, options = {}) {
  if (!Array.isArray(samples) || samples.length === 0) {
    return {
      displacement: 0,
      runtime: 0,
      averageSpeed: 0,
      averageHeight: 0,
      fallFraction: 0
    };
  }
  const config = { ...DEFAULT_OPTIONS, ...options };
  const start = toVector(samples[0].centerOfMass ?? samples[0].position);
  let lastVector = start;
  let previousTimestamp = safeNumber(samples[0].timestamp, 0);
  let runtime = 0;
  let integralSpeed = 0;
  let integralHeight = 0;
  const heightSegments = [];
  const heights = [];

  samples.forEach((sample, index) => {
    const com = toVector(sample.centerOfMass ?? sample.position);
    const timestamp = safeNumber(sample.timestamp, index * 0.02);
    const dt = Math.max(timestamp - previousTimestamp, 0);
    runtime += dt;
    const segmentDistance = horizontalDistance(lastVector, com);
    integralSpeed += dt > 0 ? segmentDistance / dt : 0;
    const height = safeNumber(sample.rootHeight ?? com.y, 0);
    integralHeight += height * dt;
    heightSegments.push({ dt, height });
    heights.push(height);
    lastVector = com;
    previousTimestamp = timestamp;
  });

  const end = lastVector;
  const displacement = horizontalDistance(start, end);
  const averageSpeed = runtime > 0 ? integralSpeed / samples.length : 0;
  const averageHeight = runtime > 0 ? integralHeight / runtime : 0;
  const baselineHeight = estimateHeightPercentile(heights, config.uprightPercentile);
  const fallThreshold = Math.max(config.fallHeight, baselineHeight * config.fallHeightRatio);
  const fallTime = heightSegments.reduce(
    (total, segment) => (segment.height < fallThreshold ? total + segment.dt : total),
    0
  );
  const fallFraction = runtime > 0 ? Math.min(fallTime / runtime, 1) : 0;

  return {
    displacement,
    runtime,
    averageSpeed,
    averageHeight,
    fallFraction
  };
}

export function computeLocomotionFitness(samples, options = {}) {
  const stats = analyzeLocomotionTrace(samples, options);
  const config = { ...DEFAULT_OPTIONS, ...options };
  const heightBonus = stats.averageHeight * config.heightWeight;
  const speedBonus = stats.averageSpeed * config.velocityWeight;
  const fallPenalty = config.fallPenalty * stats.fallFraction;
  return {
    ...stats,
    fitness: Math.max(stats.displacement + heightBonus + speedBonus - fallPenalty, 0)
  };
}

export function createFitnessAccumulator(options = {}) {
  const samples = [];
  return {
    addSample(sample) {
      if (!sample || typeof sample !== 'object') {
        return;
      }
      samples.push(sample);
    },
    result() {
      return computeLocomotionFitness(samples, options);
    },
    reset() {
      samples.length = 0;
    }
  };
}
