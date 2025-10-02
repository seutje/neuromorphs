const DEFAULT_TIMESTEP = 1 / 60;
const STABILITY_DEFAULTS = {
  maxVelocityIterations: 12,
  maxStabilizationIterations: 6,
  allowedLinearError: 0.001,
  allowedAngularError: 0.001,
  predictionDistance: 0.002,
  maxCcdSubsteps: 4
};

function clampMaximum(value, limit) {
  if (!Number.isFinite(value)) {
    return limit;
  }
  return Math.min(value, limit);
}

function clampMinimum(value, limit) {
  if (!Number.isFinite(value)) {
    return limit;
  }
  return Math.max(value, limit);
}

export function configureCreatureSimulationWorld(world) {
  if (!world || typeof world !== 'object') {
    return world;
  }
  const params = world.integrationParameters;
  if (!params || typeof params !== 'object') {
    if (!Number.isFinite(world.timestep) || world.timestep <= 0) {
      world.timestep = DEFAULT_TIMESTEP;
    }
    return world;
  }

  const timestep = Number.isFinite(world.timestep) && world.timestep > 0
    ? world.timestep
    : DEFAULT_TIMESTEP;
  world.timestep = timestep;
  params.dt = Number.isFinite(params.dt) && params.dt > 0 ? params.dt : timestep;

  params.maxVelocityIterations = clampMinimum(
    params.maxVelocityIterations,
    STABILITY_DEFAULTS.maxVelocityIterations
  );
  params.maxStabilizationIterations = clampMinimum(
    params.maxStabilizationIterations,
    STABILITY_DEFAULTS.maxStabilizationIterations
  );

  params.allowedLinearError = clampMaximum(
    params.allowedLinearError,
    STABILITY_DEFAULTS.allowedLinearError
  );
  params.allowedAngularError = clampMaximum(
    params.allowedAngularError,
    STABILITY_DEFAULTS.allowedAngularError
  );
  params.predictionDistance = clampMaximum(
    params.predictionDistance,
    STABILITY_DEFAULTS.predictionDistance
  );
  params.maxCcdSubsteps = clampMinimum(
    params.maxCcdSubsteps,
    STABILITY_DEFAULTS.maxCcdSubsteps
  );

  return world;
}

export function getStabilityDefaults() {
  return {
    timestep: DEFAULT_TIMESTEP,
    ...STABILITY_DEFAULTS
  };
}
