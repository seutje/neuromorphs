import { loadRapier } from './rapierLoader.js';
import { createSimulationWorld } from './simulation/world.js';
import { instantiateCreature } from './simulation/instantiateCreature.js';
import { gatherSensorSnapshot } from './simulation/sensors.js';
import { applyControllerCommands } from './simulation/controllerCommands.js';
import { computeCenterOfMass } from './simulation/centerOfMass.js';
import { yieldToMainThread } from './yield.js';

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
  duration = 2.5,
  timestep = 1 / 60,
  sampleInterval = 1 / 30,
  signal
} = {}) {
  const RAPIER = await loadRapier();
  const world = createSimulationWorld(RAPIER, timestep);

  try {
    const instance = instantiateCreature(RAPIER, world, morphGenome, controllerGenome);
    const runtime = instance.controllerRuntime;
    runtime.reset();

    const dt = world.timestep ?? timestep;
    const totalSteps = Math.max(1, Math.ceil(Math.max(duration, 0) / dt));
    const sampleSteps = Math.max(1, Math.round(Math.max(sampleInterval, dt) / dt));

    const trace = [];
    let sensors = gatherSensorSnapshot(instance);
    recordSample(instance, trace, 0, sensors);

    for (let step = 0; step < totalSteps; step += 1) {
      if (signal?.aborted) {
        throw signal.reason ?? new Error('Simulation aborted');
      }

      const result = runtime.update(dt, sensors);
      applyControllerCommands(instance, result?.commands ?? []);

      world.step();

      sensors = gatherSensorSnapshot(instance);
      const timestamp = (step + 1) * dt;
      if ((step + 1) % sampleSteps === 0 || step === totalSteps - 1) {
        recordSample(instance, trace, timestamp, sensors);
        await yieldToMainThread({ signal });
      }

      if ((sensors.summary?.rootHeight ?? 0) < -2) {
        break;
      }
    }

    return {
      trace,
      runtime: trace.length > 0 ? trace[trace.length - 1].timestamp : 0,
      rootId: instance.rootId
    };
  } finally {
    world.free();
  }
}

export { loadRapier };
