import {
  createDefaultControllerGenome,
  validateControllerGenome
} from '../../genomes/ctrlGenome.js';

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function pickRandom(array, rng) {
  if (!Array.isArray(array) || array.length === 0) {
    return null;
  }
  return array[rng.int(array.length)];
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function createIdGenerator(values, prefix) {
  const existing = new Set(values);
  let counter = 0;
  return () => {
    let candidate;
    do {
      candidate = `${prefix}-${counter}`;
      counter += 1;
    } while (existing.has(candidate));
    existing.add(candidate);
    return candidate;
  };
}

function mutateConnectionWeights(genome, rng) {
  const connections = Array.isArray(genome.connections) ? genome.connections : [];
  if (connections.length === 0) {
    return false;
  }
  const target = pickRandom(connections, rng);
  if (!target) {
    return false;
  }
  const weight = Number(target.weight) || 0;
  target.weight = clamp(weight + rng.range(-0.35, 0.35), -5, 5);
  return true;
}

function mutateOscillatorNode(genome, rng) {
  const oscillators = (genome.nodes || []).filter((node) => node?.type === 'oscillator');
  const target = pickRandom(oscillators, rng);
  if (!target) {
    return false;
  }
  const amplitude = Math.max(Math.abs(Number(target.amplitude) || 0.7), 0.05);
  const frequency = Math.max(Math.abs(Number(target.frequency) || 1.2), 0.05);
  target.amplitude = Math.max(0.05, amplitude * rng.range(0.75, 1.25));
  target.frequency = Math.max(0.05, frequency * rng.range(0.8, 1.2));
  target.offset = (Number(target.offset) || 0) + rng.range(-0.2, 0.2);
  target.phaseOffset = (Number(target.phaseOffset) || 0) + rng.range(-0.2, 0.2);
  return true;
}

function ensureSensorActuatorConnection(genome, rng) {
  const nodes = Array.isArray(genome.nodes) ? genome.nodes : [];
  const sensors = nodes.filter((node) => node?.type === 'sensor');
  const actuators = nodes.filter((node) => node?.type === 'actuator');
  if (sensors.length === 0 || actuators.length === 0) {
    return false;
  }
  const sensor = pickRandom(sensors, rng);
  const actuator = pickRandom(actuators, rng);
  if (!sensor || !actuator) {
    return false;
  }
  const connections = Array.isArray(genome.connections) ? genome.connections : [];
  const existing = new Set(connections.map((connection) => `${connection.source}->${connection.target}`));
  const key = `${sensor.id}->${actuator.id}`;
  if (existing.has(key)) {
    return false;
  }
  const idGenerator = createIdGenerator(connections.map((connection) => connection.id), 'conn');
  connections.push({
    id: idGenerator(),
    source: sensor.id,
    target: actuator.id,
    weight: rng.range(-1, 1)
  });
  genome.connections = connections;
  return true;
}

const DEFAULT_CONFIG = {
  weightJitterChance: 0.85,
  oscillatorChance: 0.6,
  addConnectionChance: 0.45
};

export function mutateControllerGenome(genome, rng, config = {}) {
  const base = genome ? clone(genome) : createDefaultControllerGenome();
  const settings = { ...DEFAULT_CONFIG, ...config };
  const operations = [];
  let mutated = false;

  if (rng.bool(settings.weightJitterChance)) {
    const changed = mutateConnectionWeights(base, rng);
    mutated = mutated || changed;
    if (changed) {
      operations.push('weight-jitter');
    }
  }
  if (rng.bool(settings.oscillatorChance)) {
    const changed = mutateOscillatorNode(base, rng);
    mutated = mutated || changed;
    if (changed) {
      operations.push('oscillator-tune');
    }
  }
  if (rng.bool(settings.addConnectionChance)) {
    const changed = ensureSensorActuatorConnection(base, rng);
    mutated = mutated || changed;
    if (changed) {
      operations.push('add-connection');
    }
  }

  if (!mutated) {
    if (mutateConnectionWeights(base, rng)) {
      operations.push('weight-jitter');
    }
  }

  const { valid, errors } = validateControllerGenome(base);
  if (!valid) {
    throw new Error(`Mutated controller genome failed validation: ${errors.join('; ')}`);
  }

  return {
    genome: base,
    operations
  };
}
