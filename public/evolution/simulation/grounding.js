import { ARENA_FLOOR_Y, ARENA_HALF_EXTENTS } from '../../environment/arena.js';

export const DEFAULT_GROUND_CLEARANCE = 0.02;

function toNumber(value, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

export function computeGroundClearanceOffset(descriptors, clearance = DEFAULT_GROUND_CLEARANCE) {
  if (!Array.isArray(descriptors) || descriptors.length === 0) {
    return 0;
  }
  const margin = Math.max(0, Number(clearance) || 0);
  const floorTop = ARENA_FLOOR_Y + ARENA_HALF_EXTENTS.y;
  let lowest = Infinity;
  descriptors.forEach((descriptor) => {
    if (!descriptor || !Array.isArray(descriptor.translation) || !Array.isArray(descriptor.halfExtents)) {
      return;
    }
    const centerY = toNumber(descriptor.translation[1]);
    const halfY = Math.abs(toNumber(descriptor.halfExtents[1]));
    const bottom = centerY - halfY;
    if (Number.isFinite(bottom) && bottom < lowest) {
      lowest = bottom;
    }
  });
  if (!Number.isFinite(lowest)) {
    return 0;
  }
  const target = floorTop + margin;
  return lowest < target ? target - lowest : 0;
}

export function applyGroundClearance(descriptors, clearance = DEFAULT_GROUND_CLEARANCE) {
  const offset = computeGroundClearanceOffset(descriptors, clearance);
  if (offset <= 0) {
    return 0;
  }
  descriptors.forEach((descriptor) => {
    if (!descriptor || !Array.isArray(descriptor.translation)) {
      return;
    }
    const centerY = toNumber(descriptor.translation[1], null);
    if (centerY === null) {
      return;
    }
    descriptor.translation[1] = centerY + offset;
  });
  return offset;
}
