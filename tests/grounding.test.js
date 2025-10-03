import { buildMorphologyBlueprint, MORPH_SCHEMA_VERSION } from '../genomes/morphGenome.js';
import {
  applyGroundClearance,
  DEFAULT_GROUND_CLEARANCE,
  computeGroundClearanceOffset
} from '../public/evolution/simulation/grounding.js';
import { ARENA_FLOOR_Y, ARENA_HALF_EXTENTS } from '../public/environment/arena.js';

function createGroundIntersectingMorph() {
  return {
    version: MORPH_SCHEMA_VERSION,
    metadata: { name: 'Ground Test', description: 'Fixture for ground clearance tests.' },
    materials: {
      core: { density: 1, friction: 0.9, restitution: 0.2, roughness: 0.4, metalness: 0.1 },
      limb: { density: 0.9, friction: 0.9, restitution: 0.22, roughness: 0.42, metalness: 0.1 }
    },
    bodies: [
      {
        id: 'torso',
        shape: 'cuboid',
        halfExtents: [0.34, 0.16, 0.2],
        density: 1,
        material: 'core',
        pose: {
          position: [0, 1, 0],
          rotation: [0, 0, 0, 1]
        }
      },
      {
        id: 'leg',
        shape: 'cuboid',
        halfExtents: [0.1, 0.35, 0.1],
        density: 0.9,
        material: 'limb',
        pose: {
          position: [0, -0.6, 0],
          rotation: [0, 0, 0, 1]
        },
        joint: {
          parentId: 'torso',
          type: 'revolute',
          axis: [1, 0, 0],
          parentAnchor: [0, -0.12, 0],
          childAnchor: [0, 0.35, 0],
          limits: [-1, 0.6]
        }
      },
      {
        id: 'foot',
        shape: 'cuboid',
        halfExtents: [0.12, 0.08, 0.16],
        density: 0.9,
        material: 'limb',
        pose: {
          position: [0, -1.2, 0],
          rotation: [0, 0, 0, 1]
        },
        joint: {
          parentId: 'leg',
          type: 'revolute',
          axis: [1, 0, 0],
          parentAnchor: [0, -0.35, 0],
          childAnchor: [0, 0.08, 0],
          limits: [-0.4, 0.9]
        }
      }
    ]
  };
}

describe('applyGroundClearance', () => {
  it('raises blueprints that would spawn below the ground plane', () => {
    const morph = createGroundIntersectingMorph();
    const blueprint = buildMorphologyBlueprint(morph);
    const descriptors = blueprint.bodies.map((body) => ({
      id: body.id,
      translation: [...body.translation],
      halfExtents: [...body.halfExtents]
    }));

    const floorTop = ARENA_FLOOR_Y + ARENA_HALF_EXTENTS.y;
    const initialLowest = Math.min(
      ...descriptors.map((descriptor) => descriptor.translation[1] - descriptor.halfExtents[1])
    );
    expect(initialLowest).toBeLessThan(floorTop);

    const offset = applyGroundClearance(descriptors);
    expect(offset).toBeGreaterThan(0);

    descriptors.forEach((descriptor) => {
      const bottom = descriptor.translation[1] - descriptor.halfExtents[1];
      expect(bottom + Number.EPSILON).toBeGreaterThanOrEqual(floorTop + DEFAULT_GROUND_CLEARANCE);
    });
  });

  it('returns zero when bodies already clear the floor', () => {
    const morph = createGroundIntersectingMorph();
    morph.bodies[2].pose.position[1] = -0.8;
    const blueprint = buildMorphologyBlueprint(morph);
    const descriptors = blueprint.bodies.map((body) => ({
      translation: [...body.translation],
      halfExtents: [...body.halfExtents]
    }));
    const offset = computeGroundClearanceOffset(descriptors);
    expect(offset).toBeCloseTo(0, 12);
  });
});
