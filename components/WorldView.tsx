
import React, { useRef, useEffect, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import RAPIER from '@dimforge/rapier3d-compat';
import { Individual, BlockNode, JointType } from '../types';

interface WorldViewProps {
  population: Individual[];
  selectedId: string | null;
  onSelectId: (id: string) => void;
  onFitnessUpdate: (fitnessMap: Record<string, number>) => void;
  simulationSpeed: number;
  isPlaying: boolean;
  generation: number;
}

interface PhysObject {
  mesh: THREE.Mesh;
  body: RAPIER.RigidBody;
  id: string; // individual ID
  blockId: number; // specific block ID to identify root
}

interface PhysJoint {
  joint: RAPIER.ImpulseJoint;
  motorType: JointType;
  phase: number;
  speed: number;
  amp: number;
  body: RAPIER.RigidBody;
  parentBody: RAPIER.RigidBody;
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
  
  // Environment Refs (for resizing)
  const groundMeshRef = useRef<THREE.Mesh | null>(null);
  const gridHelperRef = useRef<THREE.GridHelper | null>(null);
  const startLineRef = useRef<THREE.Mesh | null>(null);
  const markersGroupRef = useRef<THREE.Group | null>(null);

  // Physics World State
  const worldRef = useRef<RAPIER.World | null>(null);
  const physObjectsRef = useRef<PhysObject[]>([]);
  const physJointsRef = useRef<PhysJoint[]>([]);
  const disqualifiedRef = useRef<Set<string>>(new Set());
  
  const requestRef = useRef<number>(0);
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
  
  // Simulation time accumulator
  const simTimeRef = useRef(0);

  // Update refs
  useEffect(() => {
    if (selectedId !== selectedIdRef.current) {
        shouldSnapCameraRef.current = true;
    }
    onSelectIdRef.current = onSelectId;
    selectedIdRef.current = selectedId;
    onFitnessUpdateRef.current = onFitnessUpdate;
  }, [onSelectId, selectedId, onFitnessUpdate]);

  // 1. Initialize Rapier (Once)
  useEffect(() => {
    const initPhysics = async () => {
      await RAPIER.init();
      setIsPhysicsReady(true);
    };
    initPhysics();
  }, []);

  // 2. Initialize Three.js Scene (Once - Static elements)
  useEffect(() => {
    if (!containerRef.current) return;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#020617');
    scene.fog = new THREE.FogExp2('#020617', 0.015);
    sceneRef.current = scene;

    const width = containerRef.current.clientWidth;
    const height = containerRef.current.clientHeight;
    const camera = new THREE.PerspectiveCamera(60, width / height, 0.1, 1000);
    camera.position.set(10, 10, 10);
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(width, height);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    containerRef.current.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.minDistance = 2;
    controls.maxDistance = 100;
    controlsRef.current = controls;

    // Lights
    const ambientLight = new THREE.HemisphereLight(0xffffff, 0x020617, 0.6);
    scene.add(ambientLight);
    
    const dirLight = new THREE.DirectionalLight(0xffffff, 1);
    dirLight.position.set(20, 30, 10);
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.set(2048, 2048);
    dirLight.shadow.bias = -0.001;
    // Shadow frustum will be updated dynamically
    scene.add(dirLight);
    dirLightRef.current = dirLight;

    // Arrow Helper (Origin)
    const arrowHelper = new THREE.ArrowHelper(
        new THREE.Vector3(1, 0, 0), 
        new THREE.Vector3(0, 2, 0), 
        5, 
        0x10b981 
    );
    scene.add(arrowHelper);

    const onMouseClick = (event: any) => {
      if (!containerRef.current || !sceneRef.current || !cameraRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
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

    return () => {
      renderer.domElement.removeEventListener('click', onMouseClick);
      if (rendererRef.current && containerRef.current) {
        containerRef.current.removeChild(rendererRef.current.domElement);
      }
      renderer.dispose();
    };
  }, []);

  // 3. Rebuild Physics World & Population & Environment Size
  useEffect(() => {
    if (!isPhysicsReady || !sceneRef.current) return;

    // --- CALCULATE DYNAMIC SCENE DIMENSIONS ---
    const laneWidth = 6.0;
    const trackLength = 2000; // X-Axis
    // Dynamic Z-depth based on population to prevent spawn-in-void
    const requiredDepth = Math.max(1000, population.length * laneWidth * 1.2);
    const groundHalfDepth = requiredDepth / 2.0;

    // --- UPDATE VISUAL ENVIRONMENT ---
    
    // 1. Ground Plane
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

    // 2. Grid Helper
    if (gridHelperRef.current) {
        sceneRef.current.remove(gridHelperRef.current);
        gridHelperRef.current.geometry.dispose();
    }
    const gridSize = Math.max(trackLength, requiredDepth);
    const grid = new THREE.GridHelper(gridSize, Math.floor(gridSize / 10), '#1e293b', '#0f172a');
    sceneRef.current.add(grid);
    gridHelperRef.current = grid;

    // 3. Start Line
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

    // 4. Track Markers
    if (markersGroupRef.current) {
        sceneRef.current.remove(markersGroupRef.current);
    }
    const markersGroup = new THREE.Group();
    const markerGeo = new THREE.BoxGeometry(0.1, 0.05, requiredDepth);
    const markerMat = new THREE.MeshStandardMaterial({ color: '#334155', opacity: 0.5, transparent: true });
    
    // Markers every 10m along the X axis
    for(let i=10; i<=trackLength/2; i+=10) {
       const marker = new THREE.Mesh(markerGeo, markerMat);
       marker.position.set(i, 0.05, 0);
       markersGroup.add(marker);
    }
    sceneRef.current.add(markersGroup);
    markersGroupRef.current = markersGroup;

    // 5. Update Lights for larger area
    if (dirLightRef.current) {
        const d = Math.max(100, requiredDepth / 2);
        dirLightRef.current.shadow.camera.left = -d;
        dirLightRef.current.shadow.camera.right = d;
        dirLightRef.current.shadow.camera.top = d;
        dirLightRef.current.shadow.camera.bottom = -d;
        dirLightRef.current.shadow.camera.updateProjectionMatrix();
    }


    // --- PHYSICS SETUP ---

    // Reset Simulation State
    simTimeRef.current = 0;
    disqualifiedRef.current.clear();

    // Clear references BEFORE freeing the world
    physObjectsRef.current.forEach(obj => {
      sceneRef.current?.remove(obj.mesh);
      obj.mesh.geometry.dispose();
      (obj.mesh.material as THREE.Material).dispose();
    });
    
    physObjectsRef.current = [];
    physJointsRef.current = [];

    if (worldRef.current) {
      worldRef.current.free();
      worldRef.current = null; 
    }
    
    const gravity = { x: 0.0, y: -9.81, z: 0.0 };
    const world = new RAPIER.World(gravity);
    worldRef.current = world;

    const GROUP_GROUND = 0x0001;
    const GROUP_CREATURE = 0x0002;

    const groundCollisionGroups = (GROUP_GROUND << 16) | GROUP_CREATURE;
    // Disable self-collision for creatures (only collide with ground) to allow complex morphologies
    const creatureCollisionGroups = (GROUP_CREATURE << 16) | GROUP_GROUND;

    // Thicker ground to prevent tunneling, sized to match visual environment
    const groundColliderDesc = RAPIER.ColliderDesc.cuboid(trackLength / 2.0, 5.0, groundHalfDepth);
    groundColliderDesc.setTranslation(0.0, -5.0, 0.0);
    groundColliderDesc.setCollisionGroups(groundCollisionGroups);
    world.createCollider(groundColliderDesc);

    population.forEach((ind, index) => {
      let zPos = 0;
      if (index > 0) {
         const offset = Math.ceil(index / 2) * laneWidth;
         zPos = (index % 2 === 0) ? offset : -offset;
      }
      
      const startPos = new THREE.Vector3(0, 4, zPos); 

      const bodyMap = new Map<number, RAPIER.RigidBody>();
      const nodes = ind.genome.morphology;

      const parentToChildren = new Map<number, BlockNode[]>();
      nodes.forEach(b => {
        if (b.parentId !== undefined) {
           const list = parentToChildren.get(b.parentId) || [];
           list.push(b);
           parentToChildren.set(b.parentId, list);
        }
      });

      nodes.forEach(block => {
        const rigidBodyDesc = RAPIER.RigidBodyDesc.dynamic();
        
        // Moderate damping for stability
        rigidBodyDesc.setLinearDamping(0.5);
        rigidBodyDesc.setAngularDamping(1.0);
        
        rigidBodyDesc.setTranslation(
          startPos.x + (block.parentId !== undefined ? 1 : 0) * (block.id * 0.5),
          startPos.y + block.id * 0.2,
          startPos.z
        );
        
        const body = world.createRigidBody(rigidBodyDesc);
        
        const colliderDesc = RAPIER.ColliderDesc.cuboid(
          (block.size[0] / 2) * 0.95, 
          (block.size[1] / 2) * 0.95, 
          (block.size[2] / 2) * 0.95
        );
        colliderDesc.setFriction(1.0); 
        colliderDesc.setRestitution(0.0); 
        colliderDesc.setDensity(2.0); 
        colliderDesc.setCollisionGroups(creatureCollisionGroups);

        world.createCollider(colliderDesc, body);

        bodyMap.set(block.id, body);

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
        
        sceneRef.current?.add(mesh);
        
        physObjectsRef.current.push({ mesh, body, id: ind.id, blockId: block.id });
      });

      nodes.forEach(block => {
        if (block.parentId === undefined) return; 
        
        const parentBody = bodyMap.get(block.parentId);
        const childBody = bodyMap.get(block.id);
        const parentBlock = nodes.find(n => n.id === block.parentId);

        if (parentBody && childBody && parentBlock) {
          
          const siblings = parentToChildren.get(block.parentId) || [];
          const faceGroup = siblings.filter(s => s.attachFace === block.attachFace);
          const indexInFace = faceGroup.findIndex(s => s.id === block.id);
          const countInFace = faceGroup.length;

          const face = block.attachFace;
          const axisIdx = Math.floor(face / 2);
          const dir = face % 2 === 0 ? 1 : -1;

          const parentHalf = parentBlock.size[axisIdx] / 2;
          const childHalf = block.size[axisIdx] / 2;
          
          // Spread Logic
          let spreadOffset = 0;
          let spreadAxis = 0;
           
          // Select spread axis based on face normal
          if (axisIdx === 0) spreadAxis = 2; // Face X -> Spread Z
          else if (axisIdx === 1) spreadAxis = 0; // Face Y -> Spread X
          else spreadAxis = 0; // Face Z -> Spread X

          if (countInFace > 1) {
              const parentDim = parentBlock.size[spreadAxis];
              const available = parentDim * 0.8;
              const t = indexInFace / (countInFace - 1); 
              spreadOffset = (t - 0.5) * available;
          }

          let a1 = {x: 0, y: 0, z: 0};
          if (axisIdx === 0) a1.x = parentHalf * dir;
          if (axisIdx === 1) a1.y = parentHalf * dir;
          if (axisIdx === 2) a1.z = parentHalf * dir;

          // Apply Spread to Parent Anchor
          if (spreadAxis === 0) a1.x += spreadOffset;
          if (spreadAxis === 1) a1.y += spreadOffset;
          if (spreadAxis === 2) a1.z += spreadOffset;

          let a2 = {x: 0, y: 0, z: 0};
          if (axisIdx === 0) a2.x = -childHalf * dir;
          if (axisIdx === 1) a2.y = -childHalf * dir;
          if (axisIdx === 2) a2.z = -childHalf * dir;

          let axis;
          if (block.jointType === JointType.SPHERICAL) {
              // Swivel Axis (Y)
              axis = { x: 0, y: 1, z: 0 };
          } else {
              // Hinge Axis (Z)
              axis = { x: 0, y: 0, z: 1 };
          }

          const jointData = RAPIER.JointData.revolute(a1, a2, axis);
          jointData.limitsEnabled = true;
          jointData.limits = [-Math.PI / 1.5, Math.PI / 1.5];

          const joint = world.createImpulseJoint(jointData, parentBody, childBody, true);
          
          (joint as any).configureMotorModel(RAPIER.MotorModel.ForceBased);
          
          // Use deterministic params from genome if available, otherwise fallback to deterministic default
          const params = block.jointParams || { speed: 5, phase: block.id * 0.5, amp: 1.0 };

          physJointsRef.current.push({
             joint,
             motorType: block.jointType || JointType.REVOLUTE,
             phase: params.phase,
             speed: params.speed,
             amp: params.amp,
             body: childBody,
             parentBody: parentBody
          });
        }
      });
    });

  }, [generation, isPhysicsReady, population.length]); 

  // 4. Animation Loop
  useEffect(() => {
    let lastTime = performance.now();

    const animate = (time: number) => {
      requestRef.current = requestAnimationFrame(animate);
      if (!worldRef.current || !sceneRef.current || !cameraRef.current || !controlsRef.current) return;

      const deltaTime = (time - lastTime) / 1000;
      lastTime = time;

      if (isPlaying) {
         const fixedTimeStep = 1/60;
         worldRef.current.timestep = fixedTimeStep;
         
         const steps = Math.min(5, Math.ceil(simulationSpeed));
         
         for(let i=0; i<steps; i++) {
             simTimeRef.current += fixedTimeStep;
             const t = simTimeRef.current;
             
             physJointsRef.current.forEach(pj => {
                 if (!pj.body.isValid() || !pj.parentBody.isValid()) return;
                 
                 const targetPos = Math.sin(t * pj.speed + pj.phase) * pj.amp;
                 
                 // Lower stiffness and damping to avoid explosions since we can't hard clamp torque easily in Rapier JS ImpulseJoints
                 const stiffness = 200.0; 
                 const damping = 20.0;

                 (pj.joint as any).configureMotorPosition(targetPos, stiffness, damping);
             });
             
             try {
                worldRef.current.step();
             } catch (e) {
                console.error("Physics Panic:", e);
             }
         }
      }

      // Sync Physics to Visuals
      const currentFitness: Record<string, number> = {};
      const VELOCITY_THRESHOLD = 50.0; // m/s threshold for explosion detection
      
      physObjectsRef.current.forEach(obj => {
         if (!obj.body.isValid()) return;
         
         // If disqualified, keep reporting low fitness and skip visual updates
         if (disqualifiedRef.current.has(obj.id)) {
             obj.mesh.visible = false;
             if (obj.blockId === 0) {
                 currentFitness[obj.id] = -10000; // Heavy penalty
             }
             return;
         }

         try {
            // Check for physics explosions
            const linvel = obj.body.linvel();
            const velMag = Math.sqrt(linvel.x ** 2 + linvel.y ** 2 + linvel.z ** 2);

            if (velMag > VELOCITY_THRESHOLD) {
                // Disqualify this creature
                disqualifiedRef.current.add(obj.id);
                
                // Hide and sleep
                obj.body.setTranslation({ x: 0, y: -100, z: 0 }, true); 
                obj.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
                obj.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
                obj.body.sleep();
                
                obj.mesh.visible = false;

                if (obj.blockId === 0) {
                    currentFitness[obj.id] = -10000;
                }
                return;
            }

            const t = obj.body.translation();
            const r = obj.body.rotation();
            
            if (Number.isFinite(t.x) && !Number.isNaN(r.w)) {
                obj.mesh.position.set(t.x, t.y, t.z);
                obj.mesh.quaternion.set(r.x, r.y, r.z, r.w);
                obj.mesh.visible = true; 
                
                // Respawn fell creatures
                if (t.y < -20) {
                   obj.body.setTranslation({ x: 0, y: 5, z: 0 }, true);
                   obj.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
                   obj.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
                }
            }
            
            if (obj.blockId === 0) {
                currentFitness[obj.id] = t.x;
            }
         } catch (e) {
             // Catch any transient WASM read errors or NaN
             disqualifiedRef.current.add(obj.id);
             obj.mesh.visible = false;
             if (obj.blockId === 0) currentFitness[obj.id] = -10000;
         }
      });

      if (time - lastFitnessReportRef.current > 50) {
          onFitnessUpdateRef.current(currentFitness);
          lastFitnessReportRef.current = time;
      }

      // Camera Follow Logic
      const currentSelectedId = selectedIdRef.current;
      let targetPos: THREE.Vector3 | null = null;

      if (currentSelectedId && !disqualifiedRef.current.has(currentSelectedId)) {
        const targetObj = physObjectsRef.current.find(obj => obj.id === currentSelectedId && obj.blockId === 0);
        if (targetObj) {
            targetPos = targetObj.mesh.position.clone();
        }
      }

      if (targetPos) {
        if (shouldSnapCameraRef.current) {
            const offset = cameraRef.current.position.clone().sub(controlsRef.current.target);
            controlsRef.current.target.copy(targetPos);
            cameraRef.current.position.copy(targetPos).add(offset);
            shouldSnapCameraRef.current = false;
            prevTargetPosRef.current = targetPos;
        } else if (prevTargetPosRef.current) {
            const delta = targetPos.clone().sub(prevTargetPosRef.current);
            cameraRef.current.position.add(delta);
            controlsRef.current.target.add(delta);
            prevTargetPosRef.current = targetPos;
        }
      }

      controlsRef.current.update();
      rendererRef.current.render(sceneRef.current, cameraRef.current);
    };

    requestRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(requestRef.current);
  }, [isPlaying, simulationSpeed]);

  return (
    <div ref={containerRef} className="w-full h-full relative rounded-lg overflow-hidden border border-slate-800 shadow-2xl bg-[#020617] cursor-move">
       {!isPhysicsReady && (
         <div className="absolute inset-0 flex items-center justify-center text-emerald-500 font-mono bg-slate-950 z-20">
            INITIALIZING RAPIER ENGINE...
         </div>
       )}
    </div>
  );
};
