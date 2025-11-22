
import { Individual, Genome, BlockNode, NeuralNode, NeuralConnection, NodeType, JointType } from '../types';

/**
 * Since we cannot implement a full WASM Rapier physics engine + Three.js in a single file response,
 * This service mimics the data structures and evolutionary progress for the UI.
 */

const COLORS = ['#10b981', '#3b82f6', '#8b5cf6', '#f43f5e', '#f59e0b', '#06b6d4'];

const generateRandomMorphology = (nodeCount: number): BlockNode[] => {
  const nodes: BlockNode[] = [];
  for (let i = 0; i < nodeCount; i++) {
    nodes.push({
      id: i,
      size: [0.5 + Math.random(), 0.2 + Math.random() * 0.5, 0.2 + Math.random() * 0.5],
      color: COLORS[i % COLORS.length],
      parentId: i === 0 ? undefined : Math.floor(Math.random() * i), // Connect to a previous node
      jointType: Math.random() > 0.5 ? JointType.REVOLUTE : JointType.SPHERICAL,
      jointParams: {
        speed: 2 + Math.random() * 4,
        phase: Math.random() * Math.PI * 2,
        amp: 0.5 + Math.random() * 0.5
      },
      attachFace: Math.floor(Math.random() * 6)
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
  const hiddenCount = 3 + Math.floor(Math.random() * 3);
  for (let i = 0; i < hiddenCount; i++) {
    nodes.push({
      id: `h${i}`,
      type: NodeType.NEURON,
      label: `N${i}`,
      activation: 0,
      x: 0.4 + (Math.random() * 0.2),
      y: 0.2 + (Math.random() * 0.6)
    });
  }

  // Actuators (Output Layer - usually one per joint)
  // If we have N blocks, we have N-1 joints approx
  const actuatorCount = Math.max(1, morphNodes - 1);
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
    const source = nodes[Math.floor(Math.random() * nodes.length)];
    const target = nodes[Math.floor(Math.random() * nodes.length)];
    
    // Avoid self-loops or actuator->sensor connections for simplicity in this visualization
    if (source.type !== NodeType.ACTUATOR && target.type !== NodeType.SENSOR && source.id !== target.id) {
      connections.push({
        source: source.id,
        target: target.id,
        weight: (Math.random() * 2) - 1
      });
    }
  }

  return { nodes, connections };
};

export const generateIndividual = (generation: number, index: number): Individual => {
  const nodeCount = 3 + Math.floor(Math.random() * 5); // 3 to 7 blocks
  return {
    id: `g${generation}-i${index}-${Math.random().toString(36).substr(2, 5)}`,
    generation,
    fitness: 0, // Calculated later
    speciesId: Math.floor(Math.random() * 4),
    isAlive: true,
    genome: {
      morphology: generateRandomMorphology(nodeCount),
      brain: generateRandomBrain(nodeCount)
    }
  };
};

export const evolvePopulation = (
  currentPop: Individual[], 
  generation: number, 
  mutationRate: number
): { newPop: Individual[], stats: { max: number, avg: number } } => {
  
  // 1. Evaluate Fitness (Simulated)
  // In a real app, this would come from the WASM engine results
  const scoredPop = currentPop.map(ind => {
    // Simulate improvement over generations
    const basePerformance = Math.random() * 10;
    const generationalBonus = generation * 0.5; 
    // Random "breakthrough"
    const mutationLuck = Math.random() > 0.9 ? 5 : 0; 
    
    return {
      ...ind,
      fitness: basePerformance + generationalBonus + mutationLuck
    };
  }).sort((a, b) => b.fitness - a.fitness);

  const maxFitness = scoredPop[0].fitness;
  const avgFitness = scoredPop.reduce((sum, i) => sum + i.fitness, 0) / scoredPop.length;

  // 2. Selection (Elitism + Tournament)
  const eliteCount = Math.max(2, Math.floor(currentPop.length * 0.1));
  const elites = scoredPop.slice(0, eliteCount);

  // 3. Crossover & Mutation (Simplified)
  const newPop: Individual[] = [...elites];

  while (newPop.length < currentPop.length) {
    const parentA = scoredPop[Math.floor(Math.random() * (scoredPop.length / 2))]; // Pick from top 50%
    
    // Create offspring (clone + mutate for this mock)
    const offspring = generateIndividual(generation + 1, newPop.length);
    
    // Inherit some traits roughly (simulated by just keeping fitness range similar + variation)
    offspring.fitness = parentA.fitness + ((Math.random() * 4) - 2); 
    
    newPop.push(offspring);
  }

  return { newPop, stats: { max: maxFitness, avg: avgFitness } };
};
