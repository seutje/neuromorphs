import { NeuralNode } from '../types';

interface ResolvedPosition {
    x: number;
    y: number;
}

/**
 * Apply a simple repulsion-based layout to keep neural nodes from overlapping.
 * Positions stay close to their original normalized coordinates while ensuring
 * a minimum distance between points inside the canvas bounds.
 */
export function resolveNodeLayout(
    nodes: NeuralNode[],
    width: number,
    height: number,
    minDistance = 36,
    padding = 24
): Record<string, ResolvedPosition> {
    const resolved = nodes.map(node => ({
        id: node.id,
        x: node.x * width,
        y: node.y * height
    }));

    const iterations = 200;
    for (let iter = 0; iter < iterations; iter++) {
        let moved = false;

        for (let i = 0; i < resolved.length; i++) {
            for (let j = i + 1; j < resolved.length; j++) {
                const a = resolved[i];
                const b = resolved[j];
                let dx = a.x - b.x;
                let dy = a.y - b.y;
                let dist = Math.sqrt(dx * dx + dy * dy);

                if (dist === 0) {
                    // Perfect overlap: nudge in a deterministic direction
                    dx = 1;
                    dy = 0;
                    dist = 1;
                }

                if (dist < minDistance) {
                    const overlap = (minDistance - dist) / 2;
                    const nx = dx / dist;
                    const ny = dy / dist;

                    a.x += nx * overlap;
                    a.y += ny * overlap;
                    b.x -= nx * overlap;
                    b.y -= ny * overlap;
                    moved = true;
                }
            }
        }

        if (!moved) break;
    }

    const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

    return resolved.reduce<Record<string, ResolvedPosition>>((acc, pos) => {
        acc[pos.id] = {
            x: clamp(pos.x, padding, width - padding),
            y: clamp(pos.y, padding, height - padding)
        };
        return acc;
    }, {});
}
