import {
  CTRL_SCHEMA_VERSION,
  addControllerConnection,
  addControllerNode,
  buildControllerBlueprint,
  createDefaultControllerGenome,
  deserializeControllerGenome,
  serializeControllerGenome,
  validateControllerGenome
} from '../genomes/ctrlGenome.js';

describe('createDefaultControllerGenome', () => {
  it('produces a valid controller with oscillator and actuator nodes', () => {
    const genome = createDefaultControllerGenome();

    expect(genome.version).toBe(CTRL_SCHEMA_VERSION);
    expect(Array.isArray(genome.nodes)).toBe(true);
    const nodeIds = genome.nodes.map((node) => node.id);
    expect(nodeIds).toEqual(
      expect.arrayContaining(['bias', 'oscillator', 'motor', 'root-height'])
    );
    const actuator = genome.nodes.find((node) => node.id === 'motor');
    expect(actuator).toMatchObject({
      type: 'actuator',
      target: { id: 'torso__leg', channel: 'torque' }
    });
    expect(Array.isArray(genome.connections)).toBe(true);
    const selfConnection = genome.connections.find((connection) =>
      connection.id.includes('osc')
    );
    expect(selfConnection).toMatchObject({ target: 'oscillator' });
  });
});

describe('validateControllerGenome', () => {
  it('accepts the default genome', () => {
    const genome = createDefaultControllerGenome();

    const result = validateControllerGenome(genome);

    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('flags structural issues and missing metadata', () => {
    const genome = createDefaultControllerGenome();
    genome.version = '0.0.1';
    genome.nodes[0] = { type: 'sensor' };
    genome.connections.push({ id: 'bad', source: 'missing', target: 'motor' });

    const result = validateControllerGenome(genome);

    expect(result.valid).toBe(false);
    expect(result.errors).toEqual(
      expect.arrayContaining([
        expect.stringContaining('Unsupported controller schema version'),
        expect.stringContaining('missing a valid id'),
        expect.stringContaining('unknown source node')
      ])
    );
  });
});

describe('controller genome helpers', () => {
  it('adds nodes and connections while preserving immutability', () => {
    const base = createDefaultControllerGenome();

    const extended = addControllerConnection(
      addControllerNode(base, {
        id: 'hip-angle',
        type: 'sensor',
        gain: 0.5,
        offset: 0,
        source: { type: 'joint', id: 'torso__leg', metric: 'angle' }
      }),
      { id: 'hip-feedback', source: 'hip-angle', target: 'motor', weight: -0.3 }
    );

    expect(extended.nodes).toHaveLength(base.nodes.length + 1);
    expect(base.nodes).toHaveLength(createDefaultControllerGenome().nodes.length);
    expect(extended.connections).toHaveLength(base.connections.length + 1);
    expect(() => addControllerNode(extended, { id: 'hip-angle', type: 'sensor' })).toThrow(
      /already exists/
    );
  });

  it('serializes and deserializes a controller genome', () => {
    const genome = createDefaultControllerGenome();
    const serialized = serializeControllerGenome(genome);

    expect(typeof serialized).toBe('string');
    const parsed = deserializeControllerGenome(serialized);
    expect(parsed).toEqual(genome);
  });
});

describe('buildControllerBlueprint', () => {
  it('normalizes node defaults and resolves connections', () => {
    const genome = createDefaultControllerGenome();
    const blueprint = buildControllerBlueprint(genome);

    expect(blueprint.errors).toHaveLength(0);
    expect(blueprint.nodes.length).toBe(genome.nodes.length);
    const oscillator = blueprint.nodes.find((node) => node.id === 'oscillator');
    expect(oscillator).toMatchObject({
      type: 'oscillator',
      amplitude: expect.any(Number),
      frequency: expect.any(Number)
    });
    const actuator = blueprint.actuators.find((node) => node.id === 'motor');
    expect(actuator).toMatchObject({
      target: expect.objectContaining({ id: 'torso__leg', type: 'joint' })
    });
    const connectionTargets = blueprint.connections.map((connection) => connection.target);
    expect(new Set(connectionTargets).size).toBeGreaterThan(0);
  });

  it('returns errors when validation fails', () => {
    const malformed = { version: '0.0.1', nodes: [], connections: [] };

    const blueprint = buildControllerBlueprint(malformed);

    expect(blueprint.errors.length).toBeGreaterThan(0);
    expect(blueprint.nodes).toHaveLength(0);
  });
});
