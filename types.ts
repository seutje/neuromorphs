
// Morphology Definitions
export enum JointType {
  REVOLUTE = 'REVOLUTE',
  SPHERICAL = 'SPHERICAL'
}

export interface BlockNode {
  id: number;
  size: [number, number, number]; // [x, y, z]
  color: string;
  parentId?: number; // Root has no parent
  jointType?: JointType;
  jointParams: {
    speed: number;
    phase: number;
    amp: number;
  };
  attachFace: number; // 0..5: +x, -x, +y, -y, +z, -z
  parentOffset?: [number, number]; // Offset on parent face [u, v]
  childOffset?: [number, number]; // Offset on child face [u, v]
}

// Neural Network Definitions
export enum NodeType {
  SENSOR = 'SENSOR',
  NEURON = 'NEURON',
  ACTUATOR = 'ACTUATOR',
  OSCILLATOR = 'OSCILLATOR'
}

export interface NeuralNode {
  id: string;
  type: NodeType;
  label: string;
  activation: number; // -1 to 1
  x: number; // For visualization layout
  y: number;
}

export interface NeuralConnection {
  source: string;
  target: string;
  weight: number;
}

// Evolution Definitions
export interface Genome {
  morphology: BlockNode[];
  brain: {
    nodes: NeuralNode[];
    connections: NeuralConnection[];
  };
}

export interface Individual {
  id: string;
  generation: number;
  genome: Genome;
  fitness: number;
  speciesId: number;
  isAlive: boolean;
}

export interface GenerationStats {
  generation: number;
  maxFitness: number;
  avgFitness: number;
  speciesCount: number;
}

export interface SimulationConfig {
  populationSize: number;
  mutationRate: number;
  simulationSpeed: number;
  epochDuration: number; // Seconds
  task: 'LOCOMOTION' | 'JUMP' | 'SWIM';
  seed: number;
}
