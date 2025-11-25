import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Genome, NeuralNode, NodeType } from '../types';
import { useResizeObserver } from '../hooks/useResizeObserver';
import { resolveNodePositions } from '../services/brainLayout';

interface BrainEditorCanvasProps {
    genome: Genome;
    selectedNodeId: string | null;
    onSelectNode: (id: string | null) => void;
}

export const BrainEditorCanvas: React.FC<BrainEditorCanvasProps> = ({ genome, selectedNodeId, onSelectNode }) => {
    const { nodes, connections } = genome.brain;
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
    const layoutPositions = useMemo(() => resolveNodePositions(nodes, 0.12, 0.08), [nodes]);

    // Helper to get mouse pos relative to canvas
    const getMousePos = (e: React.MouseEvent) => {
        const canvas = canvasRef.current;
        if (!canvas) return { x: 0, y: 0 };
        const rect = canvas.getBoundingClientRect();
        return {
            x: (e.clientX - rect.left) / rect.width,
            y: (e.clientY - rect.top) / rect.height
        };
    };

    // Draw Function
    const draw = React.useCallback(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        // Clear
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        // Draw Grid
        ctx.strokeStyle = '#1e293b';
        ctx.lineWidth = 1;
        const gridSize = 40;
        for (let x = 0; x < canvas.width; x += gridSize) {
            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x, canvas.height);
            ctx.stroke();
        }
        for (let y = 0; y < canvas.height; y += gridSize) {
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(canvas.width, y);
            ctx.stroke();
        }

        // Draw Connections
        connections.forEach(conn => {
            const source = nodes.find(n => n.id === conn.source);
            const target = nodes.find(n => n.id === conn.target);
            if (!source || !target) return;

            const sourcePos = layoutPositions.get(source.id) ?? { x: source.x, y: source.y };
            const targetPos = layoutPositions.get(target.id) ?? { x: target.x, y: target.y };

            const sx = sourcePos.x * canvas.width;
            const sy = sourcePos.y * canvas.height;
            const tx = targetPos.x * canvas.width;
            const ty = targetPos.y * canvas.height;

            ctx.beginPath();
            ctx.moveTo(sx, sy);
            ctx.lineTo(tx, ty);

            // Color based on weight
            ctx.strokeStyle = conn.weight > 0
                ? `rgba(52, 211, 153, ${Math.min(1, Math.abs(conn.weight) + 0.2)})` // Green
                : `rgba(244, 63, 94, ${Math.min(1, Math.abs(conn.weight) + 0.2)})`; // Red

            ctx.lineWidth = Math.max(1, Math.abs(conn.weight) * 4);
            ctx.stroke();

            // Draw arrow
            const angle = Math.atan2(ty - sy, tx - sx);
            const headLen = 8;
            ctx.beginPath();
            ctx.moveTo(tx - headLen * Math.cos(angle - Math.PI / 6), ty - headLen * Math.sin(angle - Math.PI / 6));
            ctx.lineTo(tx, ty);
            ctx.lineTo(tx - headLen * Math.cos(angle + Math.PI / 6), ty - headLen * Math.sin(angle + Math.PI / 6));
            ctx.fillStyle = ctx.strokeStyle;
            ctx.fill();
        });

        // Draw Nodes
        nodes.forEach(node => {
            const position = layoutPositions.get(node.id) ?? { x: node.x, y: node.y };
            const x = position.x * canvas.width;
            const y = position.y * canvas.height;
            const isSelected = node.id === selectedNodeId;
            const isHovered = node.id === hoveredNodeId;

            ctx.beginPath();
            const radius = isSelected ? 10 : (isHovered ? 9 : 8);
            ctx.arc(x, y, radius, 0, Math.PI * 2);

            // Fill based on type
            switch (node.type) {
                case NodeType.SENSOR: ctx.fillStyle = '#3b82f6'; break; // Blue
                case NodeType.ACTUATOR: ctx.fillStyle = '#f43f5e'; break; // Red
                case NodeType.OSCILLATOR: ctx.fillStyle = '#eab308'; break; // Yellow
                case NodeType.NEURON: ctx.fillStyle = '#94a3b8'; break; // Grey
                default: ctx.fillStyle = '#94a3b8';
            }
            ctx.fill();

            // Selection/Hover Ring
            if (isSelected || isHovered) {
                ctx.strokeStyle = '#ffffff';
                ctx.lineWidth = 2;
                ctx.stroke();
            }

            // Label
            ctx.fillStyle = '#e2e8f0';
            ctx.font = '12px monospace';
            ctx.textAlign = 'center';
            ctx.fillText(node.label || node.id, x, y + 24);
        });
    }, [nodes, connections, selectedNodeId, hoveredNodeId, layoutPositions]);

    // Keep a ref to the latest draw function so we can call it from resize observer
    const drawRef = useRef(draw);
    useEffect(() => {
        drawRef.current = draw;
        draw(); // Draw on data change
    }, [draw]);

    useResizeObserver(containerRef, (width, height) => {
        const canvas = canvasRef.current;
        if (canvas) {
            canvas.width = width;
            canvas.height = height;
            drawRef.current(); // Draw on resize
        }
    });

    const handleMouseMove = (e: React.MouseEvent) => {
        const { x, y } = getMousePos(e);
        const canvas = canvasRef.current;
        if (!canvas) return;

        // Find hovered node
        // Simple distance check (in normalized coords, need to account for aspect ratio if strict, but pixel check is easier)
        const pixelX = x * canvas.width;
        const pixelY = y * canvas.height;

        let found: string | null = null;
        for (const node of nodes) {
            const position = layoutPositions.get(node.id) ?? { x: node.x, y: node.y };
            const nx = position.x * canvas.width;
            const ny = position.y * canvas.height;
            const dist = Math.sqrt(Math.pow(pixelX - nx, 2) + Math.pow(pixelY - ny, 2));
            if (dist < 15) { // Hit radius
                found = node.id;
                break;
            }
        }
        setHoveredNodeId(found);
    };

    const handleClick = (e: React.MouseEvent) => {
        if (hoveredNodeId) {
            onSelectNode(hoveredNodeId);
        } else {
            onSelectNode(null);
        }
    };

    return (
        <div ref={containerRef} className="w-full h-full relative bg-slate-900 rounded-xl overflow-hidden border border-slate-800 shadow-inner">
            <div className="absolute top-4 left-4 pointer-events-none">
                <div className="bg-slate-950/50 backdrop-blur text-xs text-slate-400 px-2 py-1 rounded border border-slate-800">
                    Brain Editor Mode
                </div>
            </div>
            <canvas
                ref={canvasRef}
                className="w-full h-full cursor-crosshair"
                onMouseMove={handleMouseMove}
                onClick={handleClick}
                onMouseLeave={() => setHoveredNodeId(null)}
            />
        </div>
    );
};
