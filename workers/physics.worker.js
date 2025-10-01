import RAPIER from 'https://cdn.jsdelivr.net/npm/@dimforge/rapier3d-compat@0.11.2/rapier.es.js';
import {
  buildMorphologyBlueprint,
  createDefaultMorphGenome
} from '../genomes/morphGenome.js';
import {
  buildControllerBlueprint,
  createDefaultControllerGenome
} from '../genomes/ctrlGenome.js';
import { createControllerRuntime } from './controllerRuntime.js';
import {
  createReplayRecorder,
  decodeReplayBuffer,
  createReplayPlayback
} from './replayRecorder.js';
import {
  ARENA_FLOOR_Y,
  ARENA_HALF_EXTENTS,
  OBJECTIVE_HALF_EXTENTS,
  OBJECTIVE_POSITION,
  horizontalDistanceToObjective
} from '../public/environment/arena.js';

function createInteractionGroup(membership, filter) {
  const membershipMask = membership & 0xffff;
  const filterMask = filter & 0xffff;
  return (membershipMask << 16) | filterMask;
}

const META_LENGTH = 2;
const META_VERSION_INDEX = 0;
const META_WRITE_LOCK_INDEX = 1;
const FLOATS_PER_BODY = 7;
const MAX_JOINT_ANGULAR_DELTA = 15; // rad/s per simulation step
const COLLISION_GROUP_CREATURE = createInteractionGroup(0b0001, 0xfffe);
const COLLISION_GROUP_ENVIRONMENT = createInteractionGroup(0b0010, 0xffff);

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
let creatureJointDescriptors = [];
let creatureJointMap = new Map();
let controllerRuntime = null;
let replayRecorder = createReplayRecorder();
let activeReplay = null;

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function normalizeVector([x, y, z]) {
  const length = Math.hypot(x, y, z);
  if (length === 0) {
    return [0, 0, 0];
  }
  return [x / length, y / length, z / length];
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

function projectAngularInertia(matrix, axis) {
  if (!matrix || !matrix.elements || !Array.isArray(axis)) {
    return 0;
  }
  const [m11, m12, m13, m22, m23, m33] = matrix.elements;
  const [x, y, z] = axis;
  return (
    m11 * x * x +
    2 * m12 * x * y +
    2 * m13 * x * z +
    m22 * y * y +
    2 * m23 * y * z +
    m33 * z * z
  );
}

function normalizeVector3({ x, y, z }) {
  const length = Math.hypot(x, y, z);
  if (length === 0) {
    return null;
  }
  return { x: x / length, y: y / length, z: z / length };
}

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
  creatureJointDescriptors = [];
  creatureJointMap.clear();
  controllerRuntime = null;
  replayRecorder.clear();
}

function isReplayActive() {
  return Boolean(activeReplay);
}

function startReplayRecording() {
  if (isReplayActive()) {
    return;
  }
  if (!world) {
    return;
  }
  replayRecorder.start({
    jointDescriptors: creatureJointDescriptors,
    actuatorIds: controllerRuntime?.actuators ?? [],
    timestep: world.timestep ?? 1 / 60
  });
}

function stopReplayRecording() {
  if (isReplayActive()) {
    return;
  }
  if (!replayRecorder.isRecording()) {
    return;
  }
  const metadata = replayRecorder.getMetadata();
  const buffer = replayRecorder.stop();
  if (buffer) {
    postMessage(
      {
        type: 'replay-recorded',
        buffer,
        metadata
      },
      [buffer]
    );
  }
}

function stopReplayPlayback({ notify = true } = {}) {
  if (!isReplayActive()) {
    return;
  }
  activeReplay = null;
  if (notify) {
    postMessage({ type: 'replay-stopped' });
  }
}

function startReplayPlayback(buffer) {
  if (!(buffer instanceof ArrayBuffer)) {
    postMessage({ type: 'replay-error', message: 'Replay buffer missing or invalid.' });
    return false;
  }
  const decoded = decodeReplayBuffer(buffer);
  if (!decoded || !Array.isArray(decoded.frames) || decoded.frames.length === 0) {
    postMessage({ type: 'replay-error', message: 'Replay data could not be decoded.' });
    return false;
  }
  resetCreature();
  activeReplay = createReplayPlayback(decoded);
  if (!activeReplay || activeReplay.getFrameCount() === 0) {
    activeReplay = null;
    postMessage({ type: 'replay-error', message: 'Replay contains no frames.' });
    return false;
  }
  postMessage({ type: 'replay-started', metadata: activeReplay.getMetadata?.() ?? null });
  setRunning(true);
  return true;
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
  if (controllerRuntime) {
    controllerRuntime.reset();
  }
  syncSharedState();
}

function instantiateCreature(morphGenome, controllerGenome) {
  if (!world) {
    return false;
  }
  const morph = morphGenome ?? createDefaultMorphGenome();
  const blueprint = buildMorphologyBlueprint(morph);
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
      .setRestitution(descriptor.material?.restitution ?? 0.2)
      .setCollisionGroups(COLLISION_GROUP_CREATURE);
    const collider = world.createCollider(colliderDesc, rigidBody);

    creatureBodies.set(descriptor.id, {
      body: rigidBody,
      initialTranslation: [...descriptor.translation],
      initialRotation: [...descriptor.rotation],
      halfExtents: [...descriptor.halfExtents],
      collider
    });
    bodyOrder.push(descriptor.id);
  });

  creatureJoints = [];
  creatureJointDescriptors = [];
  creatureJointMap.clear();
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
    if (typeof jointHandle?.setContactsEnabled === 'function') {
      jointHandle.setContactsEnabled(false);
    }
    if (jointDef.limits) {
      try {
        jointHandle.setLimits(jointDef.limits[0], jointDef.limits[1]);
      } catch (error) {
        console.warn('Failed to apply joint limits:', error);
      }
    }
    creatureJoints.push(jointHandle);
    const descriptor = {
      id: jointDef.id,
      parentId: jointDef.parentId,
      childId: jointDef.childId,
      axis: [...jointDef.axis],
      limits: jointDef.limits ? [...jointDef.limits] : null,
      handle: jointHandle
    };
    creatureJointDescriptors.push(descriptor);
    creatureJointMap.set(descriptor.id, descriptor);
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

  const controllerSource = controllerGenome ?? createDefaultControllerGenome();
  const controllerBlueprint = buildControllerBlueprint(controllerSource);
  if (controllerBlueprint.errors.length > 0) {
    postMessage({
      type: 'error',
      message: `Failed to build controller: ${controllerBlueprint.errors.join('; ')}`
    });
  } else {
    controllerRuntime = createControllerRuntime(controllerBlueprint);
    if (!controllerRuntime) {
      postMessage({
        type: 'error',
        message: 'Controller runtime failed to initialize.'
      });
    }
  }
  return true;
}

function gatherSensorSnapshot() {
  const bodies = [];
  const bodyMap = new Map();
  creatureBodies.forEach((entry, bodyId) => {
    const translation = entry.body.translation();
    const linvel = entry.body.linvel();
    const angvel = entry.body.angvel();
    const halfExtents = entry.halfExtents || [0.5, 0.5, 0.5];
    const footHeight = translation.y - halfExtents[1];
    const contact = footHeight <= -0.48;
    const snapshot = {
      id: bodyId,
      height: translation.y,
      velocity: {
        x: linvel.x,
        y: linvel.y,
        z: linvel.z
      },
      speed: Math.hypot(linvel.x, linvel.y, linvel.z),
      angularVelocity: {
        x: angvel.x,
        y: angvel.y,
        z: angvel.z
      },
      contact
    };
    bodies.push(snapshot);
    bodyMap.set(bodyId, snapshot);
  });

  const joints = creatureJointDescriptors.map((descriptor) => {
    const joint = descriptor.handle;
    let angle = 0;
    let velocity = 0;
    if (joint) {
      try {
        if (typeof joint.angles === 'function') {
          const result = joint.angles();
          if (Array.isArray(result)) {
            angle = Number(result[0]) || 0;
          } else {
            angle = Number(result) || 0;
          }
        } else if (typeof joint.angle === 'function') {
          angle = Number(joint.angle()) || 0;
        }
      } catch (_error) {
        angle = 0;
      }
      try {
        if (typeof joint.angularVelocity === 'function') {
          velocity = Number(joint.angularVelocity()) || 0;
        }
      } catch (_error) {
        velocity = 0;
      }
    }
    return {
      id: descriptor.id,
      parentId: descriptor.parentId,
      childId: descriptor.childId,
      angle,
      velocity,
      limits: descriptor.limits ? [...descriptor.limits] : null
    };
  });

  const rootId = bodyOrder[0];
  const root = rootId ? bodyMap.get(rootId) : null;
  const rootEntry = rootId ? creatureBodies.get(rootId) : null;
  const rootTranslation = rootEntry?.body.translation();
  const rootPosition = rootTranslation
    ? { x: rootTranslation.x, y: rootTranslation.y, z: rootTranslation.z }
    : { x: 0, y: 0, z: 0 };
  const objectiveDistance = horizontalDistanceToObjective(rootPosition, OBJECTIVE_POSITION);
  const footCandidate = bodies.find((body) => body.id !== rootId) || null;
  const summary = {
    rootHeight: root?.height ?? 0,
    rootVelocityY: root?.velocity?.y ?? 0,
    rootSpeed: root?.speed ?? 0,
    footContact: footCandidate?.contact ?? false,
    primaryJointAngle: joints[0]?.angle ?? 0,
    primaryJointVelocity: joints[0]?.velocity ?? 0,
    rootPosition,
    objectiveDistance
  };

  return {
    bodies,
    joints,
    summary
  };
}

function applyControllerCommands(result) {
  if (!result || !Array.isArray(result.commands)) {
    return;
  }
  result.commands.forEach((command) => {
    if (!command || command.target?.type !== 'joint') {
      return;
    }
    const descriptor = creatureJointMap.get(command.target.id);
    if (!descriptor) {
      return;
    }
    const parentEntry = creatureBodies.get(descriptor.parentId);
    const childEntry = creatureBodies.get(descriptor.childId);
    if (!parentEntry || !childEntry) {
      return;
    }
    const axis = normalizeVector(descriptor.axis || [0, 1, 0]);
    const parentRotation = parentEntry.body.rotation();
    const worldAxisVector = applyQuaternion(
      [parentRotation.x, parentRotation.y, parentRotation.z, parentRotation.w],
      axis
    );
    const normalizedAxis = normalizeVector3({
      x: worldAxisVector[0],
      y: worldAxisVector[1],
      z: worldAxisVector[2]
    });
    if (!normalizedAxis) {
      return;
    }
    const commandValue = clamp(command.value ?? 0, -1, 1);
    if (commandValue === 0) {
      return;
    }
    const parentInertiaMatrix = parentEntry.body.effectiveAngularInertia(normalizedAxis);
    const childInertiaMatrix = childEntry.body.effectiveAngularInertia(normalizedAxis);
    const parentInertia = projectAngularInertia(parentInertiaMatrix, [
      normalizedAxis.x,
      normalizedAxis.y,
      normalizedAxis.z
    ]);
    const childInertia = projectAngularInertia(childInertiaMatrix, [
      normalizedAxis.x,
      normalizedAxis.y,
      normalizedAxis.z
    ]);
    const baseInertia = Math.min(parentInertia, childInertia);
    if (!Number.isFinite(baseInertia) || baseInertia <= 0) {
      return;
    }
    const impulseMagnitude = commandValue * baseInertia * MAX_JOINT_ANGULAR_DELTA;
    if (impulseMagnitude === 0) {
      return;
    }
    const torque = {
      x: normalizedAxis.x * impulseMagnitude,
      y: normalizedAxis.y * impulseMagnitude,
      z: normalizedAxis.z * impulseMagnitude
    };
    childEntry.body.applyTorqueImpulse(torque, true);
    parentEntry.body.applyTorqueImpulse(
      { x: -torque.x, y: -torque.y, z: -torque.z },
      true
    );
  });
}

async function initializeWorld() {
  try {
    await RAPIER.init();
    const gravity = new RAPIER.Vector3(0, -9.81, 0);
    world = new RAPIER.World(gravity);
    world.timestep = 1 / 60;

    const floorCollider = RAPIER.ColliderDesc.cuboid(
      ARENA_HALF_EXTENTS.x,
      ARENA_HALF_EXTENTS.y,
      ARENA_HALF_EXTENTS.z
    )
      .setTranslation(0, ARENA_FLOOR_Y, 0)
      .setCollisionGroups(COLLISION_GROUP_ENVIRONMENT);
    world.createCollider(floorCollider);

    const objectiveCollider = RAPIER.ColliderDesc.cuboid(
      OBJECTIVE_HALF_EXTENTS.x,
      OBJECTIVE_HALF_EXTENTS.y,
      OBJECTIVE_HALF_EXTENTS.z
    )
      .setTranslation(OBJECTIVE_POSITION.x, OBJECTIVE_POSITION.y, OBJECTIVE_POSITION.z)
      .setCollisionGroups(COLLISION_GROUP_ENVIRONMENT);
    world.createCollider(objectiveCollider);

    const defaultMorph = createDefaultMorphGenome();
    const defaultController = createDefaultControllerGenome();
    const spawned = instantiateCreature(defaultMorph, defaultController);
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
    if (!isReplayActive()) {
      startReplayRecording();
    }
    if (stepHandle === null) {
      stepHandle = setInterval(stepSimulation, 16);
    }
  } else if (stepHandle !== null) {
    clearInterval(stepHandle);
    stepHandle = null;
    if (!isReplayActive()) {
      stopReplayRecording();
    }
  }
  postMessage({ type: 'state', running });
}

function stepSimulation() {
  if (!world || creatureBodies.size === 0) {
    return;
  }

  const dt = world.timestep ?? 1 / 60;
  const sensors = gatherSensorSnapshot();
  let controllerResult = null;
  let commands = [];
  if (isReplayActive()) {
    const frame = activeReplay.next();
    if (!frame) {
      stopReplayPlayback({ notify: false });
      setRunning(false);
      postMessage({ type: 'replay-complete' });
      return;
    }
    commands = frame.commands.map((command) => ({
      id: command.actuatorId ?? undefined,
      target: { type: 'joint', id: command.targetId },
      value: command.value
    }));
  } else if (controllerRuntime) {
    controllerResult = controllerRuntime.update(dt, sensors);
    commands = Array.isArray(controllerResult?.commands) ? controllerResult.commands : [];
  }

  if (commands.length > 0) {
    applyControllerCommands({ commands });
  }

  if (!isReplayActive() && replayRecorder.isRecording()) {
    replayRecorder.record({ dt, commands });
  }

  world.step();

  if (sharedFloats) {
    syncSharedState();
  }

  const payload = {
    type: 'tick',
    timestamp: performance.now(),
    sensors
  };

  if (sharedFloats) {
    payload.version = Atomics.load(sharedMeta, META_VERSION_INDEX);
  } else {
    payload.bodies = collectBodyStates();
  }

  if (controllerResult?.nodeOutputs) {
    payload.controller = controllerResult.nodeOutputs;
  }

  if (commands.length > 0) {
    payload.commands = commands.map((command) => ({
      id: command.id ?? null,
      target: command.target,
      value: command.value
    }));
  }

  postMessage(payload);

  const rootId = bodyOrder[0];
  if (rootId) {
    const rootEntry = creatureBodies.get(rootId);
    if (rootEntry) {
      const translation = rootEntry.body.translation();
      if (!isReplayActive() && translation.y < -10) {
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
    stopReplayPlayback({ notify: false });
    resetCreature();
  } else if (data.type === 'preview-individual') {
    const individual =
      data.individual && typeof data.individual === 'object' ? data.individual : null;
    stopReplayPlayback({ notify: false });
    setRunning(false);
    const spawned = instantiateCreature(individual?.morph, individual?.controller);
    if (spawned) {
      setRunning(true);
    }
  } else if (data.type === 'play-replay') {
    const buffer = data.buffer instanceof ArrayBuffer ? data.buffer : null;
    if (!buffer) {
      postMessage({ type: 'replay-error', message: 'Replay buffer missing.' });
      return;
    }
    startReplayPlayback(buffer);
  } else if (data.type === 'stop-replay') {
    stopReplayPlayback();
    setRunning(false);
    resetCreature();
  }
});

initializeWorld();
