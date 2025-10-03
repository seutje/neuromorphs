import { loadRapier } from './rapierLoader.js';
import { createSimulationWorld } from './simulation/world.js';
import { instantiateCreature } from './simulation/instantiateCreature.js';
import { gatherSensorSnapshot } from './simulation/sensors.js';
import { applyControllerCommands } from './simulation/controllerCommands.js';
import { computeCenterOfMass } from './simulation/centerOfMass.js';
import { DEFAULT_STAGE_ID } from '../environment/stages.js';

const DEFAULT_ROOT_ACCELERATION_LIMIT = 300;
const DEFAULT_ROOT_HEIGHT_LIMIT = 5;

function recordSample(instance, trace, timestamp, sensors) {
  const centerOfMass = computeCenterOfMass(instance);
  trace.push({
    timestamp,
    centerOfMass,
    rootHeight: sensors.summary?.rootHeight ?? centerOfMass.y,
    objectiveDistance: sensors.summary?.objectiveDistance ?? null
  });
}

export async function simulateLocomotion({
  morphGenome,
  controllerGenome,
  duration = 60,
  timestep = 1 / 60,
  sampleInterval = 1 / 30,
  signal,
  stageId = DEFAULT_STAGE_ID,
  shouldAbort,
  maxRootAcceleration = DEFAULT_ROOT_ACCELERATION_LIMIT,
  maxRootHeight = DEFAULT_ROOT_HEIGHT_LIMIT
} = {}) {
  const RAPIER = await loadRapier();
  const world = createSimulationWorld(RAPIER, timestep, stageId);

  try {
    const instance = instantiateCreature(RAPIER, world, morphGenome, controllerGenome);
    const runtime = instance.controllerRuntime;
    runtime.reset();

    const dt = world.timestep ?? timestep;
    const totalSteps = Math.max(1, Math.ceil(Math.max(duration, 0) / dt));
    const sampleSteps = Math.max(1, Math.round(Math.max(sampleInterval, dt) / dt));

    const accelerationLimit =
      typeof maxRootAcceleration === 'number'
        ? Math.max(maxRootAcceleration, 0)
        : DEFAULT_ROOT_ACCELERATION_LIMIT;
    const heightLimit =
      typeof maxRootHeight === 'number'
        ? Math.max(maxRootHeight, 0)
        : DEFAULT_ROOT_HEIGHT_LIMIT;

    const trace = [];
    let sensors = gatherSensorSnapshot(instance);
    recordSample(instance, trace, 0, sensors);
    let previousVelocity = sensors.summary?.rootVelocity
      ? { ...sensors.summary.rootVelocity }
      : null;
    let disqualification = null;

    const checkAbort = () => {
      if (typeof shouldAbort === 'function') {
        shouldAbort();
      }
      if (signal?.aborted) {
        throw signal.reason ?? new Error('Simulation aborted');
      }
    };

    for (let step = 0; step < totalSteps; step += 1) {
      checkAbort();

      const result = runtime.update(dt, sensors);
      applyControllerCommands(instance, result?.commands ?? []);

      world.step();
      checkAbort();

      sensors = gatherSensorSnapshot(instance);
      const timestamp = (step + 1) * dt;
      if ((step + 1) % sampleSteps === 0 || step === totalSteps - 1) {
        recordSample(instance, trace, timestamp, sensors);
      }

      if ((sensors.summary?.rootHeight ?? 0) < -2) {
        break;
      }

      const currentHeight = sensors.summary?.rootHeight ?? 0;
      if (!disqualification && heightLimit > 0 && currentHeight > heightLimit) {
        disqualification = {
          reason: 'height',
          limit: heightLimit,
          value: currentHeight,
          timestamp
        };
        break;
      }

      const currentVelocity = sensors.summary?.rootVelocity
        ? { ...sensors.summary.rootVelocity }
        : null;
      if (
        !disqualification &&
        currentVelocity &&
        previousVelocity &&
        accelerationLimit > 0
      ) {
        const ax = (currentVelocity.x - previousVelocity.x) / dt;
        const ay = (currentVelocity.y - previousVelocity.y) / dt;
        const az = (currentVelocity.z - previousVelocity.z) / dt;
        const accelerationMagnitude = Math.hypot(ax, ay, az);
        if (accelerationMagnitude > accelerationLimit) {
          disqualification = {
            reason: 'acceleration',
            limit: accelerationLimit,
            value: accelerationMagnitude,
            timestamp
          };
          break;
        }
      }

      if (currentVelocity) {
        previousVelocity = currentVelocity;
      }
    }

    return {
      trace,
      runtime: trace.length > 0 ? trace[trace.length - 1].timestamp : 0,
      rootId: instance.rootId,
      disqualification
    };
  } finally {
    world.free();
  }
}

export { loadRapier };
