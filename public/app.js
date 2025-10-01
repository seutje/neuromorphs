import {
  AmbientLight,
  BoxGeometry,
  Color,
  DirectionalLight,
  Mesh,
  MeshStandardMaterial,
  PerspectiveCamera,
  Scene,
  Vector3,
  WebGLRenderer
} from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';

const canvas = document.querySelector('#viewport');
const statusMessage = document.querySelector('#status-message');
const actionButton = document.querySelector('#action-button');

if (!canvas) {
  throw new Error('Viewport canvas not found.');
}

const renderer = new WebGLRenderer({
  canvas,
  antialias: true,
  alpha: true
});
renderer.setPixelRatio(window.devicePixelRatio);

const scene = new Scene();
scene.background = new Color('#020617');

const camera = new PerspectiveCamera(45, 1, 0.1, 100);
camera.position.set(4, 3, 6);
camera.lookAt(new Vector3(0, 0, 0));

const ambient = new AmbientLight('#e2e8f0', 0.6);
const keyLight = new DirectionalLight('#60a5fa', 0.8);
keyLight.position.set(5, 6, 4);
const fillLight = new DirectionalLight('#f472b6', 0.3);
fillLight.position.set(-4, 2, -5);
scene.add(ambient, keyLight, fillLight);

const groundGeometry = new BoxGeometry(10, 0.2, 10);
const groundMaterial = new MeshStandardMaterial({
  color: '#1e293b',
  roughness: 0.85,
  metalness: 0.05
});
const ground = new Mesh(groundGeometry, groundMaterial);
ground.position.y = -0.6;
scene.add(ground);

const cubeGeometry = new BoxGeometry(1, 1, 1);
const cubeMaterial = new MeshStandardMaterial({
  color: '#38bdf8',
  roughness: 0.35,
  metalness: 0.1
});
const cube = new Mesh(cubeGeometry, cubeMaterial);
scene.add(cube);

const sharedBodyMeshes = {
  'test-cube': cube
};

const META_DEFAULT_VERSION_INDEX = 0;
const META_DEFAULT_WRITE_LOCK_INDEX = 1;

let sharedStateMeta = null;
let sharedStateFloats = null;
let sharedStateLayout = null;
let sharedStateVersion = 0;
let sharedStateEnabled = false;

const rendererClock = {
  lastLogTimestamp: 0
};

function resize() {
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  if (width === 0 || height === 0) {
    return;
  }
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  renderer.setSize(width, height, false);
}

window.addEventListener('resize', resize);
resize();

function updateSharedTransforms() {
  if (!sharedStateMeta || !sharedStateFloats || !sharedStateLayout) {
    return;
  }
  const {
    metaLength,
    floatsPerBody,
    bodyIds,
    metaIndices
  } = sharedStateLayout;
  if (!Array.isArray(bodyIds) || bodyIds.length === 0 || !floatsPerBody) {
    return;
  }
  const versionIndex = metaIndices?.version ?? META_DEFAULT_VERSION_INDEX;
  const writeLockIndex = metaIndices?.writeLock ?? META_DEFAULT_WRITE_LOCK_INDEX;
  if (versionIndex >= metaLength || writeLockIndex >= metaLength) {
    return;
  }
  const writeLock = Atomics.load(sharedStateMeta, writeLockIndex);
  if (writeLock !== 0) {
    return;
  }
  const version = Atomics.load(sharedStateMeta, versionIndex);
  if (version === sharedStateVersion) {
    return;
  }
  sharedStateVersion = version;
  for (let i = 0; i < bodyIds.length; i += 1) {
    const bodyId = bodyIds[i];
    const mesh = sharedBodyMeshes[bodyId];
    if (!mesh) {
      continue;
    }
    const baseIndex = i * floatsPerBody;
    const px = sharedStateFloats[baseIndex];
    const py = sharedStateFloats[baseIndex + 1];
    const pz = sharedStateFloats[baseIndex + 2];
    const rx = sharedStateFloats[baseIndex + 3];
    const ry = sharedStateFloats[baseIndex + 4];
    const rz = sharedStateFloats[baseIndex + 5];
    const rw = sharedStateFloats[baseIndex + 6];
    if (Number.isFinite(px) && Number.isFinite(py) && Number.isFinite(pz)) {
      mesh.position.set(px, py, pz);
    }
    if (
      Number.isFinite(rx) &&
      Number.isFinite(ry) &&
      Number.isFinite(rz) &&
      Number.isFinite(rw)
    ) {
      mesh.quaternion.set(rx, ry, rz, rw);
    }
  }
  const now = performance.now();
  if (now - rendererClock.lastLogTimestamp >= 500) {
    rendererClock.lastLogTimestamp = now;
    console.info('[Shared State] cube height:', cube.position.y.toFixed(3));
  }
}

renderer.setAnimationLoop(() => {
  if (sharedStateEnabled) {
    updateSharedTransforms();
  }
  renderer.render(scene, camera);
});

const physicsWorker = new Worker(
  new URL('../workers/physics.worker.js', import.meta.url),
  { type: 'module' }
);
let workerReady = false;
let physicsRunning = false;
let lastLogTimestamp = 0;

if (actionButton) {
  actionButton.disabled = true;
}

physicsWorker.addEventListener('message', (event) => {
  const data = event.data;
  if (!data || typeof data !== 'object') {
    return;
  }

  if (data.type === 'ready') {
    workerReady = true;
    if (statusMessage) {
      statusMessage.textContent =
        'Physics worker ready. Starting Rapier drop test…';
    }
    if (actionButton) {
      actionButton.disabled = false;
    }
    physicsWorker.postMessage({ type: 'start' });
  } else if (data.type === 'shared-state') {
    if (data.buffer instanceof SharedArrayBuffer && data.layout) {
      const metaLength = data.layout.metaLength ?? 0;
      const floatsPerBody = data.layout.floatsPerBody ?? 0;
      const bodyIds = Array.isArray(data.layout.bodyIds)
        ? data.layout.bodyIds
        : [];
      const bodyCount = data.layout.bodyCount ?? bodyIds.length;
      if (metaLength > 0 && floatsPerBody > 0 && bodyCount > 0) {
        const metaBytes = metaLength * Int32Array.BYTES_PER_ELEMENT;
        sharedStateMeta = new Int32Array(data.buffer, 0, metaLength);
        sharedStateFloats = new Float32Array(
          data.buffer,
          metaBytes,
          bodyCount * floatsPerBody
        );
        sharedStateLayout = {
          ...data.layout,
          bodyCount,
          bodyIds
        };
        sharedStateVersion = Atomics.load(
          sharedStateMeta,
          data.layout.metaIndices?.version ?? META_DEFAULT_VERSION_INDEX
        );
        sharedStateEnabled = true;
        if (statusMessage) {
          statusMessage.textContent =
            'Shared memory bridge established. Rendering live physics state.';
        }
      }
    }
  } else if (data.type === 'shared-state-error') {
    console.warn('Shared memory unavailable:', data.message);
  } else if (data.type === 'state') {
    physicsRunning = Boolean(data.running);
    if (actionButton) {
      actionButton.textContent = physicsRunning
        ? 'Pause Simulation'
        : 'Resume Simulation';
    }
    if (statusMessage && !sharedStateEnabled) {
      statusMessage.textContent = physicsRunning
        ? 'Rapier is stepping inside a worker. Watch the cube fall and settle.'
        : 'Simulation paused. Resume to continue the drop test.';
    }
  } else if (data.type === 'tick') {
    const useSharedState = sharedStateEnabled && sharedStateMeta;
    if (!useSharedState) {
      const cubeState = Array.isArray(data.bodies)
        ? data.bodies.find((body) => body?.id === 'test-cube')
        : undefined;
      if (cubeState) {
        const { translation, rotation } = cubeState;
        if (translation) {
          cube.position.set(translation.x, translation.y, translation.z);
        }
        if (rotation) {
          cube.quaternion.set(
            rotation.x,
            rotation.y,
            rotation.z,
            rotation.w
          );
        }
        if (typeof data.timestamp === 'number') {
          if (data.timestamp - lastLogTimestamp >= 500) {
            console.info(
              '[Physics Worker] cube height:',
              translation.y.toFixed(3)
            );
            lastLogTimestamp = data.timestamp;
          }
        }
      }
    } else if (typeof data.version === 'number') {
      if (statusMessage && physicsRunning) {
        statusMessage.textContent =
          'Shared memory synchronized. Cube state streaming from worker.';
      }
    }
  } else if (data.type === 'error') {
    console.error('Physics worker failed to initialize:', data.message);
    if (statusMessage) {
      statusMessage.textContent =
        'Physics worker failed to start. Check the console for details.';
    }
    if (actionButton) {
      actionButton.disabled = true;
    }
  }
});

actionButton?.addEventListener('click', () => {
  if (!workerReady) {
    return;
  }
  physicsWorker.postMessage({ type: physicsRunning ? 'pause' : 'start' });
});
