const ACTIVATIONS = {
  linear: (value) => value,
  tanh: (value) => Math.tanh(value),
  relu: (value) => (value > 0 ? value : 0),
  sigmoid: (value) => 1 / (1 + Math.exp(-value))
};

function getActivation(name) {
  return ACTIVATIONS[name] || ACTIVATIONS.tanh;
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function readSensorValue(node, bodySensors, jointSensors) {
  const { source, gain = 1, offset = 0 } = node;
  if (!source || !source.type || !source.id || !source.metric) {
    return 0;
  }
  if (source.type === 'body') {
    const entry = bodySensors.get(source.id);
    if (!entry) {
      return 0;
    }
    if (source.metric === 'height') {
      return entry.height * gain + offset;
    }
    if (source.metric === 'velocityX') {
      return entry.velocity.x * gain + offset;
    }
    if (source.metric === 'velocityY') {
      return entry.velocity.y * gain + offset;
    }
    if (source.metric === 'velocityZ') {
      return entry.velocity.z * gain + offset;
    }
    if (source.metric === 'speed') {
      return entry.speed * gain + offset;
    }
    if (source.metric === 'contact') {
      return (entry.contact ? 1 : 0) * gain + offset;
    }
  } else if (source.type === 'joint') {
    const entry = jointSensors.get(source.id);
    if (!entry) {
      return 0;
    }
    if (source.metric === 'angle') {
      return entry.angle * gain + offset;
    }
    if (source.metric === 'angularVelocity') {
      return entry.velocity * gain + offset;
    }
  }
  return 0;
}

function sumConnections(connections, nodes, property) {
  if (!connections) {
    return 0;
  }
  let total = 0;
  for (const connection of connections) {
    const sourceNode = nodes.get(connection.source);
    if (!sourceNode) {
      continue;
    }
    const value = property === 'previous' ? sourceNode.previousOutput : sourceNode.output;
    if (typeof value === 'number') {
      total += connection.weight * value;
    }
  }
  return total;
}

export function createControllerRuntime(blueprint) {
  if (!blueprint || blueprint.errors?.length) {
    return null;
  }
  const nodes = new Map();
  const incoming = new Map();
  const recurrent = new Map();
  const actuatorIds = [];

  blueprint.nodes.forEach((node) => {
    nodes.set(node.id, {
      ...clone(node),
      output: 0,
      previousOutput: 0,
      phase: 0
    });
    incoming.set(node.id, []);
    recurrent.set(node.id, []);
    if (node.type === 'actuator') {
      actuatorIds.push(node.id);
    }
  });

  blueprint.connections.forEach((connection) => {
    if (!connection || !nodes.has(connection.target) || !nodes.has(connection.source)) {
      return;
    }
    const bucket = connection.recurrent ? recurrent : incoming;
    const list = bucket.get(connection.target);
    list.push(connection);
  });

  function reset() {
    nodes.forEach((node) => {
      node.output = node.type === 'constant' ? node.value ?? 1 : 0;
      node.previousOutput = node.output;
      node.phase = 0;
    });
  }

  reset();

  function update(dt, sensors) {
    const bodySensors = new Map();
    const jointSensors = new Map();
    if (Array.isArray(sensors?.bodies)) {
      sensors.bodies.forEach((entry) => {
        if (entry && entry.id) {
          bodySensors.set(entry.id, entry);
        }
      });
    }
    if (Array.isArray(sensors?.joints)) {
      sensors.joints.forEach((entry) => {
        if (entry && entry.id) {
          jointSensors.set(entry.id, entry);
        }
      });
    }

    const actuatorCommands = [];

    nodes.forEach((node) => {
      node.previousOutput = node.output;
      if (node.type === 'constant') {
        node.output = node.value ?? 1;
        return;
      }
      if (node.type === 'sensor') {
        node.output = readSensorValue(node, bodySensors, jointSensors);
        return;
      }
      const feedforward = sumConnections(incoming.get(node.id), nodes, 'current');
      const recurrentSum = sumConnections(recurrent.get(node.id), nodes, 'previous');
      const combined = feedforward + recurrentSum + (node.bias ?? 0);
      if (node.type === 'oscillator') {
        const baseFrequency = node.frequency ?? 1;
        const nextFrequency = Math.max(baseFrequency + (node.frequencyGain ?? 0) * combined, 0.01);
        node.phase += dt * nextFrequency * Math.PI * 2;
        const amplitude = node.amplitude ?? 1;
        const offset = node.offset ?? 0;
        node.output = offset + Math.sin(node.phase + (node.phaseOffset ?? 0)) * amplitude;
        return;
      }
      const activation = getActivation(node.activation);
      const activated = activation(combined);
      if (node.type === 'neuron') {
        const leak = node.leak ?? 0;
        node.output = leak * node.previousOutput + (1 - leak) * activated;
        return;
      }
      if (node.type === 'actuator') {
        const gain = node.gain ?? 1;
        const offset = node.offset ?? 0;
        const clamp = node.clamp ?? 1;
        const raw = offset + activated * gain;
        const value = Math.max(Math.min(raw, clamp), -clamp);
        node.output = value;
        if (node.target?.type === 'joint' && node.target?.id) {
          actuatorCommands.push({
            id: node.id,
            value,
            target: { ...node.target }
          });
        }
      }
    });

    return {
      commands: actuatorCommands,
      nodeOutputs: Array.from(nodes.values()).map((node) => ({
        id: node.id,
        type: node.type,
        output: node.output
      }))
    };
  }

  function getState() {
    return {
      nodes: Array.from(nodes.values()).map((node) => ({
        id: node.id,
        type: node.type,
        output: node.output,
        previousOutput: node.previousOutput
      }))
    };
  }

  return {
    update,
    reset,
    getState,
    actuators: actuatorIds
  };
}
