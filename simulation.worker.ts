import RAPIER from '@dimforge/rapier3d-compat';
import { Individual, BlockNode, JointType, NodeType, Genome, NeuralConnection } from './types';

// --- Types ---

interface PhysObject {
    body: RAPIER.RigidBody;
    id: string; // individual ID
    blockId: number; // specific block ID
}

interface PhysJoint {
    joint: RAPIER.ImpulseJoint;
    motorType: JointType;
    phase: number;
    speed: number;
    amp: number;
    body: RAPIER.RigidBody;
    parentBody: RAPIER.RigidBody;
    blockId: number;
    individualId: string;
}

interface BrainInstance {
    genome: Genome;
    activations: Record<string, number>;
    connectionsByTarget: Map<string, NeuralConnection[]>;
}

// --- State ---

let world: RAPIER.World | null = null;
let physObjects: PhysObject[] = [];
let physJoints: PhysJoint[] = [];
let brainStates: Map<string, BrainInstance> = new Map();
let rootBodies: Map<string, RAPIER.RigidBody> = new Map();
let disqualified: Set<string> = new Set();

let isRunning = false;
let simulationSpeed = 1;
let simTime = 0;
let lastTime = 0;

// --- Helpers ---

const buildBrainInstance = (genome: Genome): BrainInstance => {
    const activations: Record<string, number> = {};
    const connectionsByTarget = new Map<string, NeuralConnection[]>();

    genome.brain.nodes.forEach(node => {
        activations[node.id] = node.activation || 0;
    });

    genome.brain.connections.forEach(conn => {
        const list = connectionsByTarget.get(conn.target) || [];
        list.push(conn);
        connectionsByTarget.set(conn.target, list);
    });

    return { genome, activations, connectionsByTarget };
};

const updateBrainActivations = (time: number, jointsByCreature: Map<string, PhysJoint[]>) => {
    jointsByCreature.forEach((joints, creatureId) => {
        const brain = brainStates.get(creatureId);
        const rootBody = rootBodies.get(creatureId);

        if (!brain || !rootBody || !rootBody.isValid()) return;

        const linvel = rootBody.linvel();
        const translation = rootBody.translation();

        const groundSensor = translation.y < 0.55 ? 1 : -1;
        const velocitySensor = Math.tanh(linvel.x / 5);
        const motionSensor = joints.length > 0
            ? Math.tanh((Math.abs(joints[0].body.angvel().x) + Math.abs(joints[0].body.angvel().y) + Math.abs(joints[0].body.angvel().z)) / 6)
            : 0;

        const newActivations: Record<string, number> = {};
        const previousActivations = brain.activations;

        brain.genome.brain.nodes.forEach(node => {
            switch (node.type) {
                case NodeType.SENSOR: {
                    if (node.id === 's1') newActivations[node.id] = groundSensor;
                    else if (node.id === 's2') newActivations[node.id] = motionSensor;
                    else if (node.id === 's3') newActivations[node.id] = velocitySensor;
                    else newActivations[node.id] = 0;
                    break;
                }
                case NodeType.OSCILLATOR: {
                    newActivations[node.id] = Math.sin(time * 2 + node.y * 10);
                    break;
                }
                default: {
                    const inputs = brain.connectionsByTarget.get(node.id) || [];
                    const sum = inputs.reduce((acc, conn) => acc + (previousActivations[conn.source] ?? 0) * conn.weight, 0);
                    newActivations[node.id] = Math.tanh(sum);
                    break;
                }
            }
        });

        brain.activations = newActivations;
    });
};

// --- Message Handlers ---

self.onmessage = async (e) => {
    const { type, payload } = e.data;

    switch (type) {
        case 'INIT':
            await RAPIER.init();
            postMessage({ type: 'READY' });
            break;

        case 'SET_POPULATION':
            setupWorld(payload.population);
            break;

        case 'START':
            isRunning = true;
            lastTime = performance.now();
            loop();
            break;

        case 'STOP':
            isRunning = false;
            break;

        case 'UPDATE_SPEED':
            simulationSpeed = payload;
            break;
    }
};

function setupWorld(population: Individual[]) {
    // Reset State
    simTime = 0;
    disqualified.clear();
    physObjects = [];
    physJoints = [];
    brainStates.clear();
    rootBodies.clear();

    if (world) {
        world.free();
        world = null;
    }

    const gravity = { x: 0.0, y: -9.81, z: 0.0 };
    world = new RAPIER.World(gravity);

    // Ground
    const laneWidth = 3.0;
    const trackLength = 2000;
    const requiredDepth = Math.max(1000, population.length * laneWidth * 1.2);
    const groundHalfDepth = requiredDepth / 2.0;

    const GROUP_GROUND = 0x0001;
    const GROUP_CREATURE = 0x0002;
    const groundCollisionGroups = (GROUP_GROUND << 16) | GROUP_CREATURE;
    const creatureCollisionGroups = (GROUP_CREATURE << 16) | GROUP_GROUND;

    const groundColliderDesc = RAPIER.ColliderDesc.cuboid(trackLength / 2.0, 5.0, groundHalfDepth);
    groundColliderDesc.setTranslation(0.0, -5.0, 0.0);
    groundColliderDesc.setCollisionGroups(groundCollisionGroups);
    world.createCollider(groundColliderDesc);

    // Population
    population.forEach((ind, index) => {
        let zPos = 0;
        if (index > 0) {
            const offset = Math.ceil(index / 2) * laneWidth;
            zPos = (index % 2 === 0) ? offset : -offset;
        }

        const startPos = { x: 0, y: 4, z: zPos };
        const bodyMap = new Map<number, RAPIER.RigidBody>();
        const nodes = ind.genome.morphology;

        const parentToChildren = new Map<number, BlockNode[]>();
        nodes.forEach(b => {
            if (b.parentId !== undefined) {
                const list = parentToChildren.get(b.parentId) || [];
                list.push(b);
                parentToChildren.set(b.parentId, list);
            }
        });

        // Create Bodies
        nodes.forEach(block => {
            const rigidBodyDesc = RAPIER.RigidBodyDesc.dynamic();
            rigidBodyDesc.setLinearDamping(0.5);
            rigidBodyDesc.setAngularDamping(1.0);
            rigidBodyDesc.setTranslation(
                startPos.x + (block.parentId !== undefined ? 1 : 0) * (block.id * 0.5),
                startPos.y + block.id * 0.2,
                startPos.z
            );

            const body = world!.createRigidBody(rigidBodyDesc);

            const colliderDesc = RAPIER.ColliderDesc.cuboid(
                (block.size[0] / 2) * 0.95,
                (block.size[1] / 2) * 0.95,
                (block.size[2] / 2) * 0.95
            );
            colliderDesc.setFriction(1.0);
            colliderDesc.setRestitution(0.0);
            colliderDesc.setDensity(2.0);
            colliderDesc.setCollisionGroups(creatureCollisionGroups);

            world!.createCollider(colliderDesc, body);

            bodyMap.set(block.id, body);
            if (block.parentId === undefined) {
                rootBodies.set(ind.id, body);
            }

            physObjects.push({ body, id: ind.id, blockId: block.id });
        });

        // Create Joints
        nodes.forEach(block => {
            if (block.parentId === undefined) return;

            const parentBody = bodyMap.get(block.parentId);
            const childBody = bodyMap.get(block.id);
            const parentBlock = nodes.find(n => n.id === block.parentId);

            if (parentBody && childBody && parentBlock) {
                const siblings = parentToChildren.get(block.parentId) || [];
                const faceGroup = siblings.filter(s => s.attachFace === block.attachFace);
                const indexInFace = faceGroup.findIndex(s => s.id === block.id);
                const countInFace = faceGroup.length;

                const face = block.attachFace;
                const axisIdx = Math.floor(face / 2);
                const dir = face % 2 === 0 ? 1 : -1;

                const parentHalf = parentBlock.size[axisIdx] / 2;
                const childHalf = block.size[axisIdx] / 2;

                let spreadOffset = 0;
                let spreadAxis = 0;

                if (axisIdx === 0) spreadAxis = 2;
                else if (axisIdx === 1) spreadAxis = 0;
                else spreadAxis = 0;

                if (countInFace > 1) {
                    const parentDim = parentBlock.size[spreadAxis];
                    const available = parentDim * 0.8;
                    const t = indexInFace / (countInFace - 1);
                    spreadOffset = (t - 0.5) * available;
                }

                let a1 = { x: 0, y: 0, z: 0 };
                if (axisIdx === 0) a1.x = parentHalf * dir;
                if (axisIdx === 1) a1.y = parentHalf * dir;
                if (axisIdx === 2) a1.z = parentHalf * dir;

                if (spreadAxis === 0) a1.x += spreadOffset;
                if (spreadAxis === 1) a1.y += spreadOffset;
                if (spreadAxis === 2) a1.z += spreadOffset;

                let a2 = { x: 0, y: 0, z: 0 };
                if (axisIdx === 0) a2.x = -childHalf * dir;
                if (axisIdx === 1) a2.y = -childHalf * dir;
                if (axisIdx === 2) a2.z = -childHalf * dir;

                let axis;
                if (block.jointType === JointType.SPHERICAL) {
                    axis = { x: 0, y: 1, z: 0 };
                } else {
                    axis = { x: 0, y: 0, z: 1 };
                }

                const jointData = RAPIER.JointData.revolute(a1, a2, axis);
                jointData.limitsEnabled = true;
                jointData.limits = [-Math.PI / 1.5, Math.PI / 1.5];

                const joint = world!.createImpulseJoint(jointData, parentBody, childBody, true);
                (joint as any).configureMotorModel(RAPIER.MotorModel.ForceBased);

                const params = block.jointParams || { speed: 5, phase: block.id * 0.5, amp: 1.0 };

                physJoints.push({
                    joint,
                    motorType: block.jointType || JointType.REVOLUTE,
                    phase: params.phase,
                    speed: params.speed,
                    amp: params.amp,
                    body: childBody,
                    parentBody: parentBody,
                    blockId: block.id,
                    individualId: ind.id
                });
            }
        });

        brainStates.set(ind.id, buildBrainInstance(ind.genome));
    });
}

function loop() {
    if (!isRunning) return;

    if (!world) {
        setTimeout(loop, 50); // Wait for world init
        return;
    }

    const now = performance.now();
    // const dt = (now - lastTime) / 1000; // Not used for fixed step, but could be used for throttling
    lastTime = now;

    const fixedTimeStep = 1 / 60;
    world.timestep = fixedTimeStep;

    const steps = Math.min(5, Math.ceil(simulationSpeed));
    const jointsByCreature = new Map<string, PhysJoint[]>();
    physJoints.forEach(pj => {
        const list = jointsByCreature.get(pj.individualId) || [];
        list.push(pj);
        jointsByCreature.set(pj.individualId, list);
    });

    for (let i = 0; i < steps; i++) {
        simTime += fixedTimeStep;
        const t = simTime;

        updateBrainActivations(t, jointsByCreature);

        physJoints.forEach(pj => {
            if (!pj.body.isValid() || !pj.parentBody.isValid()) return;

            const brain = brainStates.get(pj.individualId);
            const activation = brain?.activations[`a${pj.blockId}`];
            const targetPos = activation !== undefined
                ? activation * pj.amp
                : Math.sin(t * pj.speed + pj.phase) * pj.amp;

            const stiffness = 200.0;
            const damping = 20.0;

            (pj.joint as any).configureMotorPosition(targetPos, stiffness, damping);
        });

        try {
            world.step();
        } catch (e) {
            console.error("Physics Panic:", e);
        }
    }

    // --- Send Updates ---
    const VELOCITY_THRESHOLD = 50.0;
    const fitnessUpdate: Record<string, number> = {};

    // We need to send back position and rotation for every object
    // Format: [id_index, x, y, z, qx, qy, qz, qw, ... ]
    // To optimize, we can map object index to array index.
    // Since physObjects is stable (unless population changes), we can just send an array of floats.
    // [x, y, z, qx, qy, qz, qw] per object.

    const data = new Float32Array(physObjects.length * 7);

    physObjects.forEach((obj, i) => {
        if (!obj.body.isValid()) return;

        // Check disqualification
        if (disqualified.has(obj.id)) {
            // Mark as hidden/invalid in data? 
            // We can just send 0, -1000, 0 to hide it effectively or use a flag.
            // Let's just send the current position (which should be underground if disqualified)
        }

        const linvel = obj.body.linvel();
        const velMag = Math.sqrt(linvel.x ** 2 + linvel.y ** 2 + linvel.z ** 2);

        if (velMag > VELOCITY_THRESHOLD && !disqualified.has(obj.id)) {
            disqualified.add(obj.id);
            obj.body.setTranslation({ x: 0, y: -100, z: 0 }, true);
            obj.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
            obj.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
            obj.body.sleep();
            if (obj.blockId === 0) fitnessUpdate[obj.id] = -10000;
        }

        const t = obj.body.translation();
        const r = obj.body.rotation();

        // Respawn check
        if (t.y < -20 && !disqualified.has(obj.id)) {
            obj.body.setTranslation({ x: 0, y: 5, z: 0 }, true);
            obj.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
            obj.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
        }

        if (obj.blockId === 0 && !disqualified.has(obj.id)) {
            fitnessUpdate[obj.id] = t.x;
        }

        const offset = i * 7;
        data[offset] = t.x;
        data[offset + 1] = t.y;
        data[offset + 2] = t.z;
        data[offset + 3] = r.x;
        data[offset + 4] = r.y;
        data[offset + 5] = r.z;
        data[offset + 6] = r.w;
    });

    postMessage({
        type: 'UPDATE',
        payload: {
            transforms: data,
            fitness: fitnessUpdate,
            simTime: simTime
        }
    }, { transfer: [data.buffer] });

    // Schedule next loop
    setTimeout(loop, 16);
}
