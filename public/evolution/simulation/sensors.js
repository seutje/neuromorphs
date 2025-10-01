import { OBJECTIVE_POSITION, horizontalDistanceToObjective } from '../../environment/arena.js';

export function gatherSensorSnapshot(instance) {
  const bodies = [];
  const bodyMap = new Map();

  instance.bodies.forEach((entry, bodyId) => {
    const translation = entry.body.translation();
    const linvel = entry.body.linvel();
    const angvel = entry.body.angvel();
    const halfExtents = entry.halfExtents || [0.5, 0.5, 0.5];
    const footHeight = translation.y - halfExtents[1];
    const contact = footHeight <= -0.48;
    const snapshot = {
      id: bodyId,
      height: translation.y,
      velocity: { x: linvel.x, y: linvel.y, z: linvel.z },
      speed: Math.hypot(linvel.x, linvel.y, linvel.z),
      angularVelocity: { x: angvel.x, y: angvel.y, z: angvel.z },
      contact
    };
    bodies.push(snapshot);
    bodyMap.set(bodyId, snapshot);
  });

  const joints = instance.jointDescriptors.map((descriptor) => {
    const joint = descriptor.handle;
    let angle = 0;
    let velocity = 0;
    if (joint) {
      try {
        if (typeof joint.angles === 'function') {
          const result = joint.angles();
          angle = Array.isArray(result) ? Number(result[0]) || 0 : Number(result) || 0;
        } else if (typeof joint.angle === 'function') {
          angle = Number(joint.angle()) || 0;
        }
      } catch (_error) {
        angle = 0;
      }
      try {
        if (typeof joint.angularVelocity === 'function') {
          velocity = Number(joint.angularVelocity()) || 0;
        }
      } catch (_error) {
        velocity = 0;
      }
    }
    return {
      id: descriptor.id,
      parentId: descriptor.parentId,
      childId: descriptor.childId,
      angle,
      velocity,
      limits: descriptor.limits ? [...descriptor.limits] : null
    };
  });

  const rootId = instance.rootId;
  const rootSnapshot = rootId ? bodyMap.get(rootId) : null;
  const rootEntry = rootId ? instance.bodies.get(rootId) : null;
  const rootTranslation = rootEntry?.body.translation();
  const rootPosition = rootTranslation
    ? { x: rootTranslation.x, y: rootTranslation.y, z: rootTranslation.z }
    : { x: 0, y: 0, z: 0 };

  const objectiveDistance = horizontalDistanceToObjective(rootPosition, OBJECTIVE_POSITION);
  const footCandidate = bodies.find((body) => body.id !== rootId) || null;

  return {
    bodies,
    joints,
    summary: {
      rootHeight: rootSnapshot?.height ?? 0,
      rootVelocityY: rootSnapshot?.velocity?.y ?? 0,
      rootSpeed: rootSnapshot?.speed ?? 0,
      footContact: footCandidate?.contact ?? false,
      primaryJointAngle: joints[0]?.angle ?? 0,
      primaryJointVelocity: joints[0]?.velocity ?? 0,
      rootPosition,
      objectiveDistance
    }
  };
}
