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

renderer.setAnimationLoop(() => {
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
  } else if (data.type === 'state') {
    physicsRunning = Boolean(data.running);
    if (actionButton) {
      actionButton.textContent = physicsRunning
        ? 'Pause Simulation'
        : 'Resume Simulation';
    }
    if (statusMessage) {
      statusMessage.textContent = physicsRunning
        ? 'Rapier is stepping inside a worker. Watch the cube fall and settle.'
        : 'Simulation paused. Resume to continue the drop test.';
    }
  } else if (data.type === 'tick') {
    const cubeState = Array.isArray(data.bodies)
      ? data.bodies.find((body) => body?.id === 'test-cube')
      : undefined;
    if (cubeState) {
      const { translation, rotation } = cubeState;
      if (translation) {
        cube.position.set(translation.x, translation.y, translation.z);
      }
      if (rotation) {
        cube.quaternion.set(rotation.x, rotation.y, rotation.z, rotation.w);
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

window.addEventListener('beforeunload', () => {
  physicsWorker.terminate();
});
