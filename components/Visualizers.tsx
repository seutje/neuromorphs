
import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { useResizeObserver } from '../hooks/useResizeObserver';
import { Genome, NeuralConnection, NeuralNode, BlockNode, NodeType } from '../types';

interface BrainVisualizerProps {
  genome: Genome;
  active: boolean;
}

export const BrainVisualizer: React.FC<BrainVisualizerProps> = ({ genome, active }) => {
  const { nodes, connections } = genome.brain;
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const drawRef = useRef<(time: number) => void>(() => { });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationFrameId: number;

    const draw = (time: number) => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // Draw connections
      connections.forEach(conn => {
        const source = nodes.find(n => n.id === conn.source);
        const target = nodes.find(n => n.id === conn.target);
        if (!source || !target) return;

        const sx = source.x * canvas.width;
        const sy = source.y * canvas.height;
        const tx = target.x * canvas.width;
        const ty = target.y * canvas.height;

        // Pulse effect if active
        const pulse = active ? Math.sin(time * 0.005 + (Math.abs(conn.weight) * 10)) : 0;
        const alpha = Math.min(1, Math.abs(conn.weight) + 0.2 + (pulse * 0.2));

        ctx.beginPath();
        ctx.moveTo(sx, sy);
        ctx.lineTo(tx, ty);
        ctx.strokeStyle = conn.weight > 0
          ? `rgba(52, 211, 153, ${alpha})` // Green positive
          : `rgba(244, 63, 94, ${alpha})`; // Red negative
        ctx.lineWidth = Math.abs(conn.weight) * 2;
        ctx.stroke();
      });

      // Draw Nodes
      nodes.forEach(node => {
        const x = node.x * canvas.width;
        const y = node.y * canvas.height;

        ctx.beginPath();
        ctx.arc(x, y, 6, 0, Math.PI * 2);

        // Fill based on type
        switch (node.type) {
          case NodeType.SENSOR: ctx.fillStyle = '#3b82f6'; break; // Blue
          case NodeType.ACTUATOR: ctx.fillStyle = '#f43f5e'; break; // Red
          case NodeType.OSCILLATOR: ctx.fillStyle = '#eab308'; break; // Yellow
          default: ctx.fillStyle = '#94a3b8'; // Grey
        }
        ctx.fill();

        // Active border
        if (active) {
          const activation = Math.sin(time * 0.01 + node.x * 10); // Fake activation
          ctx.strokeStyle = `rgba(255,255,255,${Math.abs(activation)})`;
          ctx.lineWidth = 2;
          ctx.stroke();
        }

        // Draw Label
        ctx.fillStyle = '#cbd5e1'; // Slate-300
        ctx.font = '10px monospace';
        ctx.textAlign = 'center';
        ctx.fillText(node.label, x, y + 16); // Position below the node
      });
    };

    drawRef.current = draw;

    const animate = (time: number) => {
      draw(time);
      if (active) {
        animationFrameId = requestAnimationFrame(animate);
      }
    };

    animate(0);

    return () => cancelAnimationFrame(animationFrameId);
  }, [genome, active]);

  useResizeObserver(canvasRef, (width, height) => {
    const canvas = canvasRef.current;
    if (canvas) {
      canvas.width = width;
      canvas.height = height;
      // Force a redraw after resize
      drawRef.current(0);
    }
  });

  return (
    <div className="relative w-full h-48 bg-slate-900/50 rounded border border-slate-700 overflow-hidden">
      <div className="absolute top-2 left-2 text-xs text-slate-400 uppercase font-mono pointer-events-none">Controller Graph</div>
      <canvas ref={canvasRef} width={400} height={192} className="w-full h-full" />
    </div>
  );
};

interface MorphologyVisualizerProps {
  genome: Genome;
}

export const MorphologyVisualizer: React.FC<MorphologyVisualizerProps> = ({ genome }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const creatureRef = useRef<THREE.Group | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // Setup Mini Scene
    const width = (container as any).clientWidth;
    const height = (container as any).clientHeight;

    const scene = new THREE.Scene();
    // Transparent background
    scene.background = null;
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 100);
    camera.position.set(4, 4, 5);
    camera.lookAt(0, 0, 0);
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    renderer.setSize(width, height);
    (container as any).appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // Lighting
    const amb = new THREE.AmbientLight(0xffffff, 0.8);
    scene.add(amb);
    const dir = new THREE.DirectionalLight(0xffffff, 1);
    dir.position.set(2, 5, 2);
    scene.add(dir);

    // Animation Loop
    let frameId = 0;
    const animate = () => {
      frameId = requestAnimationFrame(animate);
      if (creatureRef.current) {
        creatureRef.current.rotation.y += 0.005;
      }
      renderer.render(scene, camera);
    };
    animate();



    return () => {
      cancelAnimationFrame(frameId);
      if (rendererRef.current && container) {
        (container as any).removeChild(rendererRef.current.domElement);
      }
      renderer.dispose();
    };
  }, []);

  useResizeObserver(containerRef, (width, height) => {
    if (!cameraRef.current || !rendererRef.current) return;
    cameraRef.current.aspect = width / height;
    cameraRef.current.updateProjectionMatrix();
    rendererRef.current.setSize(width, height);
  });

  // Rebuild creature on genome change
  useEffect(() => {
    if (!sceneRef.current) return;
    const scene = sceneRef.current;

    // Remove old
    if (creatureRef.current) {
      scene.remove(creatureRef.current);
    }

    // Build New Group
    const group = new THREE.Group();
    const parts = new Map<number, { mesh: THREE.Mesh, block: BlockNode }>();

    // 1. Meshes
    genome.morphology.forEach(block => {
      const geometry = new THREE.BoxGeometry(block.size[0], block.size[1], block.size[2]);
      const material = new THREE.MeshStandardMaterial({ color: block.color, roughness: 0.3 });
      const mesh = new THREE.Mesh(geometry, material);
      parts.set(block.id, { mesh, block });
    });

    // 2. Assemble Hierarchy with Pivots
    // Pre-calc children to handle slots
    const parentToChildren = new Map<number, BlockNode[]>();
    genome.morphology.forEach(b => {
      if (b.parentId !== undefined) {
        const list = parentToChildren.get(b.parentId) || [];
        list.push(b);
        parentToChildren.set(b.parentId, list);
      }
    });

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

          // Determine slotting using attachFace and sibling overlap
          const siblings = parentToChildren.get(currentBlock.parentId) || [];
          const faceGroup = siblings.filter(s => s.attachFace === currentBlock.attachFace);
          const indexInFace = faceGroup.findIndex(s => s.id === currentBlock.id);
          const countInFace = faceGroup.length;

          const face = currentBlock.attachFace;
          const axisIdx = Math.floor(face / 2);
          const dir = face % 2 === 0 ? 1 : -1;

          // Spread Logic
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

          // Create Pivot Group
          const pivot = new THREE.Group();

          // Position Pivot on Parent Surface + Spread
          const parentHalf = parentBlock.size[axisIdx] / 2;
          const pivotPos = parentHalf * dir;

          if (axisIdx === 0) pivot.position.x = pivotPos;
          if (axisIdx === 1) pivot.position.y = pivotPos;
          if (axisIdx === 2) pivot.position.z = pivotPos;

          // Apply Spread
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

          // Position Child relative to Pivot (extending out)
          const childHalf = currentBlock.size[axisIdx] / 2;
          const childPos = childHalf * dir;
          if (axisIdx === 0) mesh.position.x = childPos;
          if (axisIdx === 1) mesh.position.y = childPos;
          if (axisIdx === 2) mesh.position.z = childPos;

          // Apply Child Offset
          const cOffset = currentBlock.childOffset || [0, 0];
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

    // Center it
    new THREE.Box3().setFromObject(group).getCenter(group.position).multiplyScalar(-1);

    scene.add(group);
    creatureRef.current = group;

  }, [genome]);

  return (
    <div className="relative w-full h-48 bg-slate-900/50 rounded border border-slate-700 overflow-hidden flex items-center justify-center">
      <div className="absolute top-2 left-2 text-xs text-slate-400 uppercase font-mono pointer-events-none z-10">Morphology 3D</div>
      <div ref={containerRef} className="w-full h-full" />
    </div>
  );
};
