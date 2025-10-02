import {
  AmbientLight,
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
import { OrbitControls } from 'https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/controls/OrbitControls.js';
import {
  ARENA_FLOOR_Y,
  ARENA_SIZE,
  OBJECTIVE_COLOR,
  OBJECTIVE_POSITION,
  OBJECTIVE_SIZE
} from '../environment/arena.js';
import { DEFAULT_STAGE_ID, getStageDefinition } from '../environment/stages.js';

const META_DEFAULT_VERSION_INDEX = 0;
const META_DEFAULT_WRITE_LOCK_INDEX = 1;
const FOLLOW_OFFSET = new Vector3(4.5, 2.8, 4.5);
const LOOK_OFFSET = new Vector3(0, 0.6, 0);

export function createViewer(canvas) {
  if (!canvas) {
    throw new Error('createViewer requires a canvas element.');
  }

  const renderer = new WebGLRenderer({
    canvas,
    antialias: true,
    alpha: true
  });
  renderer.setPixelRatio(window.devicePixelRatio ?? 1);

  const scene = new Scene();
  scene.background = new Color('#020617');

  const camera = new PerspectiveCamera(45, 1, 0.1, 100);
  camera.position.set(5, 3.4, 7);
  camera.lookAt(new Vector3(0, 0.6, 0));

  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.dampingFactor = 0.05;
  controls.autoRotate = false;
  controls.target.set(0, 0.6, 0);

  canvas.addEventListener(
    'wheel',
    (event) => {
      const allowZoom = event.ctrlKey;
      controls.enableZoom = allowZoom;
      if (allowZoom) {
        event.preventDefault();
      }
      const restoreZoom = () => {
        controls.enableZoom = true;
      };
      if (typeof queueMicrotask === 'function') {
        queueMicrotask(restoreZoom);
      } else {
        Promise.resolve().then(restoreZoom);
      }
    },
    { passive: false, capture: true }
  );

  const ambient = new AmbientLight('#e2e8f0', 0.6);
  const keyLight = new DirectionalLight('#60a5fa', 0.85);
  keyLight.position.set(6, 6.5, 4);
  const fillLight = new DirectionalLight('#f472b6', 0.35);
  fillLight.position.set(-5, 2.5, -6);
  scene.add(ambient, keyLight, fillLight);

  const groundGeometry = new BoxGeometry(ARENA_SIZE.width, ARENA_SIZE.height, ARENA_SIZE.depth);
  const groundMaterial = new MeshStandardMaterial({
    color: '#111827',
    roughness: 0.88,
    metalness: 0.04
  });
  const ground = new Mesh(groundGeometry, groundMaterial);
  ground.position.y = ARENA_FLOOR_Y - 0.02;
  ground.receiveShadow = false;
  scene.add(ground);

  const objectiveGeometry = new BoxGeometry(
    OBJECTIVE_SIZE.width,
    OBJECTIVE_SIZE.height,
    OBJECTIVE_SIZE.depth
  );
  const objectiveMaterial = new MeshStandardMaterial({
    color: OBJECTIVE_COLOR,
    roughness: 0.32,
    metalness: 0.12
  });
  const objectiveMesh = new Mesh(objectiveGeometry, objectiveMaterial);
  objectiveMesh.position.set(OBJECTIVE_POSITION.x, OBJECTIVE_POSITION.y, OBJECTIVE_POSITION.z);
  objectiveMesh.castShadow = false;
  objectiveMesh.receiveShadow = false;
  scene.add(objectiveMesh);

  const stageGroup = new Group();
  scene.add(stageGroup);

  const dynamicBodiesRoot = new Group();
  scene.add(dynamicBodiesRoot);

  const sharedBodyMeshes = new Map();
  let sharedDescriptorMap = new Map();
  let primaryBodyId = null;
  let viewMode = 'orbit';
  let lastFrameTimestamp = null;
  let logClock = 0;
  const primaryLerpTarget = new Vector3();
  const lastPrimaryPosition = new Vector3();

  let sharedState = null;
  let activeStageId = DEFAULT_STAGE_ID;
  let stageMeshes = [];

  function resize() {
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    if (!width || !height) {
      return;
    }
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height, false);
  }

  window.addEventListener('resize', resize);
  resize();

  function disposeStageMeshes() {
    stageMeshes.forEach((mesh) => {
      if (mesh.geometry) {
        mesh.geometry.dispose();
      }
      if (mesh.material) {
        mesh.material.dispose();
      }
      stageGroup.remove(mesh);
    });
    stageMeshes = [];
  }

  function createStageMesh(obstacle) {
    if (!obstacle || obstacle.type !== 'box') {
      return null;
    }
    const halfExtents = obstacle.halfExtents ?? { x: 0.5, y: 0.5, z: 0.5 };
    const translation = obstacle.translation ?? { x: 0, y: 0, z: 0 };
    const width = (halfExtents.x ?? 0.5) * 2;
    const height = (halfExtents.y ?? 0.5) * 2;
    const depth = (halfExtents.z ?? 0.5) * 2;
    const color = obstacle.material?.color ?? '#f97316';
    const roughness = obstacle.material?.roughness ?? 0.5;
    const metalness = obstacle.material?.metalness ?? 0.18;
    const geometry = new BoxGeometry(width, height, depth);
    const material = new MeshStandardMaterial({ color, roughness, metalness });
    const mesh = new Mesh(geometry, material);
    mesh.position.set(translation.x ?? 0, translation.y ?? 0, translation.z ?? 0);
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    return mesh;
  }

  function applyStage(stageId = DEFAULT_STAGE_ID) {
    const stage = getStageDefinition(stageId);
    if (!stage) {
      return;
    }
    disposeStageMeshes();
    if (Array.isArray(stage.obstacles)) {
      stage.obstacles.forEach((obstacle) => {
        const mesh = createStageMesh(obstacle);
        if (mesh) {
          stageGroup.add(mesh);
          stageMeshes.push(mesh);
        }
      });
    }
    activeStageId = stage.id;
  }

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
      mesh.material.roughness = roughness;
      mesh.material.metalness = metalness;
      mesh.material.color.set(color);
    }

    mesh.visible = true;
    return mesh;
  }

  function applySharedLayout(layout) {
    if (!layout || typeof layout !== 'object') {
      return;
    }
    const descriptorMap = new Map();
    if (Array.isArray(layout.bodies)) {
      layout.bodies.forEach((descriptor) => {
        descriptorMap.set(descriptor.id, descriptor);
        ensureSharedBodyMesh(descriptor);
      });
    }
    const bodyIds = Array.isArray(layout.bodyIds)
      ? layout.bodyIds
      : Array.isArray(layout.bodies)
      ? layout.bodies.map((descriptor) => descriptor.id)
      : [];

    sharedDescriptorMap = descriptorMap;
    primaryBodyId = bodyIds[0] ?? null;
    const hasDescriptors = descriptorMap.size > 0;

    sharedBodyMeshes.forEach((mesh, id) => {
      mesh.visible = hasDescriptors ? descriptorMap.has(id) : false;
    });
  }

  function setSharedStateBuffer(buffer, layout) {
    if (!(buffer instanceof SharedArrayBuffer)) {
      sharedState = null;
      return;
    }
    const metaLength = layout?.metaLength ?? 0;
    const floatsPerBody = layout?.floatsPerBody ?? 0;
    const bodyCount = layout?.bodyCount ?? layout?.bodyIds?.length ?? 0;
    if (!metaLength || !floatsPerBody || !bodyCount) {
      sharedState = null;
      return;
    }
    const metaBytes = metaLength * Int32Array.BYTES_PER_ELEMENT;
    sharedState = {
      meta: new Int32Array(buffer, 0, metaLength),
      floats: new Float32Array(buffer, metaBytes, bodyCount * floatsPerBody),
      layout,
      floatsPerBody,
      version: -1
    };
  }

  function updateSharedTransforms() {
    if (!sharedState) {
      return;
    }
    const { meta, floats, layout, floatsPerBody } = sharedState;
    const bodyIds = Array.isArray(layout.bodyIds)
      ? layout.bodyIds
      : Array.isArray(layout.bodies)
      ? layout.bodies.map((descriptor) => descriptor.id)
      : [];
    if (!bodyIds.length || !floatsPerBody) {
      return;
    }
    const versionIndex = layout.metaIndices?.version ?? META_DEFAULT_VERSION_INDEX;
    const writeLockIndex = layout.metaIndices?.writeLock ?? META_DEFAULT_WRITE_LOCK_INDEX;
    if (Atomics.load(meta, writeLockIndex) !== 0) {
      return;
    }
    const version = Atomics.load(meta, versionIndex);
    if (version === sharedState.version) {
      return;
    }
    sharedState.version = version;
    for (let index = 0; index < bodyIds.length; index += 1) {
      const bodyId = bodyIds[index];
      const mesh = sharedBodyMeshes.get(bodyId);
      if (!mesh) {
        continue;
      }
      const baseIndex = index * floatsPerBody;
      const px = floats[baseIndex];
      const py = floats[baseIndex + 1];
      const pz = floats[baseIndex + 2];
      const rx = floats[baseIndex + 3];
      const ry = floats[baseIndex + 4];
      const rz = floats[baseIndex + 5];
      const rw = floats[baseIndex + 6];
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
      if (bodyId === primaryBodyId) {
        lastPrimaryPosition.copy(mesh.position);
      }
    }
    const now = performance.now();
    if (now - logClock >= 500 && primaryBodyId) {
      logClock = now;
      const primaryMesh = sharedBodyMeshes.get(primaryBodyId);
      if (primaryMesh) {
        console.info('[Shared State] primary body height:', primaryMesh.position.y.toFixed(3));
      }
    }
  }

  function updateBodiesFromTick(bodies = []) {
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
      if (!mesh) {
        return;
      }
      if (bodyState.translation) {
        mesh.position.set(
          bodyState.translation.x,
          bodyState.translation.y,
          bodyState.translation.z
        );
        if (bodyState.id === primaryBodyId) {
          lastPrimaryPosition.set(
            bodyState.translation.x,
            bodyState.translation.y,
            bodyState.translation.z
          );
        }
      }
      if (bodyState.rotation) {
        mesh.quaternion.set(
          bodyState.rotation.x,
          bodyState.rotation.y,
          bodyState.rotation.z,
          bodyState.rotation.w
        );
      }
    });
  }

  function updateCamera(deltaSeconds) {
    if (viewMode === 'follow' && primaryBodyId) {
      controls.enabled = false;
      const target = sharedBodyMeshes.get(primaryBodyId);
      if (target) {
        primaryLerpTarget.copy(target.position).add(LOOK_OFFSET);
        const followPosition = target.position.clone().add(FOLLOW_OFFSET);
        camera.position.lerp(followPosition, Math.min(1, deltaSeconds * 2.5));
        camera.lookAt(primaryLerpTarget);
        controls.target.lerp(primaryLerpTarget, Math.min(1, deltaSeconds * 2.5));
      } else {
        camera.lookAt(lastPrimaryPosition.clone().add(LOOK_OFFSET));
      }
    } else {
      controls.enabled = true;
      controls.update();
    }
  }

  function renderFrame(timestamp) {
    if (sharedState) {
      updateSharedTransforms();
    }
    let deltaSeconds = 0;
    if (lastFrameTimestamp !== null) {
      deltaSeconds = (timestamp - lastFrameTimestamp) / 1000;
    }
    updateCamera(deltaSeconds);
    lastFrameTimestamp = timestamp;
    renderer.render(scene, camera);
  }

  applyStage(DEFAULT_STAGE_ID);
  renderer.setAnimationLoop(renderFrame);
  return {
    applySharedLayout,
    setSharedStateBuffer,
    clearSharedState() {
      sharedState = null;
    },
    updateBodiesFromTick,
    setViewMode(mode) {
      viewMode = mode === 'follow' ? 'follow' : 'orbit';
      if (viewMode === 'orbit') {
        controls.enabled = true;
      }
    },
    getViewMode() {
      return viewMode;
    },
    isSharedStateActive() {
      return Boolean(sharedState);
    },
    setStage(stageId) {
      applyStage(stageId);
    },
    getStageId() {
      return activeStageId;
    },
    getPrimaryBodyPosition() {
      return lastPrimaryPosition.clone();
    }
  };
}
