import {
  MORPH_SCHEMA_VERSION,
  buildMorphologyBlueprint,
  createDefaultMorphGenome,
  generateSampleMorphGenomes,
  validateMorphGenome
} from '../genomes/morphGenome.js';

describe('createDefaultMorphGenome', () => {
  it('produces a schema-compliant hopper genome', () => {
    const genome = createDefaultMorphGenome();

    expect(genome.version).toBe(MORPH_SCHEMA_VERSION);
    expect(genome.metadata).toMatchObject({
      name: 'Phase 2 Hopper',
      description: expect.stringContaining('hopper'),
      tags: expect.arrayContaining(['demo', 'phase-2'])
    });
    expect(Array.isArray(genome.bodies)).toBe(true);
    expect(genome.bodies).toHaveLength(2);
    const torso = genome.bodies.find((body) => body.id === 'torso');
    const leg = genome.bodies.find((body) => body.id === 'leg');
    expect(torso).toMatchObject({
      shape: 'cuboid',
      halfExtents: [0.35, 0.25, 0.25],
      material: 'core'
    });
    expect(leg).toMatchObject({
      joint: expect.objectContaining({ parentId: 'torso' }),
      material: 'limb'
    });
  });
});

describe('validateMorphGenome', () => {
  it('accepts the default genome', () => {
    const genome = createDefaultMorphGenome();

    const result = validateMorphGenome(genome);

    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('rejects unsupported schema versions and structural issues', () => {
    const invalid = createDefaultMorphGenome();
    invalid.version = '0.0.1';
    invalid.bodies.push({ ...invalid.bodies[1], id: 'torso' });
    invalid.bodies[1] = { ...invalid.bodies[1], joint: { parentId: '' } };

    const result = validateMorphGenome(invalid);

    expect(result.valid).toBe(false);
    expect(result.errors).toEqual(
      expect.arrayContaining([
        expect.stringContaining('Unsupported genome version'),
        expect.stringContaining('duplicated'),
        expect.stringContaining('parentId')
      ])
    );
  });

  it('requires a single reachable root body', () => {
    const invalid = createDefaultMorphGenome();
    invalid.bodies[0].joint = {
      parentId: 'leg',
      axis: [0, 1, 0],
      parentAnchor: [0, 0, 0],
      childAnchor: [0, 0, 0],
      limits: [-1, 1]
    };

    const result = validateMorphGenome(invalid);

    expect(result.valid).toBe(false);
    expect(result.errors).toEqual(
      expect.arrayContaining([
        expect.stringContaining('single root body')
      ])
    );
  });
});

describe('buildMorphologyBlueprint', () => {
  it('normalizes poses, materials, and joint topology', () => {
    const genome = createDefaultMorphGenome();
    genome.materials.limb = {
      color: '#ffffff',
      density: 0.6,
      roughness: 0.42,
      metalness: 0.18,
      friction: 0.76,
      restitution: 0.19,
      linearDamping: 0.07,
      angularDamping: 0.08
    };
    genome.bodies[1].density = -5;

    const blueprint = buildMorphologyBlueprint(genome);

    expect(blueprint.errors).toHaveLength(0);
    expect(blueprint.bodies).toHaveLength(2);
    expect(blueprint.joints).toEqual([
      expect.objectContaining({
        id: 'torso__leg',
        parentId: 'torso',
        childId: 'leg'
      })
    ]);
    const torso = blueprint.bodies.find((body) => body.id === 'torso');
    const leg = blueprint.bodies.find((body) => body.id === 'leg');
    expect(torso.translation).toEqual([0, 1.1, 0]);
    expect(torso.rotation).toEqual([0, 0, 0, 1]);
    expect(leg.translation[0]).toBeCloseTo(0, 5);
    expect(leg.translation[1]).toBeCloseTo(0.4, 5);
    expect(leg.translation[2]).toBeCloseTo(0, 5);
    expect(leg.rotation).toEqual([0, 0, 0, 1]);
    expect(leg.density).toBeCloseTo(blueprint.materials.limb.density);
    expect(blueprint.materials.limb).toMatchObject({
      id: 'limb',
      color: '#ffffff',
      linearDamping: 0.07,
      angularDamping: 0.08
    });
  });

  it('propagates disableContacts flags to the blueprint joints', () => {
    const genome = createDefaultMorphGenome();
    delete genome.bodies[1].joint.disableContacts;

    const baseline = buildMorphologyBlueprint(genome);
    expect(baseline.joints[0]).toMatchObject({ disableContacts: false });

    genome.bodies[1].joint.disableContacts = true;

    const toggled = buildMorphologyBlueprint(genome);
    expect(toggled.joints[0]).toMatchObject({ disableContacts: true });
  });

  it('surfaces validation errors for malformed genomes', () => {
    const malformed = { version: '0.1.0', bodies: [] };

    const blueprint = buildMorphologyBlueprint(malformed);

    expect(blueprint.errors.length).toBeGreaterThan(0);
    expect(blueprint.bodies).toHaveLength(0);
    expect(blueprint.joints).toHaveLength(0);
    expect(blueprint.materials).toEqual({});
  });
});

describe('generateSampleMorphGenomes', () => {
  it('builds the requested number of valid variants', () => {
    const samples = generateSampleMorphGenomes(6);

    expect(samples).toHaveLength(6);
    const names = new Set();
    samples.forEach((sample, index) => {
      const { valid, errors } = validateMorphGenome(sample);
      expect(valid).toBe(true);
      expect(errors).toHaveLength(0);
      expect(sample.metadata.name).toBe(`Preview Variant ${index + 1}`);
      names.add(sample.metadata.name);
    });
    expect(names.size).toBe(6);
  });

  it('adds accessories and pose tweaks across variants', () => {
    const samples = generateSampleMorphGenomes(6);

    const legHeights = new Set();
    const tailIds = [];
    samples.forEach((sample) => {
      const leg = sample.bodies.find((body) => body.id === 'leg');
      legHeights.add(leg.halfExtents[1]);
      const tail = sample.bodies.find((body) => body.id.startsWith('tail-'));
      if (tail) {
        tailIds.push(tail.id);
      }
    });

    expect(legHeights.size).toBeGreaterThan(1);
    expect(tailIds).toEqual(['tail-0', 'tail-3']);
  });
});
