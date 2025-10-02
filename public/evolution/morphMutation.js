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

function normalizeVector3(vector, fallback = [0, 0, 0]) {
  if (!Array.isArray(vector) || vector.length !== 3) {
    return [...fallback];
  }
  return vector.map((component, index) => {
    const value = Number(component);
    return Number.isFinite(value) ? value : fallback[index];
  });
}

function normalizeHalfExtents(extents, fallback = [0.3, 0.3, 0.3]) {
  if (!Array.isArray(extents) || extents.length !== 3) {
    return [...fallback];
  }
  return extents.map((component, index) => {
    const value = Math.abs(Number(component));
    const fallbackValue = Math.abs(Number(fallback[index]));
    if (!Number.isFinite(value) || value <= 0) {
      return Math.max(0.1, fallbackValue || 0.1);
    }
    return Math.max(0.1, value);
  });
}

const ZERO_VECTOR3 = [0, 0, 0];
const IDENTITY_QUATERNION = [0, 0, 0, 1];

function normalizeQuaternion(quaternion, fallback = IDENTITY_QUATERNION) {
  if (!Array.isArray(quaternion) || quaternion.length !== 4) {
    return [...fallback];
  }
  const values = quaternion.map((component, index) => {
    const value = Number(component);
    return Number.isFinite(value) ? value : fallback[index];
  });
  const length = Math.hypot(values[0], values[1], values[2], values[3]);
  if (!Number.isFinite(length) || length === 0) {
    return [...fallback];
  }
  return values.map((component) => component / length);
}

function addVectors(a, b) {
  return [
    (Number(a[0]) || 0) + (Number(b[0]) || 0),
    (Number(a[1]) || 0) + (Number(b[1]) || 0),
    (Number(a[2]) || 0) + (Number(b[2]) || 0)
  ];
}

function multiplyQuaternions([ax, ay, az, aw], [bx, by, bz, bw]) {
  return [
    aw * bx + ax * bw + ay * bz - az * by,
    aw * by - ax * bz + ay * bw + az * bx,
    aw * bz + ax * by - ay * bx + az * bw,
    aw * bw - ax * bx - ay * by - az * bz
  ];
}

function applyQuaternion(quaternion, vector) {
  const [x, y, z] = vector;
  const [qx, qy, qz, qw] = quaternion;
  const uvx = qy * z - qz * y;
  const uvy = qz * x - qx * z;
  const uvz = qx * y - qy * x;
  const uuvx = qy * uvz - qz * uvy;
  const uuvy = qz * uvx - qx * uvz;
  const uuvz = qx * uvy - qy * uvx;
  return [
    x + 2 * (uvx * qw + uuvx),
    y + 2 * (uvy * qw + uuvy),
    z + 2 * (uvz * qw + uuvz)
  ];
}

function quaternionToMatrix([x, y, z, w]) {
  const xx = x * x;
  const yy = y * y;
  const zz = z * z;
  const xy = x * y;
  const xz = x * z;
  const yz = y * z;
  const wx = w * x;
  const wy = w * y;
  const wz = w * z;
  return [
    1 - 2 * (yy + zz),
    2 * (xy - wz),
    2 * (xz + wy),
    2 * (xy + wz),
    1 - 2 * (xx + zz),
    2 * (yz - wx),
    2 * (xz - wy),
    2 * (yz + wx),
    1 - 2 * (xx + yy)
  ];
}

function transformExtents(rotationMatrix, halfExtents) {
  const [hx, hy, hz] = halfExtents;
  return [
    Math.abs(rotationMatrix[0]) * hx +
      Math.abs(rotationMatrix[1]) * hy +
      Math.abs(rotationMatrix[2]) * hz,
    Math.abs(rotationMatrix[3]) * hx +
      Math.abs(rotationMatrix[4]) * hy +
      Math.abs(rotationMatrix[5]) * hz,
    Math.abs(rotationMatrix[6]) * hx +
      Math.abs(rotationMatrix[7]) * hy +
      Math.abs(rotationMatrix[8]) * hz
  ];
}

function computeWorldPose(bodyId, bodiesById, cache) {
  if (cache.has(bodyId)) {
    return cache.get(bodyId);
  }
  const body = bodiesById.get(bodyId);
  if (!body) {
    const fallback = { position: [...ZERO_VECTOR3], rotation: [...IDENTITY_QUATERNION] };
    cache.set(bodyId, fallback);
    return fallback;
  }
  const localPosition = normalizeVector3(body.pose?.position, ZERO_VECTOR3);
  const localRotation = normalizeQuaternion(body.pose?.rotation, IDENTITY_QUATERNION);
  const parentId = body.joint?.parentId;
  if (typeof parentId !== 'string' || !bodiesById.has(parentId)) {
    const pose = { position: localPosition, rotation: localRotation };
    cache.set(bodyId, pose);
    return pose;
  }
  const parentPose = computeWorldPose(parentId, bodiesById, cache);
  const rotatedOffset = applyQuaternion(parentPose.rotation, localPosition);
  const worldPosition = addVectors(parentPose.position, rotatedOffset);
  const worldRotation = normalizeQuaternion(
    multiplyQuaternions(parentPose.rotation, localRotation),
    IDENTITY_QUATERNION
  );
  const pose = { position: worldPosition, rotation: worldRotation };
  cache.set(bodyId, pose);
  return pose;
}

function computeWorldAabb(body, bodiesById, cache) {
  if (!body || typeof body.id !== 'string') {
    return null;
  }
  const pose = computeWorldPose(body.id, bodiesById, cache);
  const localExtents = normalizeHalfExtents(body.halfExtents, [0.3, 0.3, 0.3]);
  const rotationMatrix = quaternionToMatrix(pose.rotation);
  const worldExtents = transformExtents(rotationMatrix, localExtents);
  return {
    id: body.id,
    center: pose.position,
    halfExtents: worldExtents
  };
}

function aabbOverlap(centerA, halfExtentsA, centerB, halfExtentsB, margin = 0) {
  for (let axis = 0; axis < 3; axis += 1) {
    const extentA = Math.abs(Number(halfExtentsA[axis])) || 0;
    const extentB = Math.abs(Number(halfExtentsB[axis])) || 0;
    const separation = extentA + extentB;
    const distance = Math.abs(
      (Number(centerA[axis]) || 0) - (Number(centerB[axis]) || 0)
    );
    if (distance >= separation - margin) {
      return false;
    }
  }
  return true;
}

function shuffle(array, rng) {
  if (!Array.isArray(array)) {
    return [];
  }
  const result = array.slice();
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swapIndex = rng && typeof rng.int === 'function'
      ? rng.int(index + 1)
      : Math.floor(Math.random() * (index + 1));
    const temp = result[index];
    result[index] = result[swapIndex];
    result[swapIndex] = temp;
  }
  return result;
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
  const parentExtents = normalizeHalfExtents(parent.halfExtents, [0.3, 0.3, 0.3]);
  const newHalfExtents = parentExtents.map((extent) =>
    Math.max(0.12, extent * rng.range(0.45, 0.85))
  );
  const bodiesById = new Map();
  bodies.forEach((body) => {
    if (body?.id) {
      bodiesById.set(body.id, body);
    }
  });
  const poseCache = new Map();
  const worldAabbs = [];
  bodiesById.forEach((body) => {
    const aabb = computeWorldAabb(body, bodiesById, poseCache);
    if (aabb) {
      worldAabbs.push(aabb);
    }
  });
  const parentPose = computeWorldPose(parent.id, bodiesById, poseCache);
  const parentRotationMatrix = quaternionToMatrix(parentPose.rotation);
  const candidateWorldExtents = transformExtents(parentRotationMatrix, newHalfExtents);
  let selectedDirection = null;
  let selectedOffset = null;
  shuffle(
    [
      [0, -1, 0],
      [0, 1, 0],
      [1, 0, 0],
      [-1, 0, 0],
      [0, 0, 1],
      [0, 0, -1]
    ],
    rng
  ).some((candidate) => {
    const candidateOffset = [
      candidate[0] * (parentExtents[0] + newHalfExtents[0]),
      candidate[1] * (parentExtents[1] + newHalfExtents[1]),
      candidate[2] * (parentExtents[2] + newHalfExtents[2])
    ];
    const candidateCenter = addVectors(
      parentPose.position,
      applyQuaternion(parentPose.rotation, candidateOffset)
    );
    const overlaps = worldAabbs.some((entry) => {
      if (!entry) {
        return false;
      }
      const margin = entry.id === parent.id ? 0.0025 : 0.01;
      return aabbOverlap(
        candidateCenter,
        candidateWorldExtents,
        entry.center,
        entry.halfExtents,
        margin
      );
    });
    if (!overlaps) {
      selectedDirection = candidate;
      selectedOffset = candidateOffset;
      return true;
    }
    return false;
  });
  if (!selectedDirection || !selectedOffset) {
    return false;
  }
  const axis = pickRandom(
    [
      [1, 0, 0],
      [0, 1, 0],
      [0, 0, 1]
    ],
    rng
  ) ?? [0, 0, 1];
  const idGenerator = createIdGenerator(bodies.map((body) => body.id), 'limb');
  const direction = selectedDirection;
  const offset = selectedOffset;
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
