import {
  AmbientLight,
  BoxGeometry,
  Clock,
  Color,
  DirectionalLight,
  Mesh,
  MeshStandardMaterial,
  PerspectiveCamera,
  Scene,
  Vector3,
  WebGLRenderer
} from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';
import RAPIER from 'https://cdn.jsdelivr.net/npm/@dimforge/rapier3d-compat@0.11.2/rapier.es.js';

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

const geometry = new BoxGeometry(1.5, 1, 1.5);
const material = new MeshStandardMaterial({
  color: '#38bdf8',
  roughness: 0.35,
  metalness: 0.1
});
const cube = new Mesh(geometry, material);
scene.add(cube);

const clock = new Clock();
let spinning = true;

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

function render() {
  const delta = clock.getDelta();
  if (spinning) {
    cube.rotation.y += delta * 0.8;
    cube.rotation.x += delta * 0.4;
  }
  renderer.render(scene, camera);
  requestAnimationFrame(render);
}

requestAnimationFrame(render);

actionButton?.addEventListener('click', () => {
  spinning = !spinning;
  actionButton.textContent = spinning ? 'Pause Spin' : 'Resume Spin';
});

async function initPhysics() {
  try {
    statusMessage.textContent = 'Initializing Rapier physics…';
    await RAPIER.init();
    const gravity = new RAPIER.Vector3(0, -9.81, 0);
    const world = new RAPIER.World(gravity);
    statusMessage.textContent = 'Three.js and Rapier are ready. Placeholder cube is spinning!';
    console.info('Rapier world created with gravity', world.gravity);
    // Clean up temporary world until physics worker lands.
    world.free();
  } catch (error) {
    console.error('Failed to load Rapier', error);
    statusMessage.textContent = 'Failed to initialize physics. Check the console for details.';
  }
}

initPhysics();
