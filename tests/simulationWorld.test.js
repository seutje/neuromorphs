jest.mock('../public/physics/stability.js', () => ({
  configureCreatureSimulationWorld: jest.fn((world) => world)
}));

import { configureCreatureSimulationWorld } from '../public/physics/stability.js';
import { createSimulationWorld } from '../public/evolution/simulation/world.js';

function createColliderDescriptor() {
  return {
    setTranslation: jest.fn().mockReturnThis(),
    setCollisionGroups: jest.fn().mockReturnThis(),
    setCcdEnabled: jest.fn().mockReturnThis()
  };
}

describe('createSimulationWorld', () => {
  it('configures the world and enables CCD on environment colliders', () => {
    const createdDescriptors = [];

    const RAPIER = {
      Vector3: class {
        constructor(x, y, z) {
          this.x = x;
          this.y = y;
          this.z = z;
        }
      },
      World: class {
        constructor() {
          this.integrationParameters = {};
          this.timestep = null;
        }

        createCollider(descriptor) {
          createdDescriptors.push(descriptor);
          return { descriptor };
        }

        free() {}
      },
      ColliderDesc: {
        cuboid: jest.fn(() => createColliderDescriptor())
      }
    };

    const world = createSimulationWorld(RAPIER, 1 / 120, 'obstacle');

    expect(world).toBeInstanceOf(RAPIER.World);
    expect(configureCreatureSimulationWorld).toHaveBeenCalledTimes(1);
    expect(configureCreatureSimulationWorld).toHaveBeenCalledWith(world);
    expect(createdDescriptors.length).toBeGreaterThanOrEqual(2);
    createdDescriptors.forEach((descriptor) => {
      expect(descriptor.setCcdEnabled).toHaveBeenCalledWith(true);
    });
  });
});
