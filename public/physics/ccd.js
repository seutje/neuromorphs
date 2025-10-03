export function enableContinuousCollisionDetection(descriptor) {
  if (!descriptor || typeof descriptor.setCcdEnabled !== 'function') {
    return descriptor;
  }
  descriptor.setCcdEnabled(true);
  return descriptor;
}

export function enableCcdOnDescriptors(...descriptors) {
  descriptors.forEach((descriptor) => {
    enableContinuousCollisionDetection(descriptor);
  });
  return descriptors;
}
