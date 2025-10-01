import {
  AmbientLight,
  Box3,
  BoxGeometry,
  Color,
  DirectionalLight,
  Group,
  Mesh,
  MeshStandardMaterial,
  PerspectiveCamera,
  Scene,
  Vector3,
  WebGLRenderer
} from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';
import {
  buildMorphologyBlueprint,
  generateSampleMorphGenomes
} from '../genomes/morphGenome.js';

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
camera.position.set(5, 3.4, 7);
camera.lookAt(new Vector3(0, 0.6, 0));

const ambient = new AmbientLight('#e2e8f0', 0.6);
const keyLight = new DirectionalLight('#60a5fa', 0.85);
keyLight.position.set(6, 6.5, 4);
const fillLight = new DirectionalLight('#f472b6', 0.35);
fillLight.position.set(-5, 2.5, -6);
scene.add(ambient, keyLight, fillLight);

const groundGeometry = new BoxGeometry(16, 0.2, 12);
const groundMaterial = new MeshStandardMaterial({
  color: '#111827',
  roughness: 0.88,
  metalness: 0.04
});
const ground = new Mesh(groundGeometry, groundMaterial);
ground.position.y = -0.62;
scene.add(ground);

const previewPad = new Mesh(
  new BoxGeometry(7.2, 0.06, 7.2),
  new MeshStandardMaterial({
    color: '#0f172a',
    roughness: 0.9,
    metalness: 0.03
  })
);
previewPad.position.set(-4.6, -0.65, -3.3);
scene.add(previewPad);

const dynamicBodiesRoot = new Group();
scene.add(dynamicBodiesRoot);

const previewRoot = new Group();
previewRoot.position.set(-4.6, -0.59, -3.3);
previewRoot.scale.setScalar(0.82);
scene.add(previewRoot);

const previewGroups = [];
const previewBounds = new Box3();
const previewCenter = new Vector3();
const previewSize = new Vector3();

const sharedBodyMeshes = new Map();
let sharedDescriptorMap = new Map();
let primaryBodyId = null;

const META_DEFAULT_VERSION_INDEX = 0;
const META_DEFAULT_WRITE_LOCK_INDEX = 1;

let sharedStateMeta = null;
let sharedStateFloats = null;
let sharedStateLayout = null;
let sharedStateVersion = 0;
let sharedStateEnabled = false;

const rendererClock = {
  lastLogTimestamp: 0,
  lastFrameTimestamp: null
};

const scratchColor = new Color();

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

function ensureSharedBodyMesh(descriptor) {
  if (!descriptor || typeof descriptor.id !== 'string') {
    return null;
  }
  const halfExtents = Array.isArray(descriptor.halfExtents)
    ? descriptor.halfExtents
    : [0.5, 0.5, 0.5];
  const color = descriptor.material?.color ?? '#38bdf8';
  const roughness = descriptor.material?.roughness ?? 0.38;
  const metalness = descriptor.material?.metalness ?? 0.18;

  let mesh = sharedBodyMeshes.get(descriptor.id);
  const width = halfExtents[0] * 2;
  const height = halfExtents[1] * 2;
  const depth = halfExtents[2] * 2;

  if (!mesh) {
    const geometry = new BoxGeometry(width, height, depth);
    const material = new MeshStandardMaterial({
      color,
      roughness,
      metalness
    });
    mesh = new Mesh(geometry, material);
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    dynamicBodiesRoot.add(mesh);
    sharedBodyMeshes.set(descriptor.id, mesh);
  } else {
    const geometry = mesh.geometry;
    if (
      geometry.parameters?.width !== width ||
      geometry.parameters?.height !== height ||
      geometry.parameters?.depth !== depth
    ) {
      mesh.geometry.dispose();
      mesh.geometry = new BoxGeometry(width, height, depth);
    }
    const material = mesh.material;
    scratchColor.set(color);
    if (material.color?.getHex() !== scratchColor.getHex()) {
      material.color.set(scratchColor);
    }
    material.roughness = roughness;
    material.metalness = metalness;
  }

  mesh.visible = true;
  return mesh;
}

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
    const mesh = sharedBodyMeshes.get(bodyId);
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
  if (primaryBodyId) {
    const primaryMesh = sharedBodyMeshes.get(primaryBodyId);
    if (primaryMesh) {
      const now = performance.now();
      if (now - rendererClock.lastLogTimestamp >= 500) {
        rendererClock.lastLogTimestamp = now;
        console.info(
          '[Shared State] primary body height:',
          primaryMesh.position.y.toFixed(3)
        );
      }
    }
  }
}

function populateMorphPreview() {
  const genomes = generateSampleMorphGenomes(12);
  const columns = 4;
  const spacing = 1.8;
  const rows = Math.ceil(genomes.length / columns);
  const offsetX = ((columns - 1) * spacing) / 2;
  const offsetZ = ((rows - 1) * spacing) / 2;
  genomes.forEach((genome, index) => {
    const blueprint = buildMorphologyBlueprint(genome);
    if (blueprint.errors.length > 0) {
      console.warn('Preview blueprint validation failed:', blueprint.errors.join('; '));
      return;
    }
    const materialMap = new Map(
      Object.entries(blueprint.materials).map(([key, value]) => [key, value])
    );
    const group = new Group();
    blueprint.bodies.forEach((body) => {
      const halfExtents = body.halfExtents;
      const geometry = new BoxGeometry(
        halfExtents[0] * 2,
        halfExtents[1] * 2,
        halfExtents[2] * 2
      );
      const materialInfo = materialMap.get(body.materialId) || body.material || {};
      const material = new MeshStandardMaterial({
        color: materialInfo.color ?? '#38bdf8',
        roughness: materialInfo.roughness ?? 0.38,
        metalness: materialInfo.metalness ?? 0.18
      });
      const mesh = new Mesh(geometry, material);
      mesh.position.set(
        body.translation[0],
        body.translation[1],
        body.translation[2]
      );
      mesh.quaternion.set(
        body.rotation[0],
        body.rotation[1],
        body.rotation[2],
        body.rotation[3]
      );
      group.add(mesh);
    });
    previewBounds.setFromObject(group);
    previewBounds.getCenter(previewCenter);
    previewBounds.getSize(previewSize);
    group.children.forEach((child) => {
      child.position.sub(previewCenter);
    });
    const row = Math.floor(index / columns);
    const col = index % columns;
    group.position.set(
      col * spacing - offsetX,
      previewSize.y * 0.5,
      row * spacing - offsetZ
    );
    previewRoot.add(group);
    previewGroups.push(group);
  });
}

populateMorphPreview();

const physicsWorker = new Worker(
  new URL('../workers/physics.worker.js', import.meta.url),
  { type: 'module' }
);
let workerReady = false;
let physicsRunning = false;
let lastLogTimestamp = 0;
let sensorLogTimestamp = 0;

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
        'Physics worker ready. Streaming hopper morph simulation…';
    }
    if (actionButton) {
      actionButton.disabled = false;
    }
    physicsWorker.postMessage({ type: 'start' });
  } else if (data.type === 'shared-state') {
    const layout = data.layout;
    if (!layout || typeof layout !== 'object') {
      return;
    }
    const bodyIds = Array.isArray(layout.bodyIds)
      ? layout.bodyIds
      : Array.isArray(layout.bodies)
      ? layout.bodies.map((descriptor) => descriptor.id)
      : [];
    const descriptorMap = new Map();
    if (Array.isArray(layout.bodies)) {
      layout.bodies.forEach((descriptor) => {
        descriptorMap.set(descriptor.id, descriptor);
        ensureSharedBodyMesh(descriptor);
      });
    }
    sharedDescriptorMap = descriptorMap;
    primaryBodyId = bodyIds[0] ?? null;
    sharedStateLayout = {
      ...layout,
      bodyIds,
      descriptorMap
    };
    for (const [id, mesh] of sharedBodyMeshes.entries()) {
      mesh.visible = descriptorMap.has(id);
    }
    if (data.buffer instanceof SharedArrayBuffer) {
      const metaLength = layout.metaLength ?? 0;
      const floatsPerBody = layout.floatsPerBody ?? 0;
      const bodyCount = layout.bodyCount ?? bodyIds.length;
      if (metaLength > 0 && floatsPerBody > 0 && bodyCount > 0) {
        const metaBytes = metaLength * Int32Array.BYTES_PER_ELEMENT;
        sharedStateMeta = new Int32Array(data.buffer, 0, metaLength);
        sharedStateFloats = new Float32Array(
          data.buffer,
          metaBytes,
          bodyCount * floatsPerBody
        );
        sharedStateVersion = Atomics.load(
          sharedStateMeta,
          layout.metaIndices?.version ?? META_DEFAULT_VERSION_INDEX
        );
        sharedStateEnabled = true;
        if (statusMessage) {
          statusMessage.textContent =
            'Shared memory bridge established. Hopper pose updates are live.';
        }
      }
    } else {
      sharedStateMeta = null;
      sharedStateFloats = null;
      sharedStateEnabled = false;
      if (statusMessage) {
        statusMessage.textContent =
          'Shared memory unavailable — falling back to message-based updates.';
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
        ? 'Physics worker stepping. Awaiting shared memory access…'
        : 'Simulation paused. Resume to continue the hopper test.';
    }
  } else if (data.type === 'tick') {
    const useSharedState = sharedStateEnabled && sharedStateMeta;
    if (!useSharedState) {
      const bodies = Array.isArray(data.bodies) ? data.bodies : [];
      bodies.forEach((bodyState) => {
        if (!bodyState || typeof bodyState.id !== 'string') {
          return;
        }
        let mesh = sharedBodyMeshes.get(bodyState.id);
        if (!mesh) {
          const descriptor = sharedDescriptorMap.get(bodyState.id) || {
            id: bodyState.id,
            halfExtents: [0.5, 0.5, 0.5],
            material: {}
          };
          mesh = ensureSharedBodyMesh(descriptor);
        }
        if (mesh && bodyState.translation) {
          mesh.position.set(
            bodyState.translation.x,
            bodyState.translation.y,
            bodyState.translation.z
          );
        }
        if (mesh && bodyState.rotation) {
          mesh.quaternion.set(
            bodyState.rotation.x,
            bodyState.rotation.y,
            bodyState.rotation.z,
            bodyState.rotation.w
          );
        }
      });
      if (typeof data.timestamp === 'number') {
        const primaryState =
          bodies.find((body) => body.id === primaryBodyId) || bodies[0];
        if (primaryState?.translation) {
          if (data.timestamp - lastLogTimestamp >= 500) {
            console.info(
              '[Physics Worker] primary body height:',
              primaryState.translation.y.toFixed(3)
            );
            lastLogTimestamp = data.timestamp;
          }
        }
      }
    } else if (typeof data.version === 'number') {
      if (statusMessage && physicsRunning) {
        statusMessage.textContent =
          'Shared memory synchronized. Hopper pose streaming from worker.';
      }
    }
    if (data.sensors?.summary && typeof data.timestamp === 'number') {
      if (data.timestamp - sensorLogTimestamp >= 500) {
        const summary = data.sensors.summary;
        const height = Number(summary.rootHeight ?? 0).toFixed(3);
        const contact = summary.footContact ? 'yes' : 'no';
        const angle = Number(summary.primaryJointAngle ?? 0).toFixed(3);
        console.info(
          '[Sensors] height=%sm, contact=%s, jointAngle=%srad',
          height,
          contact,
          angle
        );
        sensorLogTimestamp = data.timestamp;
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

renderer.setAnimationLoop((timestamp) => {
  if (sharedStateEnabled) {
    updateSharedTransforms();
  }
  if (rendererClock.lastFrameTimestamp !== null) {
    const deltaSeconds = (timestamp - rendererClock.lastFrameTimestamp) / 1000;
    previewRoot.rotation.y += deltaSeconds * 0.35;
    previewGroups.forEach((group, index) => {
      group.rotation.y += deltaSeconds * (0.15 + (index % 5) * 0.05);
    });
  }
  rendererClock.lastFrameTimestamp = timestamp;
  renderer.render(scene, camera);
});
