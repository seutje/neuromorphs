import RAPIER from '@dimforge/rapier3d-compat';
import { Individual, BlockNode, JointType, NodeType, Genome, NeuralConnection, SceneType, SceneConfig } from './types';

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

type Vec3 = { x: number; y: number; z: number };
type Quat = { x: number; y: number; z: number; w: number };

// --- Scene Configs ---
const SCENE_CONFIGS: Record<SceneType, SceneConfig> = {
    [SceneType.EARTH]: {
        gravity: { x: 0.0, y: -9.81, z: 0.0 },
        friction: 1.0,
        density: 2.0,
        drag: 0.5,
        angularDrag: 1.0,
        groundColor: '#0f172a',
        skyColor: '#020617'
    },
    [SceneType.MOON]: {
        gravity: { x: 0.0, y: -1.62, z: 0.0 },
        friction: 0.8,
        density: 2.0,
        drag: 0.1,
        angularDrag: 0.2,
        groundColor: '#e2e8f0',
        skyColor: '#000000'
    },
    [SceneType.JUPITER]: {
        gravity: { x: 0.0, y: -24.79, z: 0.0 },
        friction: 1.2,
        density: 3.0,
        drag: 2.0,
        angularDrag: 3.0,
        groundColor: '#7c2d12',
        skyColor: '#451a03'
    },
    [SceneType.WATER]: {
        gravity: { x: 0.0, y: -1.0, z: 0.0 }, // Effective gravity (buoyancy offset)
        friction: 0.5,
        density: 1.0,
        drag: 5.0,
        angularDrag: 5.0,
        groundColor: '#0891b2',
        skyColor: '#0e7490'
    }
};

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
let currentScene: SceneType = SceneType.EARTH;

// --- Helpers ---

const degToRad = (deg: number) => deg * (Math.PI / 180);

const eulerToQuat = (rotation?: [number, number, number]): Quat => {
    const [xDeg, yDeg, zDeg] = rotation || [0, 0, 0];
    const x = degToRad(xDeg) / 2;
    const y = degToRad(yDeg) / 2;
    const z = degToRad(zDeg) / 2;

    const sinX = Math.sin(x), cosX = Math.cos(x);
    const sinY = Math.sin(y), cosY = Math.cos(y);
    const sinZ = Math.sin(z), cosZ = Math.cos(z);

    return {
        x: sinX * cosY * cosZ - cosX * sinY * sinZ,
        y: cosX * sinY * cosZ + sinX * cosY * sinZ,
        z: cosX * cosY * sinZ - sinX * sinY * cosZ,
        w: cosX * cosY * cosZ + sinX * sinY * sinZ
    };
};

const quatMultiply = (a: Quat, b: Quat): Quat => ({
    w: a.w * b.w - a.x * b.x - a.y * b.y - a.z * b.z,
    x: a.w * b.x + a.x * b.w + a.y * b.z - a.z * b.y,
    y: a.w * b.y - a.x * b.z + a.y * b.w + a.z * b.x,
    z: a.w * b.z + a.x * b.y - a.y * b.x + a.z * b.w
});

const quatConjugate = (q: Quat): Quat => ({ w: q.w, x: -q.x, y: -q.y, z: -q.z });

const quatInvert = (q: Quat): Quat => {
    const norm = q.w * q.w + q.x * q.x + q.y * q.y + q.z * q.z;
    if (norm === 0) return { w: 1, x: 0, y: 0, z: 0 };
    const inv = 1 / norm;
    const c = quatConjugate(q);
    return { w: c.w * inv, x: c.x * inv, y: c.y * inv, z: c.z * inv };
};

const rotateVecByQuat = (v: Vec3, q: Quat): Vec3 => {
    const u = { x: q.x, y: q.y, z: q.z };
    const s = q.w;

    const cross = (a: Vec3, b: Vec3): Vec3 => ({
        x: a.y * b.z - a.z * b.y,
        y: a.z * b.x - a.x * b.z,
        z: a.x * b.y - a.y * b.x
    });

    const uCrossV = cross(u, v);
    const uCrossUCrossV = cross(u, uCrossV);

    return {
        x: v.x + 2 * (s * uCrossV.x + uCrossUCrossV.x),
        y: v.y + 2 * (s * uCrossV.y + uCrossUCrossV.y),
        z: v.z + 2 * (s * uCrossV.z + uCrossUCrossV.z)
    };
};

const addVec = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z });
const subVec = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
const scaleVec = (v: Vec3, s: number): Vec3 => ({ x: v.x * s, y: v.y * s, z: v.z * s });

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

        case 'SET_CONFIG':
            if (payload.scene && payload.scene !== currentScene) {
                currentScene = payload.scene;
                // If we have a population, we might need to re-setup world or just update gravity
                // For simplicity, let's just update gravity if world exists, but full re-setup is safer for friction/drag changes
                // However, re-setup kills state. Ideally we update parameters live or restart.
                // The user usually changes settings then restarts.
                // Let's just update gravity for now if world exists, but friction/drag requires body iteration.
                if (world) {
                    const config = SCENE_CONFIGS[currentScene];
                    world.gravity = config.gravity;

                    // Update all bodies
                    physObjects.forEach(obj => {
                        if (obj.body.isValid()) {
                            obj.body.setLinearDamping(config.drag);
                            obj.body.setAngularDamping(config.angularDrag);
                        }
                    });
                }
            }
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

    const sceneConfig = SCENE_CONFIGS[currentScene];
    world = new RAPIER.World(sceneConfig.gravity);

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
        const nodeMap = new Map<number, BlockNode>();

        nodes.forEach(node => nodeMap.set(node.id, node));

        const parentToChildren = new Map<number, BlockNode[]>();
        nodes.forEach(b => {
            if (b.parentId !== undefined) {
                const list = parentToChildren.get(b.parentId) || [];
                list.push(b);
                parentToChildren.set(b.parentId, list);
            }
        });

        const transforms = new Map<number, { pos: Vec3; rot: Quat }>();
        const pivotPositions = new Map<number, Vec3>();
        const queue: number[] = [];

        // Roots start at spawn position with their own rotation
        nodes.forEach(b => {
            if (b.parentId === undefined) {
                transforms.set(b.id, { pos: { ...startPos }, rot: eulerToQuat(b.rotation) });
                queue.push(b.id);
            }
        });

        // BFS Traversal to calculate positions
        while (queue.length > 0) {
            const parentId = queue.shift()!;
            const parentTransform = transforms.get(parentId)!;
            const parentBlock = nodeMap.get(parentId)!;
            const children = parentToChildren.get(parentId) || [];

            children.forEach(child => {
                const siblings = children; // All children of this parent are siblings
                const faceGroup = siblings.filter(s => s.attachFace === child.attachFace);
                const indexInFace = faceGroup.findIndex(s => s.id === child.id);
                const countInFace = faceGroup.length;

                const face = child.attachFace;
                const axisIdx = Math.floor(face / 2);
                const dir = face % 2 === 0 ? 1 : -1;

                const parentHalf = parentBlock.size[axisIdx] / 2;
                const childHalf = child.size[axisIdx] / 2;

                let spreadOffset = 0;
                let spreadAxisLocal: Vec3 = { x: 0, y: 0, z: 0 };

                // Determine tangential axes for offsets (local to parent)
                let uAxisLocal: Vec3 = { x: 0, y: 0, z: 0 };
                let vAxisLocal: Vec3 = { x: 0, y: 0, z: 0 };
                if (axisIdx === 0) { uAxisLocal = { x: 0, y: 1, z: 0 }; vAxisLocal = { x: 0, y: 0, z: 1 }; spreadAxisLocal = { x: 0, y: 0, z: 1 }; }
                else if (axisIdx === 1) { uAxisLocal = { x: 1, y: 0, z: 0 }; vAxisLocal = { x: 0, y: 0, z: 1 }; spreadAxisLocal = { x: 1, y: 0, z: 0 }; }
                else { uAxisLocal = { x: 1, y: 0, z: 0 }; vAxisLocal = { x: 0, y: 1, z: 0 }; spreadAxisLocal = { x: 1, y: 0, z: 0 }; }

                if (countInFace > 1) {
                    const parentDim = parentBlock.size[axisIdx === 2 ? 0 : axisIdx === 1 ? 0 : 2];
                    const available = parentDim * 0.8;
                    const t = indexInFace / (countInFace - 1);
                    spreadOffset = (t - 0.5) * available;
                }

                const axisVectorLocal = axisIdx === 0 ? { x: dir, y: 0, z: 0 } : axisIdx === 1 ? { x: 0, y: dir, z: 0 } : { x: 0, y: 0, z: dir };

                // Pivot position relative to parent (local frame)
                let pivotOffsetLocal = scaleVec(axisVectorLocal, parentHalf);
                pivotOffsetLocal = addVec(pivotOffsetLocal, scaleVec(spreadAxisLocal, spreadOffset));

                const pOffset = child.parentOffset || [0, 0];
                pivotOffsetLocal = addVec(pivotOffsetLocal, addVec(scaleVec(uAxisLocal, pOffset[0]), scaleVec(vAxisLocal, pOffset[1])));

                const pivotWorldOffset = rotateVecByQuat(pivotOffsetLocal, parentTransform.rot);
                const pivotPos = addVec(parentTransform.pos, pivotWorldOffset);

                // Child center relative to pivot (local parent frame)
                let childOffsetLocal = scaleVec(axisVectorLocal, childHalf);
                const cOffset = child.childOffset || [0, 0];
                childOffsetLocal = addVec(childOffsetLocal, addVec(scaleVec(uAxisLocal, -cOffset[0]), scaleVec(vAxisLocal, -cOffset[1])));

                const localChildRot = eulerToQuat(child.rotation);
                const rotatedChildOffset = rotateVecByQuat(childOffsetLocal, localChildRot);
                const childOffsetWorld = rotateVecByQuat(rotatedChildOffset, parentTransform.rot);

                const childPos = addVec(pivotPos, childOffsetWorld);
                const childRot = quatMultiply(parentTransform.rot, localChildRot);

                transforms.set(child.id, { pos: childPos, rot: childRot });
                pivotPositions.set(child.id, pivotPos);
                queue.push(child.id);
            });
        }

        // Create Bodies
        nodes.forEach(block => {
            const transform = transforms.get(block.id) || { pos: startPos, rot: { x: 0, y: 0, z: 0, w: 1 } };
            const pos = transform.pos;

            const rigidBodyDesc = RAPIER.RigidBodyDesc.dynamic();
            rigidBodyDesc.setLinearDamping(0.5);
            rigidBodyDesc.setAngularDamping(1.0);
            rigidBodyDesc.setTranslation(pos.x, pos.y, pos.z);

            const body = world!.createRigidBody(rigidBodyDesc);
            body.setRotation(transform.rot, true);

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
            const parentBlock = nodeMap.get(block.parentId);

            if (parentBody && childBody && parentBlock) {
                const pivotPos = pivotPositions.get(block.id);
                const parentTransform = transforms.get(block.parentId)!;
                const childTransform = transforms.get(block.id)!;

                if (!pivotPos) return;

                const anchorParentWorld = subVec(pivotPos, parentTransform.pos);
                const anchorChildWorld = subVec(pivotPos, childTransform.pos);

                const invParentRot = quatInvert(parentTransform.rot);
                const invChildRot = quatInvert(childTransform.rot);

                const a1 = rotateVecByQuat(anchorParentWorld, invParentRot);
                const a2 = rotateVecByQuat(anchorChildWorld, invChildRot);

                const axisWorld = rotateVecByQuat({ x: 0, y: 0, z: 1 }, childTransform.rot);
                const axis = rotateVecByQuat(axisWorld, invParentRot);

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
    // Calculate Physics FPS
    const delta = now - lastTime;
    const physicsFps = delta > 0 ? 1000 / delta : 0;
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
            simTime: simTime,
            physicsFps: physicsFps
        }
    }, { transfer: [data.buffer] });

    // Schedule next loop
    setTimeout(loop, 16);
}
