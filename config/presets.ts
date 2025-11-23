import { Genome, JointType, NodeType } from '../types';

const BASIC_SENSORS = [
    { id: 's1', type: NodeType.SENSOR, label: 'Gnd Contact', activation: 0, x: 0.1, y: 0.2 },
    { id: 's2', type: NodeType.SENSOR, label: 'Joint Angle', activation: 0, x: 0.1, y: 0.5 },
    { id: 's3', type: NodeType.SENSOR, label: 'Velocity', activation: 0, x: 0.1, y: 0.8 },
    { id: 'o1', type: NodeType.OSCILLATOR, label: 'Clock', activation: 0, x: 0.1, y: 0.35 }
];

export const PRESETS: { name: string; genome: Genome }[] = [
    {
        name: 'Simple Worm',
        genome: {
            morphology: [
                { id: 0, size: [0.5, 0.5, 0.5], color: '#ef4444', attachFace: 0, jointParams: { speed: 0, phase: 0, amp: 0 } },
                { id: 1, size: [0.5, 0.5, 0.5], color: '#ef4444', parentId: 0, attachFace: 0, jointType: JointType.REVOLUTE, jointParams: { speed: 5, phase: 0, amp: 1 } },
                { id: 2, size: [0.5, 0.5, 0.5], color: '#ef4444', parentId: 1, attachFace: 0, jointType: JointType.REVOLUTE, jointParams: { speed: 5, phase: 0, amp: 1 } }
            ],
            brain: {
                nodes: [
                    ...BASIC_SENSORS,
                    { id: 'a1', type: NodeType.ACTUATOR, label: 'Joint 1', activation: 0, x: 0.9, y: 0.3 },
                    { id: 'a2', type: NodeType.ACTUATOR, label: 'Joint 2', activation: 0, x: 0.9, y: 0.6 }
                ],
                connections: [
                    { source: 'o1', target: 'a1', weight: 1 },
                    { source: 'o1', target: 'a2', weight: -1 }
                ]
            }
        }
    },
    {
        name: 'Quadruped',
        genome: {
            morphology: [
                { id: 0, size: [1, 0.5, 1.5], color: '#3b82f6', attachFace: 0, jointParams: { speed: 0, phase: 0, amp: 0 } },
                // Legs
                { id: 1, size: [0.25, 1, 0.25], color: '#3b82f6', parentId: 0, attachFace: 3, parentOffset: [0.1, 0.5], jointType: JointType.REVOLUTE, jointParams: { speed: 5, phase: 0, amp: 1 } }, // Front Left
                { id: 2, size: [0.25, 1, 0.25], color: '#3b82f6', parentId: 0, attachFace: 3, parentOffset: [0.5, 0.5], jointType: JointType.REVOLUTE, jointParams: { speed: 5, phase: 3.14, amp: 1 } }, // Front Right
                { id: 3, size: [0.25, 1, 0.25], color: '#3b82f6', parentId: 0, attachFace: 3, parentOffset: [-0.5, -0.5], jointType: JointType.REVOLUTE, jointParams: { speed: 5, phase: 3.14, amp: 1 } }, // Back Left
                { id: 4, size: [0.25, 1, 0.25], color: '#3b82f6', parentId: 0, attachFace: 3, parentOffset: [0, -0.5], jointType: JointType.REVOLUTE, jointParams: { speed: 5, phase: 0, amp: 1 } }  // Back Right
            ],
            brain: {
                nodes: [
                    ...BASIC_SENSORS,
                    { id: 'a1', type: NodeType.ACTUATOR, label: 'Joint 1', activation: 0, x: 0.9, y: 0.2 },
                    { id: 'a2', type: NodeType.ACTUATOR, label: 'Joint 2', activation: 0, x: 0.9, y: 0.4 },
                    { id: 'a3', type: NodeType.ACTUATOR, label: 'Joint 3', activation: 0, x: 0.9, y: 0.6 },
                    { id: 'a4', type: NodeType.ACTUATOR, label: 'Joint 4', activation: 0, x: 0.9, y: 0.8 }
                ],
                connections: [
                    { source: 'o1', target: 'a1', weight: 1 },
                    { source: 'o1', target: 'a2', weight: -1 },
                    { source: 'o1', target: 'a3', weight: -1 },
                    { source: 'o1', target: 'a4', weight: 1 }
                ]
            }
        }
    },
    {
        name: 'Biped',
        genome: {
            morphology: [
                { id: 0, size: [0.75, 1, 0.5], color: '#eab308', attachFace: 0, jointParams: { speed: 0, phase: 0, amp: 0 } },
                { id: 1, size: [0.25, 1, 0.25], color: '#eab308', parentId: 0, attachFace: 3, parentOffset: [0, 0], jointType: JointType.REVOLUTE, jointParams: { speed: 3, phase: 0, amp: 0.8 } },
                { id: 2, size: [0.25, 1, 0.25], color: '#eab308', parentId: 0, attachFace: 3, parentOffset: [0, 0], jointType: JointType.REVOLUTE, jointParams: { speed: 3, phase: 3.14, amp: 0.8 } }
            ],
            brain: {
                nodes: [
                    ...BASIC_SENSORS,
                    { id: 'a1', type: NodeType.ACTUATOR, label: 'Joint 1', activation: 0, x: 0.9, y: 0.3 },
                    { id: 'a2', type: NodeType.ACTUATOR, label: 'Joint 2', activation: 0, x: 0.9, y: 0.7 }
                ],
                connections: [
                    { source: 'o1', target: 'a1', weight: 1 },
                    { source: 'o1', target: 'a2', weight: -1 }
                ]
            }
        }
    },
    {
        name: 'Star',
        genome: {
            morphology: [
                { id: 0, size: [0.5, 0.5, 0.5], color: '#a855f7', attachFace: 0, jointParams: { speed: 0, phase: 0, amp: 0 } },
                { id: 1, size: [1, 0.25, 0.25], color: '#a855f7', parentId: 0, attachFace: 0, jointType: JointType.REVOLUTE, jointParams: { speed: 2, phase: 0, amp: 0.5 } },
                { id: 2, size: [1, 0.25, 0.25], color: '#a855f7', parentId: 0, attachFace: 1, jointType: JointType.REVOLUTE, jointParams: { speed: 2, phase: 1, amp: 0.5 } },
                { id: 3, size: [0.25, 1, 0.25], color: '#a855f7', parentId: 0, attachFace: 2, jointType: JointType.REVOLUTE, jointParams: { speed: 2, phase: 2, amp: 0.5 } },
                { id: 4, size: [0.25, 1, 0.25], color: '#a855f7', parentId: 0, attachFace: 3, jointType: JointType.REVOLUTE, jointParams: { speed: 2, phase: 3, amp: 0.5 } },
                { id: 5, size: [0.25, 0.25, 1], color: '#a855f7', parentId: 0, attachFace: 4, jointType: JointType.REVOLUTE, jointParams: { speed: 2, phase: 4, amp: 0.5 } },
                { id: 6, size: [0.25, 0.25, 1], color: '#a855f7', parentId: 0, attachFace: 5, jointType: JointType.REVOLUTE, jointParams: { speed: 2, phase: 5, amp: 0.5 } }
            ],
            brain: {
                nodes: [
                    ...BASIC_SENSORS,
                    { id: 'a1', type: NodeType.ACTUATOR, label: 'Joint 1', activation: 0, x: 0.9, y: 0.15 },
                    { id: 'a2', type: NodeType.ACTUATOR, label: 'Joint 2', activation: 0, x: 0.9, y: 0.3 },
                    { id: 'a3', type: NodeType.ACTUATOR, label: 'Joint 3', activation: 0, x: 0.9, y: 0.45 },
                    { id: 'a4', type: NodeType.ACTUATOR, label: 'Joint 4', activation: 0, x: 0.9, y: 0.6 },
                    { id: 'a5', type: NodeType.ACTUATOR, label: 'Joint 5', activation: 0, x: 0.9, y: 0.75 },
                    { id: 'a6', type: NodeType.ACTUATOR, label: 'Joint 6', activation: 0, x: 0.9, y: 0.9 }
                ],
                connections: [
                    { source: 'o1', target: 'a1', weight: 1 },
                    { source: 'o1', target: 'a2', weight: -1 },
                    { source: 'o1', target: 'a3', weight: 1 },
                    { source: 'o1', target: 'a4', weight: -1 },
                    { source: 'o1', target: 'a5', weight: 1 },
                    { source: 'o1', target: 'a6', weight: -1 }
                ]
            }
        }
    },
    {
        name: 'Crawler',
        genome: {
            morphology: [
                { id: 0, size: [1, 0.25, 1], color: '#22c55e', attachFace: 0, jointParams: { speed: 0, phase: 0, amp: 0 } },
                { id: 1, size: [0.75, 0.25, 0.75], color: '#22c55e', parentId: 0, attachFace: 0, jointType: JointType.REVOLUTE, jointParams: { speed: 4, phase: 0, amp: 0.5 } },
                { id: 2, size: [0.5, 0.25, 0.5], color: '#22c55e', parentId: 1, attachFace: 0, jointType: JointType.REVOLUTE, jointParams: { speed: 4, phase: 1, amp: 0.5 } },
                { id: 3, size: [0.25, 0.25, 0.25], color: '#22c55e', parentId: 2, attachFace: 0, jointType: JointType.REVOLUTE, jointParams: { speed: 4, phase: 2, amp: 0.5 } }
            ],
            brain: {
                nodes: [
                    ...BASIC_SENSORS,
                    { id: 'a1', type: NodeType.ACTUATOR, label: 'Joint 1', activation: 0, x: 0.9, y: 0.3 },
                    { id: 'a2', type: NodeType.ACTUATOR, label: 'Joint 2', activation: 0, x: 0.9, y: 0.5 },
                    { id: 'a3', type: NodeType.ACTUATOR, label: 'Joint 3', activation: 0, x: 0.9, y: 0.7 }
                ],
                connections: [
                    { source: 'o1', target: 'a1', weight: 1 },
                    { source: 'o1', target: 'a2', weight: 1 },
                    { source: 'o1', target: 'a3', weight: 1 }
                ]
            }
        }
    }
];
