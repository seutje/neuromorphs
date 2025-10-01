const MAX_MASK_VALUE = 0xffff;

export function createInteractionGroup(membership, filter) {
  const membershipMask = membership & MAX_MASK_VALUE;
  const filterMask = filter & MAX_MASK_VALUE;
  return (membershipMask << 16) | filterMask;
}

export function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

export function normalizeVector(vector) {
  if (!Array.isArray(vector) || vector.length !== 3) {
    return [0, 0, 0];
  }
  const [x, y, z] = vector.map((component) => Number(component) || 0);
  const length = Math.hypot(x, y, z);
  if (length === 0) {
    return [0, 0, 0];
  }
  return [x / length, y / length, z / length];
}

export function normalizeVector3({ x, y, z }) {
  const length = Math.hypot(x, y, z);
  if (length === 0) {
    return null;
  }
  return { x: x / length, y: y / length, z: z / length };
}

export function applyQuaternion([qx, qy, qz, qw], [vx, vy, vz]) {
  const ix = qw * vx + qy * vz - qz * vy;
  const iy = qw * vy + qz * vx - qx * vz;
  const iz = qw * vz + qx * vy - qy * vx;
  const iw = -qx * vx - qy * vy - qz * vz;

  return [
    ix * qw + iw * -qx + iy * -qz - iz * -qy,
    iy * qw + iw * -qy + iz * -qx - ix * -qz,
    iz * qw + iw * -qz + ix * -qy - iy * -qx
  ];
}

export function projectAngularInertia(matrix, axis) {
  if (!matrix || !matrix.elements || !Array.isArray(axis)) {
    return 0;
  }
  const [m11, m12, m13, m22, m23, m33] = matrix.elements;
  const [x, y, z] = axis;
  return (
    m11 * x * x +
    2 * m12 * x * y +
    2 * m13 * x * z +
    m22 * y * y +
    2 * m23 * y * z +
    m33 * z * z
  );
}

export const MAX_JOINT_ANGULAR_DELTA = 15;
export const COLLISION_GROUP_CREATURE = createInteractionGroup(0b0001, 0xfffe);
export const COLLISION_GROUP_ENVIRONMENT = createInteractionGroup(0b0010, 0xffff);
