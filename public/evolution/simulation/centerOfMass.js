export function computeCenterOfMass(instance) {
  let totalMass = 0;
  let sumX = 0;
  let sumY = 0;
  let sumZ = 0;

  instance.bodyOrder.forEach((bodyId) => {
    const entry = instance.bodies.get(bodyId);
    if (!entry) {
      return;
    }
    const translation = entry.body.translation();
    const mass = entry.body.mass();
    totalMass += mass;
    sumX += translation.x * mass;
    sumY += translation.y * mass;
    sumZ += translation.z * mass;
  });

  if (totalMass === 0) {
    return { x: 0, y: 0, z: 0 };
  }
  return { x: sumX / totalMass, y: sumY / totalMass, z: sumZ / totalMass };
}
