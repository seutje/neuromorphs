export const MORPH_SCHEMA_VERSION = '0.1.0';

const IDENTITY_QUATERNION = [0, 0, 0, 1];

const DEFAULT_MATERIAL_LIBRARY = {
  core: {
    color: '#38bdf8',
    roughness: 0.35,
    metalness: 0.2,
    friction: 0.92,
    restitution: 0.18,
    density: 1.05,
    linearDamping: 0.05,
    angularDamping: 0.08
  },
  limb: {
    color: '#f97316',
    roughness: 0.4,
    metalness: 0.1,
    friction: 0.88,
    restitution: 0.22,
    density: 0.95,
    linearDamping: 0.04,
    angularDamping: 0.09
  },
  accent: {
    color: '#a855f7',
    roughness: 0.32,
    metalness: 0.3,
    friction: 0.85,
    restitution: 0.2,
    density: 0.9,
    linearDamping: 0.05,
    angularDamping: 0.1
  }
};

function isFiniteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

function clampPositive(value, fallback) {
  return isFiniteNumber(value) && value > 0 ? value : fallback;
}

function normalizeQuaternion([x, y, z, w]) {
  const length = Math.hypot(x, y, z, w);
  if (length === 0) {
    return [...IDENTITY_QUATERNION];
  }
  return [x / length, y / length, z / length, w / length];
}

function multiplyQuaternions([ax, ay, az, aw], [bx, by, bz, bw]) {
  return [
    aw * bx + ax * bw + ay * bz - az * by,
    aw * by - ax * bz + ay * bw + az * bx,
    aw * bz + ax * by - ay * bx + az * bw,
    aw * bw - ax * bx - ay * by - az * bz
  ];
}

function applyQuaternion([qx, qy, qz, qw], [vx, vy, vz]) {
  const ix = qw * vx + qy * vz - qz * vy;
  const iy = qw * vy + qz * vx - qx * vz;
  const iz = qw * vz + qx * vy - qy * vx;
  const iw = -qx * vx - qy * vy - qz * vz;

  return [
    ix * qw + iw * -qx + iy * -qz - iz * -qy,
    iy * qw + iw * -qy + iz * -qx - ix * -qz,
    iz * qw + iw * -qz + ix * -qy - iy * -qx
  ];
}

function addVectors([ax, ay, az], [bx, by, bz]) {
  return [ax + bx, ay + by, az + bz];
}

function toVector3(value, fallback = [0, 0, 0]) {
  if (!Array.isArray(value) || value.length !== 3) {
    return [...fallback];
  }
  return value.map((component, index) =>
    Number.isFinite(Number(component)) ? Number(component) : fallback[index]
  );
}

function toQuaternion(value) {
  if (!Array.isArray(value) || value.length !== 4) {
    return [...IDENTITY_QUATERNION];
  }
  const [x, y, z, w] = value.map((component) => Number(component) || 0);
  return normalizeQuaternion([x, y, z, w || 1]);
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function resolveMaterial(library, materialId) {
  const baseLibrary =
    (materialId && library[materialId]) ||
    library[materialId] ||
    DEFAULT_MATERIAL_LIBRARY[materialId] ||
    DEFAULT_MATERIAL_LIBRARY.core;
  return {
    id: materialId || 'core',
    color:
      typeof baseLibrary.color === 'string'
        ? baseLibrary.color
        : DEFAULT_MATERIAL_LIBRARY.core.color,
    roughness: isFiniteNumber(baseLibrary.roughness)
      ? baseLibrary.roughness
      : DEFAULT_MATERIAL_LIBRARY.core.roughness,
    metalness: isFiniteNumber(baseLibrary.metalness)
      ? baseLibrary.metalness
      : DEFAULT_MATERIAL_LIBRARY.core.metalness,
    friction: isFiniteNumber(baseLibrary.friction)
      ? baseLibrary.friction
      : DEFAULT_MATERIAL_LIBRARY.core.friction,
    restitution: isFiniteNumber(baseLibrary.restitution)
      ? baseLibrary.restitution
      : DEFAULT_MATERIAL_LIBRARY.core.restitution,
    density: clampPositive(baseLibrary.density, DEFAULT_MATERIAL_LIBRARY.core.density),
    linearDamping: clampPositive(
      baseLibrary.linearDamping,
      DEFAULT_MATERIAL_LIBRARY.core.linearDamping
    ),
    angularDamping: clampPositive(
      baseLibrary.angularDamping,
      DEFAULT_MATERIAL_LIBRARY.core.angularDamping
    )
  };
}

export function createDefaultMorphGenome() {
  return {
    version: MORPH_SCHEMA_VERSION,
    metadata: {
      name: 'Phase 2 Hopper',
      description:
        'Two-body hopper used for validating the genome schema and physics instantiation.',
      tags: ['demo', 'phase-2']
    },
    materials: {
      core: {
        color: '#38bdf8',
        density: 1.08,
        roughness: 0.35,
        metalness: 0.22,
        friction: 0.92,
        restitution: 0.18
      },
      limb: {
        color: '#facc15',
        density: 0.94,
        roughness: 0.42,
        metalness: 0.1,
        friction: 0.88,
        restitution: 0.24
      }
    },
    bodies: [
      {
        id: 'torso',
        shape: 'cuboid',
        halfExtents: [0.35, 0.25, 0.25],
        density: 1.08,
        material: 'core',
        pose: {
          position: [0, 1.1, 0],
          rotation: [...IDENTITY_QUATERNION]
        }
      },
      {
        id: 'leg',
        shape: 'cuboid',
        halfExtents: [0.18, 0.45, 0.18],
        density: 0.94,
        material: 'limb',
        pose: {
          position: [0, -0.7, 0],
          rotation: [...IDENTITY_QUATERNION]
        },
        joint: {
          parentId: 'torso',
          type: 'revolute',
          axis: [1, 0, 0],
          parentAnchor: [0, -0.25, 0],
          childAnchor: [0, 0.45, 0],
          limits: [-0.8, 0.6]
        }
      }
    ]
  };
}

export function validateMorphGenome(genome) {
  const errors = [];
  if (!genome || typeof genome !== 'object') {
    return { valid: false, errors: ['Genome must be an object.'] };
  }
  if (genome.version !== MORPH_SCHEMA_VERSION) {
    errors.push(
      `Unsupported genome version: ${String(genome.version)} (expected ${MORPH_SCHEMA_VERSION}).`
    );
  }
  const bodies = Array.isArray(genome.bodies) ? genome.bodies : [];
  if (bodies.length === 0) {
    errors.push('Genome must contain at least one body.');
  }
  const idSet = new Set();
  const parentRefs = new Map();
  bodies.forEach((body, index) => {
    if (!body || typeof body !== 'object') {
      errors.push(`Body at index ${index} must be an object.`);
      return;
    }
    if (typeof body.id !== 'string' || body.id.trim() === '') {
      errors.push(`Body at index ${index} is missing a valid string id.`);
    } else if (idSet.has(body.id)) {
      errors.push(`Body id "${body.id}" is duplicated.`);
    } else {
      idSet.add(body.id);
    }
    if (body.shape !== 'cuboid') {
      errors.push(`Body "${body.id}" must currently use the "cuboid" shape.`);
    }
    const halfExtents = Array.isArray(body.halfExtents) ? body.halfExtents : [];
    if (halfExtents.length !== 3) {
      errors.push(`Body "${body.id}" must supply three half extents.`);
    }
    halfExtents.forEach((extent, extentIndex) => {
      if (!isFiniteNumber(Number(extent)) || Number(extent) <= 0) {
        errors.push(
          `Body "${body.id}" has invalid half extent at index ${extentIndex}.`
        );
      }
    });
    if (body.joint && typeof body.joint === 'object') {
      const parentId = body.joint.parentId;
      if (typeof parentId !== 'string' || parentId.trim() === '') {
        errors.push(`Joint on body "${body.id}" must reference a parentId.`);
      } else {
        parentRefs.set(body.id, parentId);
      }
      if (
        Object.prototype.hasOwnProperty.call(body.joint, 'contactsEnabled') &&
        typeof body.joint.contactsEnabled !== 'boolean'
      ) {
        errors.push(
          `Joint on body "${body.id}" must specify contactsEnabled as a boolean when provided.`
        );
      }
      const axis = Array.isArray(body.joint.axis) ? body.joint.axis : [];
      if (axis.length !== 3) {
        errors.push(`Joint on body "${body.id}" requires a 3D axis vector.`);
      }
      const parentAnchor = Array.isArray(body.joint.parentAnchor)
        ? body.joint.parentAnchor
        : [];
      const childAnchor = Array.isArray(body.joint.childAnchor)
        ? body.joint.childAnchor
        : [];
      if (parentAnchor.length !== 3) {
        errors.push(`Joint on body "${body.id}" requires a parentAnchor [x,y,z].`);
      }
      if (childAnchor.length !== 3) {
        errors.push(`Joint on body "${body.id}" requires a childAnchor [x,y,z].`);
      }
      if (
        body.joint.limits &&
        (!Array.isArray(body.joint.limits) || body.joint.limits.length !== 2)
      ) {
        errors.push(`Joint on body "${body.id}" must provide two limits [min,max].`);
      }
    }
  });

  const rootCandidates = bodies.filter(
    (body) => !body.joint || !body.joint.parentId
  );
  if (rootCandidates.length !== 1) {
    errors.push(
      rootCandidates.length === 0
        ? 'Genome must define a single root body without a parent joint.'
        : `Genome must have exactly one root body. Found ${rootCandidates.length}.`
    );
  }

  // Reachability check
  if (errors.length === 0) {
    const rootId = rootCandidates[0].id;
    const adjacency = new Map();
    bodies.forEach((body) => {
      const parentId = parentRefs.get(body.id);
      if (!parentId) {
        return;
      }
      if (!adjacency.has(parentId)) {
        adjacency.set(parentId, []);
      }
      adjacency.get(parentId).push(body.id);
    });
    const visited = new Set([rootId]);
    const queue = [rootId];
    while (queue.length > 0) {
      const current = queue.shift();
      const children = adjacency.get(current) || [];
      children.forEach((childId) => {
        if (!visited.has(childId)) {
          visited.add(childId);
          queue.push(childId);
        }
      });
    }
    if (visited.size !== bodies.length) {
      errors.push('All bodies must be reachable from the root body.');
    }
  }

  return { valid: errors.length === 0, errors };
}

export function buildMorphologyBlueprint(genome) {
  const { valid, errors } = validateMorphGenome(genome);
  if (!valid) {
    return { errors, bodies: [], joints: [], materials: {} };
  }

  const materialLibrary = {
    ...DEFAULT_MATERIAL_LIBRARY,
    ...(typeof genome.materials === 'object' ? genome.materials : {})
  };

  const bodies = genome.bodies.map((body) => ({
    id: body.id,
    shape: body.shape,
    halfExtents: toVector3(body.halfExtents, [0.25, 0.25, 0.25]).map(Math.abs),
    density: clampPositive(body.density, undefined),
    materialId: typeof body.material === 'string' ? body.material : 'core',
    pose: {
      position: toVector3(body.pose?.position, [0, 0, 0]),
      rotation: toQuaternion(body.pose?.rotation)
    },
    joint: body.joint ? clone(body.joint) : null
  }));

  const nodesById = new Map();
  bodies.forEach((body) => {
    nodesById.set(body.id, body);
  });

  const childrenByParent = new Map();
  bodies.forEach((body) => {
    const parentId = body.joint?.parentId;
    if (typeof parentId !== 'string') {
      return;
    }
    if (!childrenByParent.has(parentId)) {
      childrenByParent.set(parentId, []);
    }
    childrenByParent.get(parentId).push(body.id);
  });

  const rootBody = bodies.find((body) => !body.joint?.parentId);
  if (!rootBody) {
    return {
      errors: ['Genome is missing a root body after validation.'],
      bodies: [],
      joints: [],
      materials: {}
    };
  }
  const resolvedBodies = [];
  const resolvedJoints = [];
  const resolvedMaterials = {};

  function resolveNode(bodyId, parentPose) {
    const node = nodesById.get(bodyId);
    if (!node) {
      return;
    }
    const material = resolveMaterial(materialLibrary, node.materialId);
    resolvedMaterials[material.id] = material;
    const rotatedOffset = applyQuaternion(parentPose.rotation, node.pose.position);
    const worldPosition = addVectors(parentPose.translation, rotatedOffset);
    const worldRotation = normalizeQuaternion(
      multiplyQuaternions(parentPose.rotation, node.pose.rotation)
    );

    resolvedBodies.push({
      id: node.id,
      shape: node.shape,
      halfExtents: node.halfExtents,
      translation: worldPosition,
      rotation: worldRotation,
      density: clampPositive(node.density, material.density),
      materialId: material.id,
      material,
      linearDamping: material.linearDamping,
      angularDamping: material.angularDamping
    });

    if (node.joint && node.joint.parentId) {
      resolvedJoints.push({
        id: `${node.joint.parentId}__${node.id}`,
        type: node.joint.type || 'revolute',
        parentId: node.joint.parentId,
        childId: node.id,
        parentAnchor: toVector3(node.joint.parentAnchor, [0, 0, 0]),
        childAnchor: toVector3(node.joint.childAnchor, [0, 0, 0]),
        axis: toVector3(node.joint.axis, [0, 1, 0]),
        contactsEnabled:
          Object.prototype.hasOwnProperty.call(node.joint, 'contactsEnabled')
            ? node.joint.contactsEnabled !== false
            : true,
        limits:
          Array.isArray(node.joint.limits) && node.joint.limits.length === 2
            ? node.joint.limits.map((limit) => Number(limit) || 0)
            : null
      });
    }

    const children = childrenByParent.get(node.id) || [];
    children.forEach((childId) => {
      resolveNode(childId, {
        translation: worldPosition,
        rotation: worldRotation
      });
    });
  }

  resolveNode(rootBody.id, {
    translation: [0, 0, 0],
    rotation: [...IDENTITY_QUATERNION]
  });

  return {
    errors: [],
    bodies: resolvedBodies,
    joints: resolvedJoints,
    materials: resolvedMaterials
  };
}

export function generateSampleMorphGenomes(count = 12) {
  const genomes = [];
  const baseGenome = createDefaultMorphGenome();
  for (let index = 0; index < count; index += 1) {
    const variant = clone(baseGenome);
    variant.metadata = {
      ...baseGenome.metadata,
      name: `Preview Variant ${index + 1}`
    };
    const torso = variant.bodies.find((body) => body.id === 'torso');
    const leg = variant.bodies.find((body) => body.id === 'leg');
    if (torso && leg) {
      const lengthScale = 0.75 + (index % 5) * 0.08;
      const widthScale = 0.9 + ((index + 2) % 4) * 0.05;
      leg.halfExtents[1] = Number((0.45 * lengthScale).toFixed(3));
      leg.halfExtents[0] = Number((0.18 * widthScale).toFixed(3));
      leg.halfExtents[2] = Number((0.18 * widthScale).toFixed(3));
      leg.pose.position = [
        0,
        -Number((torso.halfExtents[1] + leg.halfExtents[1]).toFixed(3)),
        0
      ];
      leg.joint.childAnchor = [0, Number(leg.halfExtents[1].toFixed(3)), 0];
      leg.joint.limits = [
        Number((-0.6 - (index % 3) * 0.15).toFixed(3)),
        Number((0.45 + (index % 4) * 0.1).toFixed(3))
      ];
    }
    if (index % 3 === 0) {
      variant.materials.accent = {
        color: '#c084fc',
        density: 0.88,
        roughness: 0.36,
        metalness: 0.28,
        friction: 0.84,
        restitution: 0.22
      };
      variant.bodies.push({
        id: `tail-${index}`,
        shape: 'cuboid',
        halfExtents: [0.12, 0.18, 0.35],
        density: 0.88,
        material: 'accent',
        pose: {
          position: [0, -0.15, -torso.halfExtents[2] - 0.35],
          rotation: [...IDENTITY_QUATERNION]
        },
        joint: {
          parentId: 'torso',
          type: 'revolute',
          axis: [0, 1, 0],
          parentAnchor: [0, -0.05, -torso.halfExtents[2]],
          childAnchor: [0, 0.18, 0.35],
          limits: [-0.5, 0.5]
        }
      });
    }
    genomes.push(variant);
  }
  return genomes;
}
