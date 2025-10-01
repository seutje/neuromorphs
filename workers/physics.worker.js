import RAPIER from 'https://cdn.jsdelivr.net/npm/@dimforge/rapier3d-compat@0.11.2/rapier.es.js';

let world = null;
let cubeBody = null;
let running = false;
let ready = false;
let stepHandle = null;
let pendingStart = false;

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
}

function stepSimulation() {
  if (!world || !cubeBody) {
    return;
  }

  world.step();

  const translation = cubeBody.translation();
  const rotation = cubeBody.rotation();

  postMessage({
    type: 'tick',
    timestamp: performance.now(),
    bodies: [
      {
        id: 'test-cube',
        translation: { x: translation.x, y: translation.y, z: translation.z },
        rotation: { x: rotation.x, y: rotation.y, z: rotation.z, w: rotation.w }
      }
    ]
  });

  if (translation.y < -10) {
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
