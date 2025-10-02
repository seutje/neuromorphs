export function shouldEnableJointContacts(jointDescriptor) {
  if (!jointDescriptor || typeof jointDescriptor !== 'object') {
    return true;
  }
  if (typeof jointDescriptor.disableContacts === 'boolean') {
    return !jointDescriptor.disableContacts;
  }
  return true;
}
