import {
  createDefaultMorphGenome,
  validateMorphGenome
} from '../../genomes/morphGenome.js';

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function pickRandom(array, rng) {
  if (!Array.isArray(array) || array.length === 0) {
    return null;
  }
  return array[rng.int(array.length)];
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

function mutateAddLimb(genome, rng) {
  const bodies = Array.isArray(genome.bodies) ? genome.bodies : [];
  if (bodies.length === 0) {
    return false;
  }
  const parent = pickRandom(
    bodies.filter((body) => body && typeof body.id === 'string'),
    rng
  );
  if (!parent) {
    return false;
  }
  const parentExtents = Array.isArray(parent.halfExtents)
    ? parent.halfExtents.map((value) => Math.max(Math.abs(Number(value)) || 0.3, 0.1))
    : [0.3, 0.3, 0.3];
  const newHalfExtents = parentExtents.map((extent) =>
    Math.max(0.12, extent * rng.range(0.45, 0.85))
  );
  const direction = pickRandom(
    [
      [0, -1, 0],
      [0, 1, 0],
      [1, 0, 0],
      [-1, 0, 0],
      [0, 0, 1],
      [0, 0, -1]
    ],
    rng
  ) ?? [0, -1, 0];
  const axis = pickRandom(
    [
      [1, 0, 0],
      [0, 1, 0],
      [0, 0, 1]
    ],
    rng
  ) ?? [0, 0, 1];
  const idGenerator = createIdGenerator(bodies.map((body) => body.id), 'limb');
  const offset = [
    direction[0] * (parentExtents[0] + newHalfExtents[0]),
    direction[1] * (parentExtents[1] + newHalfExtents[1]),
    direction[2] * (parentExtents[2] + newHalfExtents[2])
  ];
  const parentAnchor = [
    direction[0] * parentExtents[0],
    direction[1] * parentExtents[1],
    direction[2] * parentExtents[2]
  ];
  const childAnchor = [
    -direction[0] * newHalfExtents[0],
    -direction[1] * newHalfExtents[1],
    -direction[2] * newHalfExtents[2]
  ];
  bodies.push({
    id: idGenerator(),
    shape: 'cuboid',
    halfExtents: newHalfExtents,
    density: parent.density ?? 1,
    material: parent.material ?? 'limb',
    pose: {
      position: offset,
      rotation: [0, 0, 0, 1]
    },
    joint: {
      parentId: parent.id,
      type: 'revolute',
      axis,
      parentAnchor,
      childAnchor,
      limits: [-0.9, 0.9]
    }
  });
  return true;
}

function mutateResizeBody(genome, rng) {
  const bodies = Array.isArray(genome.bodies) ? genome.bodies : [];
  if (bodies.length === 0) {
    return false;
  }
  const body = pickRandom(bodies, rng);
  if (!body || !Array.isArray(body.halfExtents)) {
    return false;
  }
  const factor = rng.range(0.75, 1.2);
  body.halfExtents = body.halfExtents.map((extent) =>
    Math.max(0.1, Math.abs(Number(extent) || 0.3) * factor)
  );
  if (Array.isArray(body.pose?.position)) {
    body.pose.position = body.pose.position.map((value) =>
      Number.isFinite(Number(value)) ? Number(value) * factor : 0
    );
  }
  return true;
}

function mutateJointLimits(genome, rng) {
  const joints = (genome.bodies || []).filter((body) => body?.joint?.limits);
  const target = pickRandom(joints, rng);
  if (!target) {
    return false;
  }
  const limits = Array.isArray(target.joint.limits) ? target.joint.limits.slice(0, 2) : null;
  if (!limits) {
    return false;
  }
  const delta = rng.range(-0.3, 0.3);
  const minLimit = clamp((Number(limits[0]) || -0.9) + delta, -1.6, 0);
  const maxLimit = clamp((Number(limits[1]) || 0.9) + delta, 0, 1.6);
  target.joint.limits = minLimit >= maxLimit ? [minLimit, maxLimit + 0.2] : [minLimit, maxLimit];
  return true;
}

const DEFAULT_CONFIG = {
  addLimbChance: 0.35,
  resizeChance: 0.85,
  jointJitterChance: 0.65
};

export function mutateMorphGenome(genome, rng, config = {}) {
  const base = genome ? clone(genome) : createDefaultMorphGenome();
  const settings = { ...DEFAULT_CONFIG, ...config };
  const operations = [];
  let mutated = false;

  if (rng.bool(settings.addLimbChance)) {
    const changed = mutateAddLimb(base, rng);
    mutated = mutated || changed;
    if (changed) {
      operations.push('add-limb');
    }
  }
  if (rng.bool(settings.resizeChance)) {
    const changed = mutateResizeBody(base, rng);
    mutated = mutated || changed;
    if (changed) {
      operations.push('resize-body');
    }
  }
  if (rng.bool(settings.jointJitterChance)) {
    const changed = mutateJointLimits(base, rng);
    mutated = mutated || changed;
    if (changed) {
      operations.push('joint-limits');
    }
  }

  if (!mutated) {
    if (mutateResizeBody(base, rng)) {
      operations.push('resize-body');
    } else if (mutateAddLimb(base, rng)) {
      operations.push('add-limb');
    }
  }

  const { valid, errors } = validateMorphGenome(base);
  if (!valid) {
    throw new Error(`Mutated morph genome failed validation: ${errors.join('; ')}`);
  }

  return {
    genome: base,
    operations
  };
}
