import { MORPH_SCHEMA_VERSION, validateMorphGenome } from '../genomes/morphGenome.js';
import { mutateMorphGenome } from '../public/evolution/morphMutation.js';

function createStubRng() {
  const boolResults = [false, true, false];
  const intResults = [1];
  const rangeResults = [1.15];
  return {
    bool: jest.fn(() => (boolResults.length ? boolResults.shift() : false)),
    int: jest.fn(() => (intResults.length ? intResults.shift() : 0)),
    range: jest.fn(() => (rangeResults.length ? rangeResults.shift() : 1))
  };
}

function buildBaseGenome() {
  return {
    version: MORPH_SCHEMA_VERSION,
    metadata: {
      name: 'Resize Harness',
      description: 'Fixture for morph resize regression tests.',
      tags: ['test']
    },
    materials: {
      core: {
        color: '#38bdf8',
        density: 1,
        roughness: 0.3,
        metalness: 0.2,
        friction: 0.9,
        restitution: 0.2
      },
      limb: {
        color: '#f97316',
        density: 0.95,
        roughness: 0.4,
        metalness: 0.1,
        friction: 0.9,
        restitution: 0.22
      }
    },
    bodies: [
      {
        id: 'root',
        shape: 'cuboid',
        halfExtents: [0.3, 0.32, 0.28],
        density: 1,
        material: 'core',
        pose: {
          position: [0, 0.9, 0],
          rotation: [0, 0, 0, 1]
        }
      },
      {
        id: 'hip',
        shape: 'cuboid',
        halfExtents: [0.2, 0.4, 0.2],
        density: 0.95,
        material: 'limb',
        pose: {
          position: [0, -0.6, 0],
          rotation: [0, 0, 0, 1]
        },
        joint: {
          parentId: 'root',
          type: 'revolute',
          axis: [1, 0, 0],
          parentAnchor: [0, -0.32, 0],
          childAnchor: [0, 0.4, 0],
          limits: [-0.8, 0.8]
        }
      },
      {
        id: 'foot',
        shape: 'cuboid',
        halfExtents: [0.14, 0.12, 0.18],
        density: 0.9,
        material: 'limb',
        pose: {
          position: [0, -1, 0],
          rotation: [0, 0, 0, 1]
        },
        joint: {
          parentId: 'hip',
          type: 'revolute',
          axis: [1, 0, 0],
          parentAnchor: [0, -0.38, 0],
          childAnchor: [0, 0.12, 0],
          limits: [-0.5, 0.5]
        }
      }
    ]
  };
}

describe('mutateMorphGenome resize-body', () => {
  it('scales anchors and child offsets alongside body dimensions', () => {
    const base = buildBaseGenome();
    const rng = createStubRng();

    const { genome, operations } = mutateMorphGenome(base, rng);

    expect(operations).toContain('resize-body');
    const { valid, errors } = validateMorphGenome(genome);
    expect(valid).toBe(true);
    expect(errors).toHaveLength(0);

    const hip = genome.bodies.find((body) => body.id === 'hip');
    const foot = genome.bodies.find((body) => body.id === 'foot');

    expect(hip.halfExtents[1]).toBeCloseTo(0.46, 5);
    expect(hip.pose.position[1]).toBeCloseTo(-0.69, 5);
    expect(hip.joint.childAnchor[1]).toBeCloseTo(0.46, 5);

    expect(foot.pose.position[1]).toBeCloseTo(-1.15, 5);
    expect(foot.joint.parentAnchor[1]).toBeCloseTo(-0.437, 3);
    expect(foot.joint.childAnchor[1]).toBeCloseTo(0.12, 5);
  });
});
