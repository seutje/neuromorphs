
import { Individual, BlockNode, NeuralNode, NeuralConnection, NodeType, JointType, Genome } from '../types';

const COLORS = ['#10b981', '#3b82f6', '#8b5cf6', '#f43f5e', '#f59e0b', '#06b6d4'];

// --- Seeded RNG (Mulberry32) ---
let _seed = 42;

export const setSeed = (s: number) => {
  _seed = s;
};

// Returns a float between 0 and 1
const random = () => {
  let t = _seed += 0x6D2B79F5;
  t = Math.imul(t ^ t >>> 15, t | 1);
  t ^= t + Math.imul(t ^ t >>> 7, t | 61);
  return ((t ^ t >>> 14) >>> 0) / 4294967296;
};

// Helper for range
const randomRange = (min: number, max: number) => min + random() * (max - min);

const generateRandomMorphology = (nodeCount: number): BlockNode[] => {
  const nodes: BlockNode[] = [];
  for (let i = 0; i < nodeCount; i++) {
    const parentId = i === 0 ? undefined : Math.floor(random() * i);

    // Joint Diversity
    let jointType = JointType.REVOLUTE;
    if (parentId !== undefined) {
      if (parentId === 0) {
        jointType = JointType.SPHERICAL;
      } else {
        jointType = random() > 0.6 ? JointType.REVOLUTE : JointType.SPHERICAL;
      }
    }

    const attachFace = Math.floor(random() * 6);
    let parentOffset: [number, number] = [0, 0];
    let childOffset: [number, number] = [0, 0];

    if (parentId !== undefined) {
      const parent = nodes[parentId];
      const axisIdx = Math.floor(attachFace / 2);
      let uAxis = 0, vAxis = 0;
      if (axisIdx === 0) { uAxis = 1; vAxis = 2; }
      else if (axisIdx === 1) { uAxis = 0; vAxis = 2; }
      else { uAxis = 0; vAxis = 1; }

      // Current node size is not yet defined in the array, but we are defining it now.
      // We need to generate size first.
    }

    const size: [number, number, number] = [
      0.4 + random() * 0.4,
      0.2 + random() * 0.3,
      0.2 + random() * 0.3
    ];

    if (parentId !== undefined) {
      const parent = nodes[parentId];
      const axisIdx = Math.floor(attachFace / 2);
      let uAxis = 0, vAxis = 0;
      if (axisIdx === 0) { uAxis = 1; vAxis = 2; }
      else if (axisIdx === 1) { uAxis = 0; vAxis = 2; }
      else { uAxis = 0; vAxis = 1; }

      const parentLimitU = parent.size[uAxis] / 2;
      const parentLimitV = parent.size[vAxis] / 2;
      const childLimitU = size[uAxis] / 2;
      const childLimitV = size[vAxis] / 2;

      parentOffset = [
        (random() * 0.4 - 0.2),
        (random() * 0.4 - 0.2)
      ];
      childOffset = [
        (random() * 0.4 - 0.2),
        (random() * 0.4 - 0.2)
      ];

      // Clamp
      parentOffset[0] = Math.max(-parentLimitU, Math.min(parentLimitU, parentOffset[0]));
      parentOffset[1] = Math.max(-parentLimitV, Math.min(parentLimitV, parentOffset[1]));
      childOffset[0] = Math.max(-childLimitU, Math.min(childLimitU, childOffset[0]));
      childOffset[1] = Math.max(-childLimitV, Math.min(childLimitV, childOffset[1]));
    }

    nodes.push({
      id: i,
      size: size,
      color: COLORS[i % COLORS.length],
      parentId: parentId,
      jointType: jointType,
      jointParams: {
        speed: 2 + random() * 4,     // 2 to 6
        phase: random() * Math.PI * 2,
        amp: 0.5 + random() * 0.5    // 0.5 to 1.0
      },
      attachFace: attachFace,
      parentOffset: parentId !== undefined ? parentOffset : undefined,
      childOffset: parentId !== undefined ? childOffset : undefined
    });
  }
  return nodes;
};

const generateRandomBrain = (morphNodes: number): { nodes: NeuralNode[]; connections: NeuralConnection[] } => {
  const nodes: NeuralNode[] = [];
  const connections: NeuralConnection[] = [];

  // Sensors (Input Layer)
  nodes.push({ id: 's1', type: NodeType.SENSOR, label: 'Gnd Contact', activation: 0, x: 0.1, y: 0.2 });
  nodes.push({ id: 's2', type: NodeType.SENSOR, label: 'Joint Angle', activation: 0, x: 0.1, y: 0.5 });
  nodes.push({ id: 's3', type: NodeType.SENSOR, label: 'Velocity', activation: 0, x: 0.1, y: 0.8 });
  nodes.push({ id: 'o1', type: NodeType.OSCILLATOR, label: 'Clock', activation: 0, x: 0.1, y: 0.35 });

  // Hidden Neurons
  const hiddenCount = 3 + Math.floor(random() * 3);
  for (let i = 0; i < hiddenCount; i++) {
    nodes.push({
      id: `h${i}`,
      type: NodeType.NEURON,
      label: `N${i}`,
      activation: 0,
      x: 0.4 + (random() * 0.2),
      y: 0.2 + (random() * 0.6)
    });
  }

  // Actuators (Output Layer - usually one per joint)
  const actuatorCount = Math.max(0, morphNodes - 1);
  for (let i = 0; i < actuatorCount; i++) {
    nodes.push({
      id: `a${i}`,
      type: NodeType.ACTUATOR,
      label: `Joint ${i}`,
      activation: 0,
      x: 0.9,
      y: 0.2 + ((i + 1) / (actuatorCount + 1)) * 0.6
    });
  }

  // Random Connections
  const numConnections = nodes.length * 1.5;
  for (let i = 0; i < numConnections; i++) {
    const source = nodes[Math.floor(random() * nodes.length)];
    const target = nodes[Math.floor(random() * nodes.length)];

    if (source.type !== NodeType.ACTUATOR && target.type !== NodeType.SENSOR && source.id !== target.id) {
      connections.push({
        source: source.id,
        target: target.id,
        weight: (random() * 2) - 1
      });
    }
  }

  return { nodes, connections };
};

export const generateIndividual = (generation: number, index: number): Individual => {
  const nodeCount = 2 + Math.floor(random() * 3); // Start with body + 1 to 3 limbs
  return {
    // Use simple deterministic ID generation based on random stream
    id: `g${generation}-i${index}-${Math.floor(random() * 10000).toString(16)}`,
    generation,
    fitness: 0,
    speciesId: Math.floor(random() * 4),
    isAlive: true,
    genome: {
      morphology: generateRandomMorphology(nodeCount),
      brain: generateRandomBrain(nodeCount)
    }
  };
};

// Mutate a genome in place
export const mutateGenome = (genome: Genome, rate: number) => {
  const { brain, morphology } = genome;

  // Mutate Weights
  brain.connections.forEach(conn => {
    if (random() < rate) {
      conn.weight += (random() * 0.5) - 0.25;
    }
  });

  // Add Random Connection
  if (random() < rate * 0.5 && brain.nodes.length > 0) {
    const source = brain.nodes[Math.floor(random() * brain.nodes.length)];
    const target = brain.nodes[Math.floor(random() * brain.nodes.length)];
    if (source && target && source.type !== NodeType.ACTUATOR && target.type !== NodeType.SENSOR && source.id !== target.id) {
      brain.connections.push({
        source: source.id,
        target: target.id,
        weight: (random() * 2) - 1
      });
    }
  }

  // Mutate Morphology (Motor Control)
  morphology.forEach(block => {
    if (random() < rate) {
      // Mutate Speed
      block.jointParams.speed += (random() * 1.0) - 0.5;
      block.jointParams.speed = Math.max(0.1, Math.min(10, block.jointParams.speed));

      // Mutate Phase
      if (random() < 0.5) {
        block.jointParams.phase += (random() * 0.5) - 0.25;
      }

      // Mutate Amp
      if (random() < 0.5) {
        block.jointParams.amp += (random() * 0.2) - 0.1;
        block.jointParams.amp = Math.max(0.1, Math.min(1.5, block.jointParams.amp));
      }

      // Rare: Mutate attachment face
      if (block.parentId !== undefined && random() < 0.05) {
        block.attachFace = Math.floor(random() * 6);
      }

      // Mutate Offsets
      if (block.parentId !== undefined && random() < rate) {
        const parent = morphology.find(p => p.id === block.parentId);
        if (parent) {
          const face = block.attachFace;
          const axisIdx = Math.floor(face / 2); // 0=x, 1=y, 2=z

          // Determine tangential axes
          let uAxis = 0, vAxis = 0;
          if (axisIdx === 0) { uAxis = 1; vAxis = 2; } // Face X -> Y, Z
          else if (axisIdx === 1) { uAxis = 0; vAxis = 2; } // Face Y -> X, Z
          else { uAxis = 0; vAxis = 1; } // Face Z -> X, Y

          const parentLimitU = parent.size[uAxis] / 2;
          const parentLimitV = parent.size[vAxis] / 2;
          const childLimitU = block.size[uAxis] / 2;
          const childLimitV = block.size[vAxis] / 2;

          // Mutate Parent Offset
          if (!block.parentOffset) block.parentOffset = [0, 0];
          block.parentOffset[0] += (random() * 0.2) - 0.1;
          block.parentOffset[1] += (random() * 0.2) - 0.1;

          // Clamp Parent Offset
          block.parentOffset[0] = Math.max(-parentLimitU, Math.min(parentLimitU, block.parentOffset[0]));
          block.parentOffset[1] = Math.max(-parentLimitV, Math.min(parentLimitV, block.parentOffset[1]));

          // Mutate Child Offset
          if (!block.childOffset) block.childOffset = [0, 0];
          block.childOffset[0] += (random() * 0.2) - 0.1;
          block.childOffset[1] += (random() * 0.2) - 0.1;

          // Clamp Child Offset
          block.childOffset[0] = Math.max(-childLimitU, Math.min(childLimitU, block.childOffset[0]));
          block.childOffset[1] = Math.max(-childLimitV, Math.min(childLimitV, block.childOffset[1]));
        }
      }
    }
  });

  // NEW: Add Block (Growth)
  if (random() < rate) {
    const parent = morphology[Math.floor(random() * morphology.length)];
    const currentMaxId = morphology.reduce((max, n) => Math.max(max, n.id), 0);
    const newId = currentMaxId + 1;

    const attachFace = Math.floor(random() * 6);
    const size: [number, number, number] = [
      0.4 + random() * 0.4,
      0.2 + random() * 0.3,
      0.2 + random() * 0.3
    ];

    let parentOffset: [number, number] = [0, 0];
    let childOffset: [number, number] = [0, 0];

    // Calculate Offsets
    const axisIdx = Math.floor(attachFace / 2);
    let uAxis = 0, vAxis = 0;
    if (axisIdx === 0) { uAxis = 1; vAxis = 2; }
    else if (axisIdx === 1) { uAxis = 0; vAxis = 2; }
    else { uAxis = 0; vAxis = 1; }

    const parentLimitU = parent.size[uAxis] / 2;
    const parentLimitV = parent.size[vAxis] / 2;
    const childLimitU = size[uAxis] / 2;
    const childLimitV = size[vAxis] / 2;

    parentOffset = [
      (random() * 0.4 - 0.2),
      (random() * 0.4 - 0.2)
    ];
    childOffset = [
      (random() * 0.4 - 0.2),
      (random() * 0.4 - 0.2)
    ];

    // Clamp
    parentOffset[0] = Math.max(-parentLimitU, Math.min(parentLimitU, parentOffset[0]));
    parentOffset[1] = Math.max(-parentLimitV, Math.min(parentLimitV, parentOffset[1]));
    childOffset[0] = Math.max(-childLimitU, Math.min(childLimitU, childOffset[0]));
    childOffset[1] = Math.max(-childLimitV, Math.min(childLimitV, childOffset[1]));

    morphology.push({
      id: newId,
      parentId: parent.id,
      size: size,
      color: COLORS[newId % COLORS.length],
      jointType: random() > 0.5 ? JointType.REVOLUTE : JointType.SPHERICAL,
      jointParams: {
        speed: 2 + random() * 4,
        phase: random() * Math.PI * 2,
        amp: 0.5 + random() * 0.5
      },
      attachFace: attachFace,
      parentOffset: parentOffset,
      childOffset: childOffset
    });

    // Add Actuator
    const actuatorId = `a${newId}`;
    brain.nodes.push({
      id: actuatorId,
      type: NodeType.ACTUATOR,
      label: `Joint ${newId}`,
      activation: 0,
      x: 0.9,
      y: 0.1 + random() * 0.8
    });

    // Connect Actuator
    const inputs = brain.nodes.filter(n => n.type !== NodeType.ACTUATOR);
    if (inputs.length > 0) {
      const source = inputs[Math.floor(random() * inputs.length)];
      brain.connections.push({
        source: source.id,
        target: actuatorId,
        weight: (random() * 2) - 1
      });
    }
  }

  // NEW: Remove Block (Pruning)
  if (random() < rate * 0.5 && morphology.length > 1) {
    const parentIds = new Set(morphology.map(n => n.parentId).filter(id => id !== undefined));
    const leaves = morphology.filter(n => !parentIds.has(n.id) && n.parentId !== undefined);

    if (leaves.length > 0) {
      const toRemove = leaves[Math.floor(random() * leaves.length)];

      // Remove from morphology
      const idx = morphology.findIndex(n => n.id === toRemove.id);
      if (idx !== -1) morphology.splice(idx, 1);

      // Remove associated Actuator and connections
      const actuatorId = `a${toRemove.id}`;
      genome.brain.nodes = genome.brain.nodes.filter(n => n.id !== actuatorId);
      genome.brain.connections = genome.brain.connections.filter(c => c.source !== actuatorId && c.target !== actuatorId);
    }
  }
};

export const evolvePopulation = (
  currentPop: Individual[],
  generation: number,
  mutationRate: number
): { newPop: Individual[], stats: { max: number, avg: number } } => {

  // 1. Sort by Actual Fitness
  const sortedPop = [...currentPop].sort((a, b) => b.fitness - a.fitness);

  const maxFitness = sortedPop[0].fitness;
  const avgFitness = sortedPop.reduce((sum, i) => sum + i.fitness, 0) / sortedPop.length;

  // 2. Elitism (Keep top 10%)
  const eliteCount = Math.max(2, Math.floor(sortedPop.length * 0.1));
  const elites = sortedPop.slice(0, eliteCount);

  const nextGenElites = elites.map(ind => ({
    ...ind,
    fitness: 0,
    generation: generation + 1
  }));

  const newPop: Individual[] = [...nextGenElites];

  // 3. Reproduction
  while (newPop.length < currentPop.length) {
    // Tournament Selection
    const parent1 = sortedPop[Math.floor(random() * (sortedPop.length / 2))];
    const parent2 = sortedPop[Math.floor(random() * (sortedPop.length / 2))];

    // Clone Parent 1 (Simplified Crossover)
    const offspringGenome = JSON.parse(JSON.stringify(parent1.genome));

    // Mutate
    mutateGenome(offspringGenome, mutationRate);

    const offspring: Individual = {
      id: `g${generation + 1}-i${newPop.length}-${Math.floor(random() * 10000).toString(16)}`,
      generation: generation + 1,
      fitness: 0,
      speciesId: parent1.speciesId,
      isAlive: true,
      genome: offspringGenome
    };

    newPop.push(offspring);
  }

  return { newPop, stats: { max: maxFitness, avg: avgFitness } };
};
