export const ARENA_HALF_EXTENTS = { x: 12, y: 0.1, z: 9 };
export const ARENA_FLOOR_Y = -0.6;
export const ARENA_SIZE = {
  width: ARENA_HALF_EXTENTS.x * 2,
  height: ARENA_HALF_EXTENTS.y * 2,
  depth: ARENA_HALF_EXTENTS.z * 2
};

export const OBJECTIVE_HALF_EXTENTS = { x: 0.4, y: 0.4, z: 0.4 };
export const OBJECTIVE_COLOR = '#22c55e';
export const OBJECTIVE_POSITION = {
  x: 8,
  y: ARENA_FLOOR_Y + ARENA_HALF_EXTENTS.y + OBJECTIVE_HALF_EXTENTS.y,
  z: 0
};
export const OBJECTIVE_SIZE = {
  width: OBJECTIVE_HALF_EXTENTS.x * 2,
  height: OBJECTIVE_HALF_EXTENTS.y * 2,
  depth: OBJECTIVE_HALF_EXTENTS.z * 2
};

export function horizontalDistanceToObjective(point, objectivePosition = OBJECTIVE_POSITION) {
  if (!point || typeof point !== 'object') {
    return Math.hypot(objectivePosition.x, objectivePosition.z);
  }
  const x = Number(point.x ?? point[0]) || 0;
  const z = Number(point.z ?? point[2]) || 0;
  const dx = x - objectivePosition.x;
  const dz = z - objectivePosition.z;
  return Math.hypot(dx, dz);
}
