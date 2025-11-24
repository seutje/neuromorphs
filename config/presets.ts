import { Genome, NodeType } from '../types';
import simpleWorm from '../presets/simple_worm.json';
import quadruped from '../presets/quadruped.json';
import biped from '../presets/biped.json';
import star from '../presets/star.json';
import crawler from '../presets/crawler.json';

const BASIC_SENSORS = [
    { id: 's1', type: NodeType.SENSOR, label: 'Gnd Contact', activation: 0, x: 0.1, y: 0.2 },
    { id: 's2', type: NodeType.SENSOR, label: 'Joint Angle', activation: 0, x: 0.1, y: 0.5 },
    { id: 's3', type: NodeType.SENSOR, label: 'Velocity', activation: 0, x: 0.1, y: 0.8 },
    { id: 'o1', type: NodeType.OSCILLATOR, label: 'Clock', activation: 0, x: 0.1, y: 0.35 }
];

export const PRESETS: { name: string; genome: Genome }[] = [
    { name: 'Simple Worm', genome: simpleWorm as Genome },
    { name: 'Quadruped', genome: quadruped as Genome },
    { name: 'Biped', genome: biped as Genome },
    { name: 'Star', genome: star as Genome },
    { name: 'Crawler', genome: crawler as Genome }
];
