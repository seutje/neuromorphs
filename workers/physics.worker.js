import RAPIER from 'https://cdn.jsdelivr.net/npm/@dimforge/rapier3d-compat@0.11.2/rapier.es.js';

const META_LENGTH = 2;
const META_VERSION_INDEX = 0;
const META_WRITE_LOCK_INDEX = 1;
const FLOATS_PER_BODY = 7;
const SHARED_BODY_IDS = ['test-cube'];

let world = null;
let cubeBody = null;
let running = false;
let ready = false;
let stepHandle = null;
let pendingStart = false;
let sharedBuffer = null;
let sharedMeta = null;
let sharedFloats = null;

async function initializeWorld() {
  try {
    await RAPIER.init();
    const gravity = new RAPIER.Vector3(0, -9.81, 0);
    world = new RAPIER.World(gravity);
    world.timestep = 1 / 60;

    const floorCollider = RAPIER.ColliderDesc.cuboid(6, 0.1, 6).setTranslation(0, -0.6, 0);
    world.createCollider(floorCollider);

    const bodyDesc = RAPIER.RigidBodyDesc.dynamic().setTranslation(0, 3, 0);
    cubeBody = world.createRigidBody(bodyDesc);
    const cubeCollider = RAPIER.ColliderDesc.cuboid(0.5, 0.5, 0.5).setRestitution(0.2);
    world.createCollider(cubeCollider, cubeBody);

    prepareSharedState();

    ready = true;
    postMessage({
      type: 'ready',
      message: 'Rapier initialized in worker. Drop test prepared.'
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

function prepareSharedState() {
  if (typeof SharedArrayBuffer === 'undefined') {
    postMessage({
      type: 'shared-state-error',
      message:
        'SharedArrayBuffer is unavailable. Serve with COOP/COEP headers to enable shared memory.'
    });
    return;
  }
  try {
    const metaBytes = META_LENGTH * Int32Array.BYTES_PER_ELEMENT;
    sharedBuffer = new SharedArrayBuffer(
      metaBytes + FLOATS_PER_BODY * SHARED_BODY_IDS.length * Float32Array.BYTES_PER_ELEMENT
    );
    sharedMeta = new Int32Array(sharedBuffer, 0, META_LENGTH);
    sharedFloats = new Float32Array(sharedBuffer, metaBytes, SHARED_BODY_IDS.length * FLOATS_PER_BODY);
    Atomics.store(sharedMeta, META_VERSION_INDEX, 0);
    Atomics.store(sharedMeta, META_WRITE_LOCK_INDEX, 0);
    postMessage({
      type: 'shared-state',
      buffer: sharedBuffer,
      layout: {
        metaLength: META_LENGTH,
        floatsPerBody: FLOATS_PER_BODY,
        bodyCount: SHARED_BODY_IDS.length,
        bodyIds: SHARED_BODY_IDS,
        metaIndices: {
          version: META_VERSION_INDEX,
          writeLock: META_WRITE_LOCK_INDEX
        }
      }
    });
    const initialState = collectCubeState();
    if (initialState) {
      writeSharedState(initialState.translation, initialState.rotation);
    }
  } catch (error) {
    sharedBuffer = null;
    sharedMeta = null;
    sharedFloats = null;
    postMessage({
      type: 'shared-state-error',
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

function resetCube() {
  if (!cubeBody) {
    return;
  }
  cubeBody.setTranslation({ x: 0, y: 3, z: 0 }, true);
  cubeBody.setLinvel({ x: 0, y: 0, z: 0 }, true);
  cubeBody.setAngvel({ x: 0, y: 0, z: 0 }, true);
  if (sharedFloats) {
    const state = collectCubeState();
    if (state) {
      writeSharedState(state.translation, state.rotation);
    }
  }
}

function collectCubeState() {
  if (!cubeBody) {
    return null;
  }
  const translation = cubeBody.translation();
  const rotation = cubeBody.rotation();
  return {
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
  };
}

function writeSharedState(translation, rotation) {
  if (!sharedMeta || !sharedFloats) {
    return;
  }
  Atomics.store(sharedMeta, META_WRITE_LOCK_INDEX, 1);
  try {
    sharedFloats[0] = translation.x;
    sharedFloats[1] = translation.y;
    sharedFloats[2] = translation.z;
    sharedFloats[3] = rotation.x;
    sharedFloats[4] = rotation.y;
    sharedFloats[5] = rotation.z;
    sharedFloats[6] = rotation.w;
    Atomics.add(sharedMeta, META_VERSION_INDEX, 1);
  } finally {
    Atomics.store(sharedMeta, META_WRITE_LOCK_INDEX, 0);
  }
}

function stepSimulation() {
  if (!world || !cubeBody) {
    return;
  }

  world.step();

  const state = collectCubeState();
  if (!state) {
    return;
  }

  if (sharedFloats) {
    writeSharedState(state.translation, state.rotation);
  }

  const payload = {
    type: 'tick',
    timestamp: performance.now()
  };

  if (sharedFloats) {
    payload.version = Atomics.load(sharedMeta, META_VERSION_INDEX);
  } else {
    payload.bodies = [
      {
        id: 'test-cube',
        translation: state.translation,
        rotation: state.rotation
      }
    ];
  }

  postMessage(payload);

  if (state.translation.y < -10) {
    resetCube();
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
    resetCube();
  }
});

initializeWorld();
