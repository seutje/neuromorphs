import { shouldEnableJointContacts } from '../workers/jointUtils.js';

describe('shouldEnableJointContacts', () => {
  it('enables contacts when descriptors are missing or empty', () => {
    expect(shouldEnableJointContacts(null)).toBe(true);
    expect(shouldEnableJointContacts(undefined)).toBe(true);
    expect(shouldEnableJointContacts({})).toBe(true);
  });

  it('respects the disableContacts flag on the descriptor', () => {
    expect(shouldEnableJointContacts({ disableContacts: true })).toBe(false);
    expect(shouldEnableJointContacts({ disableContacts: false })).toBe(true);
  });
});
