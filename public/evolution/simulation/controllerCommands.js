import {
  MAX_JOINT_ANGULAR_DELTA,
  clamp,
  normalizeVector,
  normalizeVector3,
  applyQuaternion,
  projectAngularInertia
} from './common.js';

export function applyControllerCommands(instance, commands) {
  if (!Array.isArray(commands) || commands.length === 0) {
    return;
  }
  commands.forEach((command) => {
    if (!command || command.target?.type !== 'joint') {
      return;
    }
    const descriptor = instance.jointMap.get(command.target.id);
    if (!descriptor) {
      return;
    }
    const parentEntry = instance.bodies.get(descriptor.parentId);
    const childEntry = instance.bodies.get(descriptor.childId);
    if (!parentEntry || !childEntry) {
      return;
    }
    const axis = normalizeVector(descriptor.axis || [0, 1, 0]);
    const parentRotation = parentEntry.body.rotation();
    const worldAxisVector = applyQuaternion(
      [parentRotation.x, parentRotation.y, parentRotation.z, parentRotation.w],
      axis
    );
    const normalizedAxis = normalizeVector3({
      x: worldAxisVector[0],
      y: worldAxisVector[1],
      z: worldAxisVector[2]
    });
    if (!normalizedAxis) {
      return;
    }
    const value = clamp(command.value ?? 0, -1, 1);
    if (value === 0) {
      return;
    }
    const parentInertiaMatrix = parentEntry.body.effectiveAngularInertia(normalizedAxis);
    const childInertiaMatrix = childEntry.body.effectiveAngularInertia(normalizedAxis);
    const parentInertia = projectAngularInertia(parentInertiaMatrix, [
      normalizedAxis.x,
      normalizedAxis.y,
      normalizedAxis.z
    ]);
    const childInertia = projectAngularInertia(childInertiaMatrix, [
      normalizedAxis.x,
      normalizedAxis.y,
      normalizedAxis.z
    ]);
    const baseInertia = Math.min(parentInertia, childInertia);
    if (!Number.isFinite(baseInertia) || baseInertia <= 0) {
      return;
    }
    const impulse = value * baseInertia * MAX_JOINT_ANGULAR_DELTA;
    if (impulse === 0) {
      return;
    }
    const torque = {
      x: normalizedAxis.x * impulse,
      y: normalizedAxis.y * impulse,
      z: normalizedAxis.z * impulse
    };
    childEntry.body.applyTorqueImpulse(torque, true);
    parentEntry.body.applyTorqueImpulse({ x: -torque.x, y: -torque.y, z: -torque.z }, true);
  });
}
