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
  ARENA_FLOOR_Y,
  ARENA_HALF_EXTENTS,
  OBJECTIVE_HALF_EXTENTS,
  OBJECTIVE_POSITION,
  horizontalDistanceToObjective
} from '../public/environment/arena.js';
import { MAX_JOINT_ANGULAR_DELTA } from '../public/physics/constants.js';
import { DEFAULT_STAGE_ID, getStageDefinition } from '../public/environment/stages.js';
import { applyGroundClearance } from '../public/evolution/simulation/grounding.js';

function createInteractionGroup(membership, filter) {
  const membershipMask = membership & 0xffff;
  const filterMask = filter & 0xffff;
  return (membershipMask << 16) | filterMask;
}

const META_LENGTH = 2;
const META_VERSION_INDEX = 0;
const META_WRITE_LOCK_INDEX = 1;
const FLOATS_PER_BODY = 7;
const COLLISION_GROUP_CREATURE = createInteractionGroup(0b0001, 0xffff);
const COLLISION_GROUP_ENVIRONMENT = createInteractionGroup(0b0010, 0xffff);

let world = null;
let running = false;
let ready = false;
let stepHandle = null;
let pendingStart = false;
let requestedStageId = DEFAULT_STAGE_ID;
let stageColliders = [];

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
let sharedMaterialMap = {};
let additionalInstanceCount = 0;
const controllerInstances = new Map();

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

function computeInstanceOffset(index) {
  if (!Number.isFinite(index) || index < 0) {
    return { x: 0, y: 0, z: 0 };
  }
  const spacing = 3;
  const step = Math.floor(index / 2) + 1;
  const direction = index % 2 === 0 ? 1 : -1;
  return { x: 0, y: 0, z: direction * step * spacing };
}

function cloneControllerBlueprintForInstance(blueprint, prefix) {
  if (!blueprint || typeof blueprint !== 'object') {
    return null;
  }
  const clone = JSON.parse(JSON.stringify(blueprint));
  if (Array.isArray(clone.nodes)) {
    clone.nodes.forEach((node) => {
      if (node?.source && typeof node.source === 'object' && typeof node.source.id === 'string' && prefix) {
        node.source.id = `${prefix}${node.source.id}`;
      }
      if (node?.target && typeof node.target === 'object' && typeof node.target.id === 'string' && prefix) {
        node.target.id = `${prefix}${node.target.id}`;
      }
    });
    clone.sensors = clone.nodes.filter((node) => node?.type === 'sensor');
    clone.actuators = clone.nodes.filter((node) => node?.type === 'actuator');
  }
  if (!Array.isArray(clone.connections)) {
    clone.connections = [];
  }
  if (!Array.isArray(clone.errors)) {
    clone.errors = [];
  }
  if (!clone.metadata || typeof clone.metadata !== 'object') {
    clone.metadata = {};
  }
  return clone;
}

function _collectControllerActuatorIds() {
  const ids = new Set();
  controllerInstances.forEach((instance, key) => {
    const runtime = instance?.runtime;
    if (!runtime || !Array.isArray(runtime.actuators)) {
      return;
    }
    runtime.actuators.forEach((actuatorId) => {
      if (typeof actuatorId !== 'string') {
        return;
      }
      if (instance.prefix) {
        ids.add(`${key}:${actuatorId}`);
      } else {
        ids.add(actuatorId);
      }
    });
  });
  return Array.from(ids);
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
  sharedMaterialMap = {};
  additionalInstanceCount = 0;
  controllerInstances.clear();
}

function clearStageColliders() {
  if (!world || stageColliders.length === 0) {
    stageColliders = [];
    return;
  }
  stageColliders.forEach((collider) => {
    if (collider) {
      world.removeCollider(collider, true);
    }
  });
  stageColliders = [];
}

function applyStageToWorld(stageId) {
  const stage = getStageDefinition(stageId ?? requestedStageId);
  if (!stage) {
    return null;
  }
  requestedStageId = stage.id;
  if (!world) {
    return stage;
  }
  clearStageColliders();
  if (Array.isArray(stage.obstacles)) {
    stage.obstacles.forEach((obstacle) => {
      if (!obstacle || obstacle.type !== 'box') {
        return;
      }
      const halfExtents = obstacle.halfExtents ?? { x: 0.5, y: 0.5, z: 0.5 };
      const translation = obstacle.translation ?? { x: 0, y: 0, z: 0 };
      const colliderDesc = RAPIER.ColliderDesc.cuboid(
        halfExtents.x ?? 0.5,
        halfExtents.y ?? 0.5,
        halfExtents.z ?? 0.5
      )
        .setTranslation(
          translation.x ?? 0,
          translation.y ?? 0,
          translation.z ?? 0
        )
        .setCollisionGroups(COLLISION_GROUP_ENVIRONMENT);
      const collider = world.createCollider(colliderDesc);
      stageColliders.push(collider);
    });
  }
  return stage;
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
  controllerInstances.forEach((instance) => {
    if (instance?.runtime?.reset) {
      instance.runtime.reset();
    }
  });
  syncSharedState();
}

function instantiateCreature(morphGenome, controllerGenome, options = {}) {
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

  const { clearExisting = true, prefixIds = !clearExisting, offset = null } = options;

  if (clearExisting) {
    clearCreature();
  }

  const isAdditional = Boolean(prefixIds);
  const spawnOffset =
    offset ?? (isAdditional ? computeInstanceOffset(additionalInstanceCount) : { x: 0, y: 0, z: 0 });
  const prefixBase = isAdditional
    ? `${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6)
        .toString(36)
        .slice(0, 4)}-`
    : '';
  const instanceKey = isAdditional ? prefixBase : 'primary';

  const materialSource = clearExisting ? {} : { ...sharedMaterialMap };
  Object.entries(blueprint.materials).forEach(([key, value]) => {
    const materialId = isAdditional ? `${prefixBase}${key}` : key;
    materialSource[materialId] = { id: materialId, ...value };
  });

  const descriptors = blueprint.bodies.map((body) => {
    const translation = [
      (body.translation?.[0] ?? 0) + (spawnOffset.x ?? 0),
      (body.translation?.[1] ?? 0) + (spawnOffset.y ?? 0),
      (body.translation?.[2] ?? 0) + (spawnOffset.z ?? 0)
    ];
    const rotation = [...body.rotation];
    return {
      id: isAdditional ? `${prefixBase}${body.id}` : body.id,
      materialId: isAdditional ? `${prefixBase}${body.materialId}` : body.materialId,
      halfExtents: [...body.halfExtents],
      translation,
      rotation,
      density: body.density,
      linearDamping: body.linearDamping,
      angularDamping: body.angularDamping,
      material: { ...body.material }
    };
  });

  applyGroundClearance(descriptors);

  descriptors.forEach((descriptor) => {
    const bodyDesc = RAPIER.RigidBodyDesc.dynamic()
      .setCcdEnabled(true)
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

  blueprint.joints.forEach((jointDef) => {
    const parentId = isAdditional ? `${prefixBase}${jointDef.parentId}` : jointDef.parentId;
    const childId = isAdditional ? `${prefixBase}${jointDef.childId}` : jointDef.childId;
    const parentEntry = creatureBodies.get(parentId);
    const childEntry = creatureBodies.get(childId);
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
    const jointHandle = world.createImpulseJoint(jointData, parentEntry.body, childEntry.body, true);
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
      id: isAdditional ? `${prefixBase}${jointDef.id}` : jointDef.id,
      parentId,
      childId,
      axis: [...jointDef.axis],
      limits: jointDef.limits ? [...jointDef.limits] : null,
      handle: jointHandle
    };
    creatureJointDescriptors.push(descriptor);
    creatureJointMap.set(descriptor.id, descriptor);
  });

  const descriptorCopies = descriptors.map((descriptor) => ({
    id: descriptor.id,
    materialId: descriptor.materialId,
    halfExtents: [...descriptor.halfExtents],
    translation: [...descriptor.translation],
    rotation: [...descriptor.rotation],
    material: { ...descriptor.material }
  }));

  bodyDescriptorsCache = clearExisting
    ? descriptorCopies
    : bodyDescriptorsCache.concat(descriptorCopies);
  sharedMaterialMap = { ...materialSource };

  configureSharedState(bodyDescriptorsCache, sharedMaterialMap);
  syncSharedState();

  const controllerSource = controllerGenome ?? createDefaultControllerGenome();
  const controllerBlueprint = buildControllerBlueprint(controllerSource);
  if (controllerBlueprint.errors.length > 0) {
    postMessage({
      type: 'error',
      message: `Failed to build controller: ${controllerBlueprint.errors.join('; ')}`
    });
  } else {
    const instanceBlueprint = cloneControllerBlueprintForInstance(
      controllerBlueprint,
      isAdditional ? prefixBase : ''
    );
    if (!instanceBlueprint) {
      postMessage({
        type: 'error',
        message: 'Controller blueprint could not be prepared.'
      });
    } else {
      const runtime = createControllerRuntime(instanceBlueprint);
      if (!runtime) {
        postMessage({
          type: 'error',
          message: 'Controller runtime failed to initialize.'
        });
      } else {
        controllerInstances.set(instanceKey, { runtime, prefix: isAdditional ? prefixBase : '' });
      }
    }
  }
  if (isAdditional) {
    additionalInstanceCount += 1;
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
    rootVelocity: root?.velocity
      ? { ...root.velocity }
      : { x: 0, y: 0, z: 0 },
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

    applyStageToWorld(requestedStageId);

    configureSharedState([], {});
    syncSharedState();

    ready = true;
    postMessage({
      type: 'ready',
      message: 'Rapier worker ready. Awaiting creature spawn.'
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

  const dt = world.timestep ?? 1 / 60;
  const sensors = gatherSensorSnapshot();
  const commands = [];
  let controllerTelemetry = null;
  if (controllerInstances.size > 0) {
    const runtimeResults = [];
    controllerInstances.forEach((instance, key) => {
      const runtime = instance?.runtime;
      if (!runtime || typeof runtime.update !== 'function') {
        return;
      }
      const result = runtime.update(dt, sensors);
      if (!result) {
        return;
      }
      runtimeResults.push({ key, prefix: instance.prefix ?? '', result });
      const resultCommands = Array.isArray(result.commands) ? result.commands : [];
      resultCommands.forEach((command) => {
        if (!command || command.target?.type !== 'joint' || typeof command.target.id !== 'string') {
          return;
        }
        const actuatorId = typeof command.id === 'string' ? command.id : null;
        const decoratedId = instance.prefix && actuatorId ? `${key}:${actuatorId}` : actuatorId;
        commands.push({
          id: decoratedId,
          target: { type: 'joint', id: command.target.id },
          value: command.value
        });
      });
    });
    if (runtimeResults.length === 1) {
      const only = runtimeResults[0].result;
      if (Array.isArray(only?.nodeOutputs)) {
        controllerTelemetry = only.nodeOutputs;
      }
    } else if (runtimeResults.length > 1) {
      const combined = [];
      runtimeResults.forEach(({ key, prefix, result }) => {
        if (!Array.isArray(result?.nodeOutputs)) {
          return;
        }
        result.nodeOutputs.forEach((node) => {
          if (!node || typeof node !== 'object') {
            return;
          }
          const entry = { ...node, instance: key };
          if (prefix && typeof node.id === 'string') {
            entry.id = `${key}:${node.id}`;
          }
          combined.push(entry);
        });
      });
      if (combined.length > 0) {
        controllerTelemetry = combined;
      }
    }
  }

  if (commands.length > 0) {
    applyControllerCommands({ commands });
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

  if (controllerTelemetry) {
    payload.controller = controllerTelemetry;
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
  } else if (data.type === 'load-stage') {
    const wasRunning = running;
    const hadBodies = creatureBodies.size > 0;
    setRunning(false);
    const stage = applyStageToWorld(data.stageId);
    if (!stage) {
      postMessage({ type: 'stage-error', message: 'Unable to resolve the requested stage.' });
      return;
    }
    if (hadBodies) {
      clearCreature();
      configureSharedState([], {});
      syncSharedState();
    }
    if (wasRunning && ready) {
      setRunning(true);
    }
    postMessage({ type: 'stage-loaded', stageId: stage.id });
  } else if (data.type === 'clear-stage-models') {
    const wasRunning = running;
    if (wasRunning) {
      setRunning(false);
    }
    clearCreature();
    configureSharedState([], {});
    syncSharedState();
    postMessage({ type: 'stage-cleared' });
  } else if (data.type === 'preview-individual') {
    const individual =
      data.individual && typeof data.individual === 'object' ? data.individual : null;
    setRunning(false);
    const spawned = instantiateCreature(individual?.morph, individual?.controller);
    if (spawned) {
      setRunning(true);
    }
  } else if (data.type === 'add-individual') {
    const individual =
      data.individual && typeof data.individual === 'object' ? data.individual : null;
    if (!individual) {
      postMessage({ type: 'error', message: 'Invalid individual payload for add.' });
      return;
    }
    const wasRunning = running;
    if (wasRunning) {
      setRunning(false);
    }
    const hasExisting = creatureBodies.size > 0;
    const spawned = instantiateCreature(individual?.morph, individual?.controller, {
      clearExisting: !hasExisting,
      prefixIds: hasExisting
    });
    if (!spawned) {
      postMessage({ type: 'error', message: 'Failed to add the requested individual.' });
    }
    if (wasRunning) {
      setRunning(true);
    }
  }
});

initializeWorld();
