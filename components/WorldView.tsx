import React, { useRef, useEffect, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { Individual } from '../types';
import SimulationWorker from '../simulation.worker?worker';

interface WorldViewProps {
  population: Individual[];
  selectedId: string | null;
  onSelectId: (id: string) => void;
  onFitnessUpdate: (fitnessMap: Record<string, number>) => void;
  simulationSpeed: number;
  isPlaying: boolean;
  generation: number;
}

export const WorldView: React.FC<WorldViewProps> = ({
  population,
  selectedId,
  onSelectId,
  onFitnessUpdate,
  simulationSpeed,
  isPlaying,
  generation
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const dirLightRef = useRef<THREE.DirectionalLight | null>(null);

  // Environment Refs
  const groundMeshRef = useRef<THREE.Mesh | null>(null);
  const gridHelperRef = useRef<THREE.GridHelper | null>(null);
  const startLineRef = useRef<THREE.Mesh | null>(null);
  const markersGroupRef = useRef<THREE.Group | null>(null);

  // Worker & State
  const workerRef = useRef<Worker | null>(null);
  const meshMapRef = useRef<THREE.Mesh[]>([]); // Flat list of meshes matching worker order
  const idMapRef = useRef<Map<string, THREE.Mesh>>(new Map()); // Map for camera follow (id -> root mesh)

  const raycasterRef = useRef<THREE.Raycaster>(new THREE.Raycaster());
  const mouseRef = useRef<THREE.Vector2>(new THREE.Vector2());
  const [isPhysicsReady, setIsPhysicsReady] = useState(false);

  // State refs
  const onSelectIdRef = useRef(onSelectId);
  const selectedIdRef = useRef(selectedId);
  const onFitnessUpdateRef = useRef(onFitnessUpdate);
  const prevTargetPosRef = useRef<THREE.Vector3 | null>(null);
  const shouldSnapCameraRef = useRef(true);
  const lastFitnessReportRef = useRef(0);

  // Update refs
  useEffect(() => {
    if (selectedId !== selectedIdRef.current) {
      shouldSnapCameraRef.current = true;
    }
    onSelectIdRef.current = onSelectId;
    selectedIdRef.current = selectedId;
    onFitnessUpdateRef.current = onFitnessUpdate;
  }, [onSelectId, selectedId, onFitnessUpdate]);

  // 1. Initialize Worker (Once)
  useEffect(() => {
    const worker = new SimulationWorker();
    workerRef.current = worker;

    worker.onmessage = (e) => {
      const { type, payload } = e.data;

      if (type === 'READY') {
        setIsPhysicsReady(true);
      } else if (type === 'UPDATE') {
        const { transforms, fitness } = payload;

        // Apply transforms
        // transforms is a Float32Array: [x, y, z, qx, qy, qz, qw, ...]
        const meshes = meshMapRef.current;
        if (meshes.length * 7 === transforms.length) {
          for (let i = 0; i < meshes.length; i++) {
            const offset = i * 7;
            const mesh = meshes[i];

            const x = transforms[offset];
            const y = transforms[offset + 1];
            const z = transforms[offset + 2];

            mesh.position.set(x, y, z);
            mesh.quaternion.set(
              transforms[offset + 3],
              transforms[offset + 4],
              transforms[offset + 5],
              transforms[offset + 6]
            );
          }
        }

        // Report fitness
        const now = performance.now();
        if (now - lastFitnessReportRef.current > 50) {
          onFitnessUpdateRef.current(fitness);
          lastFitnessReportRef.current = now;
        }
      }
    };

    worker.postMessage({ type: 'INIT' });

    return () => {
      worker.terminate();
    };
  }, []);

  // 2. Initialize Three.js Scene
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#020617');
    scene.fog = new THREE.FogExp2('#020617', 0.015);
    sceneRef.current = scene;

    const width = container.clientWidth;
    const height = container.clientHeight;
    const camera = new THREE.PerspectiveCamera(60, width / height, 0.1, 1000);
    camera.position.set(10, 10, 10);
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(width, height);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.minDistance = 2;
    controls.maxDistance = 100;
    controlsRef.current = controls;

    const ambientLight = new THREE.HemisphereLight(0xffffff, 0x020617, 0.6);
    scene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(0xffffff, 1);
    dirLight.position.set(20, 30, 10);
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.set(2048, 2048);
    dirLight.shadow.bias = -0.001;
    scene.add(dirLight);
    dirLightRef.current = dirLight;

    const onMouseClick = (event: any) => {
      if (!container || !sceneRef.current || !cameraRef.current) return;
      const rect = container.getBoundingClientRect();
      mouseRef.current.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      mouseRef.current.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

      raycasterRef.current.setFromCamera(mouseRef.current, cameraRef.current);
      const intersects = raycasterRef.current.intersectObjects(sceneRef.current.children);

      for (const intersect of intersects) {
        if (intersect.object.userData.individualId) {
          onSelectIdRef.current(intersect.object.userData.individualId);
          break;
        }
      }
    };
    renderer.domElement.addEventListener('click', onMouseClick);

    // Render Loop
    const frustum = new THREE.Frustum();
    const projScreenMatrix = new THREE.Matrix4();

    let reqId = 0;
    const animate = () => {
      reqId = requestAnimationFrame(animate);
      if (controlsRef.current) controlsRef.current.update();

      // Camera Follow
      const currentSelectedId = selectedIdRef.current;
      let targetPos: THREE.Vector3 | null = null;

      if (currentSelectedId) {
        const targetMesh = idMapRef.current.get(currentSelectedId);
        if (targetMesh) {
          targetPos = targetMesh.position.clone();
        }
      }

      if (targetPos) {
        if (shouldSnapCameraRef.current) {
          const offset = cameraRef.current!.position.clone().sub(controlsRef.current!.target);
          controlsRef.current!.target.copy(targetPos);
          cameraRef.current!.position.copy(targetPos).add(offset);
          shouldSnapCameraRef.current = false;
          prevTargetPosRef.current = targetPos;
        } else if (prevTargetPosRef.current) {
          const delta = targetPos.clone().sub(prevTargetPosRef.current);
          cameraRef.current!.position.add(delta);
          controlsRef.current!.target.add(delta);
          prevTargetPosRef.current = targetPos;
        }
      }

      // Frustum Culling Update
      if (cameraRef.current) {
        cameraRef.current.updateMatrixWorld();
        projScreenMatrix.multiplyMatrices(
          cameraRef.current.projectionMatrix,
          cameraRef.current.matrixWorldInverse
        );
        frustum.setFromProjectionMatrix(projScreenMatrix);

        const meshes = meshMapRef.current;
        for (let i = 0; i < meshes.length; i++) {
          const mesh = meshes[i];
          // Check visibility
          const inFrustum = frustum.containsPoint(mesh.position);
          if (mesh.position.y < -50 || !inFrustum) {
            mesh.visible = false;
          } else {
            mesh.visible = true;
          }
        }
      }

      if (rendererRef.current && sceneRef.current && cameraRef.current) {
        rendererRef.current.render(sceneRef.current, cameraRef.current);
      }
    };
    animate();

    return () => {
      cancelAnimationFrame(reqId);
      renderer.domElement.removeEventListener('click', onMouseClick);
      if (rendererRef.current && container) {
        container.removeChild(rendererRef.current.domElement);
      }
      renderer.dispose();
    };
  }, []);

  // 3. Sync Population & Environment
  useEffect(() => {
    if (!sceneRef.current || !workerRef.current || !isPhysicsReady) return;

    // --- Environment ---
    const laneWidth = 3.0;
    const trackLength = 2000;
    const requiredDepth = Math.max(1000, population.length * laneWidth * 1.2);

    // Ground
    if (groundMeshRef.current) {
      groundMeshRef.current.geometry.dispose();
      groundMeshRef.current.geometry = new THREE.PlaneGeometry(trackLength, requiredDepth);
    } else {
      const planeGeo = new THREE.PlaneGeometry(trackLength, requiredDepth);
      const planeMat = new THREE.MeshStandardMaterial({ color: '#0f172a', roughness: 0.8, metalness: 0.2 });
      const plane = new THREE.Mesh(planeGeo, planeMat);
      plane.rotation.x = -Math.PI / 2;
      plane.receiveShadow = true;
      sceneRef.current.add(plane);
      groundMeshRef.current = plane;
    }

    // Grid
    if (gridHelperRef.current) {
      sceneRef.current.remove(gridHelperRef.current);
      gridHelperRef.current.geometry.dispose();
    }
    const gridSize = Math.max(trackLength, requiredDepth);
    const grid = new THREE.GridHelper(gridSize, Math.floor(gridSize / 10), '#1e293b', '#0f172a');
    sceneRef.current.add(grid);
    gridHelperRef.current = grid;

    // Start Line
    if (startLineRef.current) {
      startLineRef.current.geometry.dispose();
      startLineRef.current.geometry = new THREE.BoxGeometry(0.2, 0.05, requiredDepth);
    } else {
      const startLineMat = new THREE.MeshStandardMaterial({ color: '#ef4444', emissive: '#991b1b', emissiveIntensity: 0.5 });
      const startLine = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.05, requiredDepth), startLineMat);
      startLine.position.set(0, 0.05, 0);
      sceneRef.current.add(startLine);
      startLineRef.current = startLine;
    }

    // Markers
    if (markersGroupRef.current) {
      sceneRef.current.remove(markersGroupRef.current);
    }
    const markersGroup = new THREE.Group();
    const markerGeo = new THREE.BoxGeometry(0.1, 0.05, requiredDepth);
    const markerMat = new THREE.MeshStandardMaterial({ color: '#334155', opacity: 0.5, transparent: true });
    for (let i = 10; i <= trackLength / 2; i += 10) {
      const marker = new THREE.Mesh(markerGeo, markerMat);
      marker.position.set(i, 0.05, 0);
      markersGroup.add(marker);
    }
    sceneRef.current.add(markersGroup);
    markersGroupRef.current = markersGroup;

    // Lights
    if (dirLightRef.current) {
      const d = Math.max(100, requiredDepth / 2);
      dirLightRef.current.shadow.camera.left = -d;
      dirLightRef.current.shadow.camera.right = d;
      dirLightRef.current.shadow.camera.top = d;
      dirLightRef.current.shadow.camera.bottom = -d;
      dirLightRef.current.shadow.camera.updateProjectionMatrix();
    }

    // --- Rebuild Meshes ---
    // Clear old meshes
    meshMapRef.current.forEach(mesh => {
      sceneRef.current?.remove(mesh);
      mesh.geometry.dispose();
      (mesh.material as THREE.Material).dispose();
    });
    meshMapRef.current = [];
    idMapRef.current.clear();

    // Create new meshes
    population.forEach((ind, index) => {
      let zPos = 0;
      if (index > 0) {
        const offset = Math.ceil(index / 2) * laneWidth;
        zPos = (index % 2 === 0) ? offset : -offset;
      }
      const startPos = { x: 0, y: 4, z: zPos };

      ind.genome.morphology.forEach(block => {
        const geometry = new THREE.BoxGeometry(block.size[0], block.size[1], block.size[2]);
        const material = new THREE.MeshStandardMaterial({
          color: block.color,
          roughness: 0.6,
          metalness: 0.1
        });
        const mesh = new THREE.Mesh(geometry, material);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        mesh.userData = { individualId: ind.id, blockId: block.id };

        // Initial position (will be updated by worker immediately)
        mesh.position.set(
          startPos.x + (block.parentId !== undefined ? 1 : 0) * (block.id * 0.5),
          startPos.y + block.id * 0.2,
          startPos.z
        );

        sceneRef.current?.add(mesh);
        meshMapRef.current.push(mesh);

        if (block.id === 0) { // Root block
          idMapRef.current.set(ind.id, mesh);
        }
      });
    });

    // Send to Worker
    workerRef.current.postMessage({
      type: 'SET_POPULATION',
      payload: { population }
    });

  }, [population.length, generation, isPhysicsReady]); // Re-run when population size or generation changes (new pop)

  // 4. Control Simulation
  useEffect(() => {
    if (!workerRef.current) return;
    if (isPlaying && isPhysicsReady) {
      workerRef.current.postMessage({ type: 'START' });
    } else {
      workerRef.current.postMessage({ type: 'STOP' });
    }
  }, [isPlaying, isPhysicsReady]);

  useEffect(() => {
    if (!workerRef.current) return;
    workerRef.current.postMessage({ type: 'UPDATE_SPEED', payload: simulationSpeed });
  }, [simulationSpeed]);

  return (
    <div ref={containerRef} className="w-full h-full relative rounded-lg overflow-hidden border border-slate-800 shadow-2xl bg-[#020617] cursor-move">
      {!isPhysicsReady && (
        <div className="absolute inset-0 flex items-center justify-center text-emerald-500 font-mono bg-slate-950 z-20">
          INITIALIZING PHYSICS ENGINE...
        </div>
      )}
    </div>
  );
};
