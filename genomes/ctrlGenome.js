export const CTRL_SCHEMA_VERSION = '0.1.0';

const VALID_NODE_TYPES = new Set([
  'constant',
  'sensor',
  'oscillator',
  'neuron',
  'actuator'
]);

const VALID_SENSOR_KINDS = new Set(['body', 'joint']);
const VALID_SENSOR_METRICS = new Set([
  'height',
  'velocityX',
  'velocityY',
  'velocityZ',
  'speed',
  'contact',
  'angle',
  'angularVelocity'
]);

const VALID_ACTUATOR_CHANNELS = new Set(['torque', 'targetAngle', 'velocity']);

function isFiniteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

function clampNumber(value, min, max, fallback = 0) {
  if (!isFiniteNumber(value)) {
    return fallback;
  }
  return Math.min(Math.max(value, min), max);
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function toStringOrNull(value) {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function sanitizeNode(node) {
  const id = toStringOrNull(node?.id);
  const type = toStringOrNull(node?.type);
  const base = {
    id,
    type
  };
  if (!VALID_NODE_TYPES.has(type)) {
    return { ...base, type: null };
  }
  if (type === 'constant') {
    return {
      ...base,
      value: isFiniteNumber(node?.value) ? node.value : 1
    };
  }
  if (type === 'sensor') {
    const sourceKind = toStringOrNull(node?.source?.type);
    const sourceId = toStringOrNull(node?.source?.id);
    const metric = toStringOrNull(node?.source?.metric);
    return {
      ...base,
      gain: isFiniteNumber(node?.gain) ? node.gain : 1,
      offset: isFiniteNumber(node?.offset) ? node.offset : 0,
      source: {
        type: VALID_SENSOR_KINDS.has(sourceKind) ? sourceKind : null,
        id: sourceId,
        metric: VALID_SENSOR_METRICS.has(metric) ? metric : null
      }
    };
  }
  if (type === 'oscillator') {
    return {
      ...base,
      bias: isFiniteNumber(node?.bias) ? node.bias : 0,
      amplitude: Math.max(Math.abs(node?.amplitude ?? 1), 0.001),
      frequency: Math.max(Math.abs(node?.frequency ?? 1.2), 0.001),
      frequencyGain: isFiniteNumber(node?.frequencyGain) ? node.frequencyGain : 0.2,
      phaseOffset: isFiniteNumber(node?.phaseOffset) ? node.phaseOffset : 0,
      offset: isFiniteNumber(node?.offset) ? node.offset : 0
    };
  }
  if (type === 'neuron') {
    const activation = toStringOrNull(node?.activation) || 'tanh';
    return {
      ...base,
      bias: isFiniteNumber(node?.bias) ? node.bias : 0,
      activation,
      leak: clampNumber(node?.leak ?? 0, 0, 1, 0),
      timeConstant: Math.max(Math.abs(node?.timeConstant ?? 1), 0.001)
    };
  }
  if (type === 'actuator') {
    const targetType = toStringOrNull(node?.target?.type);
    const targetId = toStringOrNull(node?.target?.id);
    const channel = toStringOrNull(node?.target?.channel);
    const activation = toStringOrNull(node?.activation) || 'tanh';
    return {
      ...base,
      bias: isFiniteNumber(node?.bias) ? node.bias : 0,
      activation,
      gain: isFiniteNumber(node?.gain) ? node.gain : 1,
      clamp: Math.max(Math.abs(node?.clamp ?? 1), 0.001),
      offset: isFiniteNumber(node?.offset) ? node.offset : 0,
      target: {
        type: targetType === 'joint' ? 'joint' : null,
        id: targetId,
        channel: VALID_ACTUATOR_CHANNELS.has(channel) ? channel : 'torque'
      }
    };
  }
  return base;
}

export function createDefaultControllerGenome() {
  return {
    version: CTRL_SCHEMA_VERSION,
    metadata: {
      name: 'Phase 3 Hopper Controller',
      description:
        'Single joint oscillator using body height, joint angle, and contact sensors to drive torque.',
      tags: ['demo', 'phase-3']
    },
    nodes: [
      { id: 'bias', type: 'constant', value: 1 },
      {
        id: 'root-height',
        type: 'sensor',
        gain: 1,
        offset: 0,
        source: { type: 'body', id: 'torso', metric: 'height' }
      },
      {
        id: 'foot-contact',
        type: 'sensor',
        gain: 1,
        offset: 0,
        source: { type: 'body', id: 'leg', metric: 'contact' }
      },
      {
        id: 'leg-angle',
        type: 'sensor',
        gain: 1,
        offset: 0,
        source: { type: 'joint', id: 'torso__leg', metric: 'angle' }
      },
      {
        id: 'oscillator',
        type: 'oscillator',
        amplitude: 0.75,
        frequency: 1.4,
        frequencyGain: 0.35,
        bias: 0,
        offset: 0
      },
      {
        id: 'motor',
        type: 'actuator',
        activation: 'tanh',
        gain: 8,
        clamp: 1,
        bias: 0,
        offset: 0,
        target: { type: 'joint', id: 'torso__leg', channel: 'torque' }
      }
    ],
    connections: [
      { id: 'c-bias-osc', source: 'bias', target: 'oscillator', weight: 0.4 },
      { id: 'c-height-osc', source: 'root-height', target: 'oscillator', weight: -0.3 },
      { id: 'c-contact-osc', source: 'foot-contact', target: 'oscillator', weight: -0.2 },
      {
        id: 'c-osc-self',
        source: 'oscillator',
        target: 'oscillator',
        weight: 0.25,
        recurrent: true
      },
      { id: 'c-bias-motor', source: 'bias', target: 'motor', weight: 0.1 },
      { id: 'c-osc-motor', source: 'oscillator', target: 'motor', weight: 0.9 },
      { id: 'c-angle-motor', source: 'leg-angle', target: 'motor', weight: -0.6 }
    ]
  };
}

export function validateControllerGenome(genome) {
  const errors = [];
  if (!genome || typeof genome !== 'object') {
    return { valid: false, errors: ['Genome must be an object.'] };
  }
  if (genome.version !== CTRL_SCHEMA_VERSION) {
    errors.push(`Unsupported controller schema version: ${genome.version}`);
  }
  if (!Array.isArray(genome.nodes) || genome.nodes.length === 0) {
    errors.push('Controller genome requires at least one node.');
  }
  const ids = new Set();
  const sensors = new Set();
  const actuators = new Set();
  if (Array.isArray(genome.nodes)) {
    genome.nodes.forEach((node, index) => {
      const sanitized = sanitizeNode(node);
      if (!sanitized.id) {
        errors.push(`Node at index ${index} is missing a valid id.`);
      } else if (ids.has(sanitized.id)) {
        errors.push(`Node id "${sanitized.id}" is duplicated.`);
      } else {
        ids.add(sanitized.id);
      }
      if (!sanitized.type) {
        errors.push(`Node "${sanitized.id ?? index}" has unsupported type.`);
      }
      if (sanitized.type === 'sensor') {
        if (!sanitized.source?.type || !sanitized.source?.id || !sanitized.source?.metric) {
          errors.push(`Sensor node "${sanitized.id}" is missing a valid source.`);
        } else {
          sensors.add(sanitized.id);
        }
      }
      if (sanitized.type === 'actuator') {
        if (!sanitized.target?.type || !sanitized.target?.id) {
          errors.push(`Actuator node "${sanitized.id}" is missing a valid target.`);
        } else {
          actuators.add(sanitized.id);
        }
      }
    });
  }
  if (!Array.isArray(genome.connections)) {
    errors.push('Controller genome must provide connections as an array.');
  } else {
    const connectionIds = new Set();
    genome.connections.forEach((connection, index) => {
      const connectionId = toStringOrNull(connection?.id) ?? `connection-${index}`;
      if (connectionIds.has(connectionId)) {
        errors.push(`Connection id "${connectionId}" is duplicated.`);
      } else {
        connectionIds.add(connectionId);
      }
      if (!ids.has(connection?.source)) {
        errors.push(`Connection "${connectionId}" references unknown source node.`);
      }
      if (!ids.has(connection?.target)) {
        errors.push(`Connection "${connectionId}" references unknown target node.`);
      }
    });
  }
  if (actuators.size === 0) {
    errors.push('Controller genome must define at least one actuator node.');
  }
  return { valid: errors.length === 0, errors };
}

export function addControllerNode(genome, node) {
  const next = clone(genome);
  if (!Array.isArray(next.nodes)) {
    next.nodes = [];
  }
  const exists = next.nodes.some((entry) => entry?.id === node?.id);
  if (exists) {
    throw new Error(`Controller node with id "${node?.id}" already exists.`);
  }
  next.nodes.push(clone(node));
  return next;
}

export function addControllerConnection(genome, connection) {
  const next = clone(genome);
  if (!Array.isArray(next.connections)) {
    next.connections = [];
  }
  const exists = next.connections.some((entry) => entry?.id === connection?.id);
  if (exists) {
    throw new Error(`Controller connection with id "${connection?.id}" already exists.`);
  }
  next.connections.push(clone(connection));
  return next;
}

export function serializeControllerGenome(genome) {
  return JSON.stringify(genome, null, 2);
}

export function deserializeControllerGenome(serialized) {
  if (typeof serialized !== 'string') {
    throw new Error('Serialized genome must be a string.');
  }
  const parsed = JSON.parse(serialized);
  const genome = clone(parsed);
  const { valid, errors } = validateControllerGenome(genome);
  if (!valid) {
    throw new Error(`Deserialized controller genome failed validation: ${errors.join('; ')}`);
  }
  return genome;
}

export function buildControllerBlueprint(genome) {
  const { valid, errors } = validateControllerGenome(genome);
  if (!valid) {
    return { errors, nodes: [], connections: [], metadata: {} };
  }
  const nodes = genome.nodes.map((node) => sanitizeNode(node));
  const nodeMap = new Map(nodes.map((node) => [node.id, node]));
  const connections = Array.isArray(genome.connections)
    ? genome.connections
        .map((connection, index) => ({
          id: toStringOrNull(connection?.id) ?? `connection-${index}`,
          source: connection?.source,
          target: connection?.target,
          weight: isFiniteNumber(connection?.weight) ? connection.weight : 0,
          recurrent: Boolean(connection?.recurrent)
        }))
        .filter((connection) =>
          nodeMap.has(connection.source) && nodeMap.has(connection.target)
        )
    : [];
  return {
    errors: [],
    metadata: clone(genome.metadata ?? {}),
    nodes,
    connections,
    sensors: nodes.filter((node) => node.type === 'sensor'),
    actuators: nodes.filter((node) => node.type === 'actuator')
  };
}
