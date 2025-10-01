import RAPIER from 'https://cdn.jsdelivr.net/npm/@dimforge/rapier3d-compat@0.11.2/rapier.es.js';
import {
  buildMorphologyBlueprint,
  createDefaultMorphGenome
} from '../genomes/morphGenome.js';

const META_LENGTH = 2;
const META_VERSION_INDEX = 0;
const META_WRITE_LOCK_INDEX = 1;
const FLOATS_PER_BODY = 7;

let world = null;
let running = false;
let ready = false;
let stepHandle = null;
let pendingStart = false;

let sharedBuffer = null;
let sharedMeta = null;
let sharedFloats = null;
let sharedStateWarningSent = false;

let creatureBodies = new Map();
let creatureJoints = [];
let bodyOrder = [];
let bodyDescriptorsCache = [];

function clearCreature() {
  if (!world) {
    return;
  }
  creatureJoints.forEach((joint) => {
    if (joint) {
      world.removeImpulseJoint(joint, true);
    }
  });
  creatureJoints = [];
  creatureBodies.forEach((entry) => {
    world.removeRigidBody(entry.body);
  });
  creatureBodies.clear();
  bodyOrder = [];
  bodyDescriptorsCache = [];
}

function configureSharedState(bodyDescriptors, materials) {
  const bodyIds = bodyDescriptors.map((descriptor) => descriptor.id);
  const layout = {
    metaLength: META_LENGTH,
    floatsPerBody: FLOATS_PER_BODY,
    bodyCount: bodyIds.length,
    bodyIds,
    bodies: bodyDescriptors,
    materials,
    metaIndices: {
      version: META_VERSION_INDEX,
      writeLock: META_WRITE_LOCK_INDEX
    }
  };

  if (typeof SharedArrayBuffer === 'undefined') {
    sharedBuffer = null;
    sharedMeta = null;
    sharedFloats = null;
    if (!sharedStateWarningSent) {
      postMessage({
        type: 'shared-state-error',
        message:
          'SharedArrayBuffer is unavailable. Serve with COOP/COEP headers to enable shared memory.'
      });
      sharedStateWarningSent = true;
    }
    postMessage({
      type: 'shared-state',
      buffer: null,
      layout
    });
    return;
  }

  const metaBytes = META_LENGTH * Int32Array.BYTES_PER_ELEMENT;
  sharedBuffer = new SharedArrayBuffer(
    metaBytes + bodyIds.length * FLOATS_PER_BODY * Float32Array.BYTES_PER_ELEMENT
  );
  sharedMeta = new Int32Array(sharedBuffer, 0, META_LENGTH);
  sharedFloats = new Float32Array(
    sharedBuffer,
    metaBytes,
    bodyIds.length * FLOATS_PER_BODY
  );
  Atomics.store(sharedMeta, META_VERSION_INDEX, 0);
  Atomics.store(sharedMeta, META_WRITE_LOCK_INDEX, 0);

  postMessage({
    type: 'shared-state',
    buffer: sharedBuffer,
    layout
  });
}

function syncSharedState() {
  if (!sharedMeta || !sharedFloats) {
    return;
  }
  Atomics.store(sharedMeta, META_WRITE_LOCK_INDEX, 1);
  try {
    for (let index = 0; index < bodyOrder.length; index += 1) {
      const bodyId = bodyOrder[index];
      const entry = creatureBodies.get(bodyId);
      if (!entry) {
        continue;
      }
      const baseIndex = index * FLOATS_PER_BODY;
      const translation = entry.body.translation();
      const rotation = entry.body.rotation();
      sharedFloats[baseIndex] = translation.x;
      sharedFloats[baseIndex + 1] = translation.y;
      sharedFloats[baseIndex + 2] = translation.z;
      sharedFloats[baseIndex + 3] = rotation.x;
      sharedFloats[baseIndex + 4] = rotation.y;
      sharedFloats[baseIndex + 5] = rotation.z;
      sharedFloats[baseIndex + 6] = rotation.w;
    }
    Atomics.add(sharedMeta, META_VERSION_INDEX, 1);
  } finally {
    Atomics.store(sharedMeta, META_WRITE_LOCK_INDEX, 0);
  }
}

function collectBodyStates() {
  const states = [];
  bodyOrder.forEach((bodyId) => {
    const entry = creatureBodies.get(bodyId);
    if (!entry) {
      return;
    }
    const translation = entry.body.translation();
    const rotation = entry.body.rotation();
    states.push({
      id: bodyId,
      translation: {
        x: translation.x,
        y: translation.y,
        z: translation.z
      },
      rotation: {
        x: rotation.x,
        y: rotation.y,
        z: rotation.z,
        w: rotation.w
      }
    });
  });
  return states;
}

function resetCreature() {
  creatureBodies.forEach((entry) => {
    const [tx, ty, tz] = entry.initialTranslation;
    const [rx, ry, rz, rw] = entry.initialRotation;
    entry.body.setTranslation({ x: tx, y: ty, z: tz }, true);
    entry.body.setRotation({ x: rx, y: ry, z: rz, w: rw }, true);
    entry.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    entry.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
  });
  syncSharedState();
}

function instantiateCreature(genome) {
  if (!world) {
    return false;
  }
  const blueprint = buildMorphologyBlueprint(genome);
  if (blueprint.errors.length > 0) {
    postMessage({
      type: 'error',
      message: `Failed to build morph: ${blueprint.errors.join('; ')}`
    });
    return false;
  }

  clearCreature();

  const materialMap = {};
  Object.entries(blueprint.materials).forEach(([key, value]) => {
    materialMap[key] = { id: key, ...value };
  });

  const descriptors = blueprint.bodies.map((body) => {
    const translation = [...body.translation];
    const rotation = [...body.rotation];
    return {
      id: body.id,
      materialId: body.materialId,
      halfExtents: [...body.halfExtents],
      translation,
      rotation,
      density: body.density,
      linearDamping: body.linearDamping,
      angularDamping: body.angularDamping,
      material: { ...body.material }
    };
  });

  descriptors.forEach((descriptor) => {
    const bodyDesc = RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(descriptor.translation[0], descriptor.translation[1], descriptor.translation[2])
      .setRotation({
        x: descriptor.rotation[0],
        y: descriptor.rotation[1],
        z: descriptor.rotation[2],
        w: descriptor.rotation[3]
      })
      .setLinearDamping(descriptor.linearDamping ?? 0.05)
      .setAngularDamping(descriptor.angularDamping ?? 0.08);

    const rigidBody = world.createRigidBody(bodyDesc);
    const colliderDesc = RAPIER.ColliderDesc.cuboid(
      descriptor.halfExtents[0],
      descriptor.halfExtents[1],
      descriptor.halfExtents[2]
    )
      .setDensity(descriptor.density ?? 1)
      .setFriction(descriptor.material?.friction ?? 0.9)
      .setRestitution(descriptor.material?.restitution ?? 0.2);
    world.createCollider(colliderDesc, rigidBody);

    creatureBodies.set(descriptor.id, {
      body: rigidBody,
      initialTranslation: [...descriptor.translation],
      initialRotation: [...descriptor.rotation]
    });
    bodyOrder.push(descriptor.id);
  });

  creatureJoints = [];
  blueprint.joints.forEach((jointDef) => {
    const parentEntry = creatureBodies.get(jointDef.parentId);
    const childEntry = creatureBodies.get(jointDef.childId);
    if (!parentEntry || !childEntry) {
      return;
    }
    const parentAnchor = {
      x: jointDef.parentAnchor[0],
      y: jointDef.parentAnchor[1],
      z: jointDef.parentAnchor[2]
    };
    const childAnchor = {
      x: jointDef.childAnchor[0],
      y: jointDef.childAnchor[1],
      z: jointDef.childAnchor[2]
    };
    let jointData;
    if (jointDef.type === 'fixed') {
      jointData = RAPIER.JointData.fixed(
        parentAnchor,
        childAnchor,
        { x: 0, y: 0, z: 0, w: 1 },
        { x: 0, y: 0, z: 0, w: 1 }
      );
    } else if (jointDef.type === 'spherical') {
      jointData = RAPIER.JointData.spherical(parentAnchor, childAnchor);
    } else {
      const axis = {
        x: jointDef.axis[0],
        y: jointDef.axis[1],
        z: jointDef.axis[2]
      };
      jointData = RAPIER.JointData.revolute(parentAnchor, childAnchor, axis);
    }
    const jointHandle = world.createImpulseJoint(
      jointData,
      parentEntry.body,
      childEntry.body,
      true
    );
    if (jointDef.limits) {
      try {
        jointHandle.setLimits(jointDef.limits[0], jointDef.limits[1]);
      } catch (error) {
        console.warn('Failed to apply joint limits:', error);
      }
    }
    creatureJoints.push(jointHandle);
  });

  bodyDescriptorsCache = descriptors.map((descriptor) => ({
    id: descriptor.id,
    materialId: descriptor.materialId,
    halfExtents: [...descriptor.halfExtents],
    translation: [...descriptor.translation],
    rotation: [...descriptor.rotation],
    material: { ...descriptor.material }
  }));

  configureSharedState(bodyDescriptorsCache, materialMap);
  syncSharedState();
  return true;
}

async function initializeWorld() {
  try {
    await RAPIER.init();
    const gravity = new RAPIER.Vector3(0, -9.81, 0);
    world = new RAPIER.World(gravity);
    world.timestep = 1 / 60;

    const floorCollider = RAPIER.ColliderDesc.cuboid(7, 0.1, 6).setTranslation(0, -0.6, 0);
    world.createCollider(floorCollider);

    const defaultGenome = createDefaultMorphGenome();
    const spawned = instantiateCreature(defaultGenome);
    if (!spawned) {
      throw new Error('Default morph failed to spawn.');
    }

    ready = true;
    postMessage({
      type: 'ready',
      message: 'Rapier worker ready. Default morph spawned.'
    });

    if (pendingStart) {
      setRunning(true);
      pendingStart = false;
    }
  } catch (error) {
    postMessage({
      type: 'error',
      message: error instanceof Error ? error.message : String(error)
    });
  }
}

function setRunning(next) {
  if (!ready) {
    pendingStart = pendingStart || next;
    return;
  }
  if (running === next) {
    return;
  }
  running = next;
  if (running) {
    if (stepHandle === null) {
      stepHandle = setInterval(stepSimulation, 16);
    }
  } else if (stepHandle !== null) {
    clearInterval(stepHandle);
    stepHandle = null;
  }
  postMessage({ type: 'state', running });
}

function stepSimulation() {
  if (!world || creatureBodies.size === 0) {
    return;
  }

  world.step();

  if (sharedFloats) {
    syncSharedState();
  }

  const payload = {
    type: 'tick',
    timestamp: performance.now()
  };

  if (sharedFloats) {
    payload.version = Atomics.load(sharedMeta, META_VERSION_INDEX);
  } else {
    payload.bodies = collectBodyStates();
  }

  postMessage(payload);

  const rootId = bodyOrder[0];
  if (rootId) {
    const rootEntry = creatureBodies.get(rootId);
    if (rootEntry) {
      const translation = rootEntry.body.translation();
      if (translation.y < -10) {
        resetCreature();
      }
    }
  }
}

self.addEventListener('message', (event) => {
  const data = event.data;
  if (!data || typeof data !== 'object') {
    return;
  }
  if (data.type === 'start') {
    setRunning(true);
  } else if (data.type === 'pause') {
    setRunning(false);
  } else if (data.type === 'reset') {
    resetCreature();
  }
});

initializeWorld();
