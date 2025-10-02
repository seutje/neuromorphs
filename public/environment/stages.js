import { ARENA_FLOOR_Y, ARENA_HALF_EXTENTS } from './arena.js';

export const DEFAULT_STAGE_ID = 'dash';

const obstacleHalfExtents = { x: 0.9, y: 0.8, z: 1.8 };
const obstaclePosition = {
  x: -4,
  y: ARENA_FLOOR_Y + ARENA_HALF_EXTENTS.y + obstacleHalfExtents.y,
  z: 0
};

const STAGES = [
  {
    id: 'dash',
    label: 'Dash',
    description: 'Open arena with a clear line to the objective cube.',
    obstacles: []
  },
  {
    id: 'obstacle',
    label: 'Obstacle',
    description: 'Adds a mid-course barrier between the hopper and the objective cube.',
    obstacles: [
      {
        id: 'mid-barrier',
        type: 'box',
        halfExtents: { ...obstacleHalfExtents },
        translation: { ...obstaclePosition },
        material: {
          color: '#f97316',
          roughness: 0.48,
          metalness: 0.2
        }
      }
    ]
  }
];

function normalizeStageId(value) {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

function cloneStage(stage) {
  return stage ? JSON.parse(JSON.stringify(stage)) : null;
}

export function listStages() {
  return STAGES.map((stage) => cloneStage(stage));
}

export function getStageDefinition(stageId) {
  const normalized = normalizeStageId(stageId);
  const stage = STAGES.find((entry) => entry.id === normalized) ?? STAGES[0];
  return cloneStage(stage);
}
