import React, { useRef, useEffect, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { Genome, BlockNode } from '../types';
import { useResizeObserver } from '../hooks/useResizeObserver';
import { PRESETS } from '../config/presets';

interface EditorCanvasProps {
    genome: Genome;
    selectedBlockId: number | null;
    onSelectBlock: (id: number | null) => void;
    onLoadPreset: (genome: Genome) => void;
}

export const EditorCanvas: React.FC<EditorCanvasProps> = ({ genome, selectedBlockId, onSelectBlock, onLoadPreset }) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
    const sceneRef = useRef<THREE.Scene | null>(null);
    const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
    const creatureRef = useRef<THREE.Group | null>(null);
    const raycasterRef = useRef<THREE.Raycaster>(new THREE.Raycaster());
    const mouseRef = useRef<THREE.Vector2>(new THREE.Vector2());

    // Initialize Scene
    useEffect(() => {
        const container = containerRef.current;
        if (!container) return;

        const width = container.clientWidth;
        const height = container.clientHeight;

        const scene = new THREE.Scene();
        scene.background = new THREE.Color('#0f172a'); // Slate-900
        scene.fog = new THREE.FogExp2('#0f172a', 0.02);
        sceneRef.current = scene;

        const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 100);
        camera.position.set(5, 5, 5);
        camera.lookAt(0, 0, 0);
        cameraRef.current = camera;

        const renderer = new THREE.WebGLRenderer({ antialias: true });
        renderer.setSize(width, height);
        renderer.shadowMap.enabled = true;
        container.appendChild(renderer.domElement);
        rendererRef.current = renderer;

        const controls = new OrbitControls(camera, renderer.domElement);
        controls.enableDamping = true;
        controls.dampingFactor = 0.05;

        // Lights
        const amb = new THREE.AmbientLight(0xffffff, 0.6);
        scene.add(amb);
        const dir = new THREE.DirectionalLight(0xffffff, 1);
        dir.position.set(5, 10, 5);
        dir.castShadow = true;
        scene.add(dir);

        // Grid
        const grid = new THREE.GridHelper(20, 20, '#334155', '#1e293b');
        scene.add(grid);

        // Animation Loop
        let frameId = 0;
        const animate = () => {
            frameId = requestAnimationFrame(animate);
            controls.update();
            renderer.render(scene, camera);
        };
        animate();

        // Click Handler
        const handleClick = (event: MouseEvent) => {
            if (!container || !camera || !scene) return;
            const rect = container.getBoundingClientRect();
            mouseRef.current.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
            mouseRef.current.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

            raycasterRef.current.setFromCamera(mouseRef.current, camera);
            const intersects = raycasterRef.current.intersectObjects(scene.children, true);

            let foundId: number | null = null;
            for (const hit of intersects) {
                if (hit.object.userData.blockId !== undefined) {
                    foundId = hit.object.userData.blockId;
                    break;
                }
            }
            onSelectBlock(foundId);
        };
        renderer.domElement.addEventListener('click', handleClick);

        // Resize Handler
        // Removed window listener in favor of ResizeObserver

        return () => {
            cancelAnimationFrame(frameId);
            renderer.domElement.removeEventListener('click', handleClick);
            if (renderer && container) {
                container.removeChild(renderer.domElement);
            }
            renderer.dispose();
        };
    }, []); // Run once on mount

    useResizeObserver(containerRef, (width, height) => {
        if (!cameraRef.current || !rendererRef.current) return;
        cameraRef.current.aspect = width / height;
        cameraRef.current.updateProjectionMatrix();
        rendererRef.current.setSize(width, height);
    });

    // Rebuild Creature when genome changes
    useEffect(() => {
        if (!sceneRef.current) return;
        const scene = sceneRef.current;

        // Remove old creature
        if (creatureRef.current) {
            scene.remove(creatureRef.current);
        }

        const group = new THREE.Group();
        const parts = new Map<number, { mesh: THREE.Mesh, block: BlockNode }>();
        const parentToChildren = new Map<number, BlockNode[]>();

        // Pre-calc children
        genome.morphology.forEach(b => {
            if (b.parentId !== undefined) {
                const list = parentToChildren.get(b.parentId) || [];
                list.push(b);
                parentToChildren.set(b.parentId, list);
            }
        });

        // Create Meshes
        genome.morphology.forEach(block => {
            const geometry = new THREE.BoxGeometry(block.size[0], block.size[1], block.size[2]);
            const material = new THREE.MeshStandardMaterial({
                color: block.color,
                roughness: 0.3,
                emissive: selectedBlockId === block.id ? '#ffffff' : '#000000',
                emissiveIntensity: selectedBlockId === block.id ? 0.3 : 0
            });
            const mesh = new THREE.Mesh(geometry, material);
            mesh.castShadow = true;
            mesh.receiveShadow = true;
            mesh.userData = { blockId: block.id };
            parts.set(block.id, { mesh, block });
        });

        // Assemble Hierarchy (Same logic as Visualizers.tsx)
        genome.morphology.forEach(block => {
            const part = parts.get(block.id);
            if (!part) return;
            const { mesh, block: currentBlock } = part;

            if (currentBlock.parentId === undefined) {
                group.add(mesh);
            } else {
                const parentPart = parts.get(currentBlock.parentId);
                if (parentPart) {
                    const { mesh: parentMesh, block: parentBlock } = parentPart;

                    const siblings = parentToChildren.get(currentBlock.parentId) || [];
                    const faceGroup = siblings.filter(s => s.attachFace === currentBlock.attachFace);
                    const indexInFace = faceGroup.findIndex(s => s.id === currentBlock.id);
                    const countInFace = faceGroup.length;

                    const face = currentBlock.attachFace;
                    const axisIdx = Math.floor(face / 2);
                    const dir = face % 2 === 0 ? 1 : -1;

                    let spreadOffset = 0;
                    let spreadAxis = 0;

                    // Determine tangential axes for offsets
                    let uAxis = 0, vAxis = 0;
                    if (axisIdx === 0) { uAxis = 1; vAxis = 2; spreadAxis = 2; } // Face X -> Y, Z
                    else if (axisIdx === 1) { uAxis = 0; vAxis = 2; spreadAxis = 0; } // Face Y -> X, Z
                    else { uAxis = 0; vAxis = 1; spreadAxis = 0; } // Face Z -> X, Y

                    if (countInFace > 1) {
                        const parentDim = parentBlock.size[spreadAxis];
                        const available = parentDim * 0.8;
                        const t = indexInFace / (countInFace - 1);
                        spreadOffset = (t - 0.5) * available;
                    }

                    const pivot = new THREE.Group();
                    const parentHalf = parentBlock.size[axisIdx] / 2;
                    const pivotPos = parentHalf * dir;

                    if (axisIdx === 0) pivot.position.x = pivotPos;
                    if (axisIdx === 1) pivot.position.y = pivotPos;
                    if (axisIdx === 2) pivot.position.z = pivotPos;

                    // Apply Spread (legacy auto-layout)
                    if (spreadAxis === 0) pivot.position.x += spreadOffset;
                    if (spreadAxis === 1) pivot.position.y += spreadOffset;
                    if (spreadAxis === 2) pivot.position.z += spreadOffset;

                    // Apply Parent Offset
                    const pOffset = currentBlock.parentOffset || [0, 0];
                    if (uAxis === 0) pivot.position.x += pOffset[0];
                    if (uAxis === 1) pivot.position.y += pOffset[0];
                    if (uAxis === 2) pivot.position.z += pOffset[0];

                    if (vAxis === 0) pivot.position.x += pOffset[1];
                    if (vAxis === 1) pivot.position.y += pOffset[1];
                    if (vAxis === 2) pivot.position.z += pOffset[1];

                    parentMesh.add(pivot);

                    const childHalf = currentBlock.size[axisIdx] / 2;
                    const childPos = childHalf * dir;
                    if (axisIdx === 0) mesh.position.x = childPos;
                    if (axisIdx === 1) mesh.position.y = childPos;
                    if (axisIdx === 2) mesh.position.z = childPos;

                    // Apply Child Offset
                    const cOffset = currentBlock.childOffset || [0, 0];
                    // Note: Child offset moves the mesh relative to the pivot.
                    // The pivot is at the attachment point on the parent.
                    // The mesh is initially positioned so its face touches the pivot.
                    // We need to move the mesh along its tangential axes.

                    if (uAxis === 0) mesh.position.x -= cOffset[0];
                    if (uAxis === 1) mesh.position.y -= cOffset[0];
                    if (uAxis === 2) mesh.position.z -= cOffset[0];

                    if (vAxis === 0) mesh.position.x -= cOffset[1];
                    if (vAxis === 1) mesh.position.y -= cOffset[1];
                    if (vAxis === 2) mesh.position.z -= cOffset[1];

                    pivot.add(mesh);

                    // Joint Visual
                    const jointMesh = new THREE.Mesh(
                        new THREE.SphereGeometry(Math.min(0.1, Math.min(...currentBlock.size) / 2)),
                        new THREE.MeshStandardMaterial({ color: 0x555555 })
                    );
                    pivot.add(jointMesh);
                }
            }
        });

        // Center the group
        const box = new THREE.Box3().setFromObject(group);
        const center = box.getCenter(new THREE.Vector3());
        group.position.sub(center);
        group.position.y += 2; // Lift up a bit

        scene.add(group);
        creatureRef.current = group;

    }, [genome, selectedBlockId]);

    return (
        <div ref={containerRef} className="w-full h-full relative rounded-xl overflow-hidden border border-slate-800 shadow-inner bg-slate-900">
            <div className="absolute top-4 left-4 pointer-events-none">
                <div className="bg-slate-950/50 backdrop-blur text-xs text-slate-400 px-2 py-1 rounded border border-slate-800">
                    Editor Mode
                </div>
            </div>

            {/* Presets Dropdown */}
            <div className="absolute top-4 right-4 z-10">
                <select
                    className="bg-slate-950/80 backdrop-blur text-xs text-slate-300 px-3 py-1.5 rounded border border-slate-700 hover:border-slate-500 transition-colors cursor-pointer outline-none focus:ring-1 focus:ring-blue-500"
                    onChange={(e) => {
                        const preset = PRESETS.find(p => p.name === e.target.value);
                        if (preset) {
                            onLoadPreset(preset.genome);
                        }
                        // Reset select to default/placeholder if desired, or keep selected
                        e.target.value = "";
                    }}
                    defaultValue=""
                >
                    <option value="" disabled>Load Preset...</option>
                    {PRESETS.map(p => (
                        <option key={p.name} value={p.name}>{p.name}</option>
                    ))}
                </select>
            </div>
        </div>
    );
};
