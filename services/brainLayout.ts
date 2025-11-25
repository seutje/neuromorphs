import { NeuralNode, NodeType } from '../types';

interface ResolvedPosition {
  x: number;
  y: number;
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

/**
 * Resolve node positions by spreading overlapping nodes in a deterministic spiral pattern.
 * Returns a map from node id to a non-overlapping normalized coordinate.
 */
export const resolveNodePositions = (
  nodes: NeuralNode[],
  minDistance = 0.1,
  padding = 0.05
): Map<string, ResolvedPosition> => {
  const positions = new Map<string, ResolvedPosition>();
  const angleStep = Math.PI / 4;

  const sortedNodes = [...nodes].sort((a, b) => a.id.localeCompare(b.id));

  for (const node of sortedNodes) {
    let candidateX = node.x;
    let candidateY = node.y;
    let attempt = 0;
    const maxAttempts = 32;

    while (attempt < maxAttempts) {
      const hasCollision = Array.from(positions.values()).some(pos => {
        const dx = candidateX - pos.x;
        const dy = candidateY - pos.y;
        return Math.hypot(dx, dy) < minDistance;
      });

      if (!hasCollision) {
        break;
      }

      const ring = Math.floor(attempt / 8) + 1;
      const angle = (attempt % 8) * angleStep;
      const offset = minDistance * ring;

      candidateX = clamp(node.x + Math.cos(angle) * offset, padding, 1 - padding);
      candidateY = clamp(node.y + Math.sin(angle) * offset, padding, 1 - padding);
      attempt += 1;
    }

    positions.set(node.id, { x: candidateX, y: candidateY });
  }

  return positions;
};

/**
 * Suggest a non-overlapping base position for a new node without relocating existing nodes.
 */
export const findOpenPosition = (
  existingNodes: NeuralNode[],
  preferredX = 0.5,
  preferredY = 0.5,
  minDistance = 0.1,
  padding = 0.05
): ResolvedPosition => {
  const probeNode: NeuralNode = {
    id: '__probe__',
    type: existingNodes[0]?.type ?? NodeType.NEURON,
    label: 'probe',
    activation: 0,
    x: preferredX,
    y: preferredY
  } as NeuralNode;

  const layout = resolveNodePositions([...existingNodes, probeNode], minDistance, padding);
  const resolved = layout.get(probeNode.id);

  return {
    x: resolved?.x ?? preferredX,
    y: resolved?.y ?? preferredY
  };
};
