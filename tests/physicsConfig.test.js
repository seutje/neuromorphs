import { enableContinuousCollisionDetection } from '../public/physics/ccd.js';
import {
  configureCreatureSimulationWorld,
  getStabilityDefaults
} from '../public/physics/stability.js';

describe('enableContinuousCollisionDetection', () => {
  it('enables CCD when the descriptor supports it', () => {
    const descriptor = { setCcdEnabled: jest.fn().mockReturnThis() };

    const result = enableContinuousCollisionDetection(descriptor);

    expect(descriptor.setCcdEnabled).toHaveBeenCalledWith(true);
    expect(result).toBe(descriptor);
  });

  it('returns the original descriptor when CCD is unavailable', () => {
    const descriptor = {};

    const result = enableContinuousCollisionDetection(descriptor);

    expect(result).toBe(descriptor);
  });
});

describe('configureCreatureSimulationWorld', () => {
  it('applies stability defaults to integration parameters', () => {
    const params = {
      dt: 0,
      maxVelocityIterations: 4,
      maxStabilizationIterations: 2,
      allowedLinearError: 0.02,
      allowedAngularError: 0.03,
      predictionDistance: 0.05,
      maxCcdSubsteps: 1
    };
    const world = { integrationParameters: params };

    configureCreatureSimulationWorld(world);

    const defaults = getStabilityDefaults();

    expect(world.timestep).toBeCloseTo(defaults.timestep);
    expect(params.dt).toBeCloseTo(defaults.timestep);
    expect(params.maxVelocityIterations).toBeGreaterThanOrEqual(
      defaults.maxVelocityIterations
    );
    expect(params.maxStabilizationIterations).toBeGreaterThanOrEqual(
      defaults.maxStabilizationIterations
    );
    expect(params.allowedLinearError).toBeLessThanOrEqual(defaults.allowedLinearError);
    expect(params.allowedAngularError).toBeLessThanOrEqual(defaults.allowedAngularError);
    expect(params.predictionDistance).toBeLessThanOrEqual(defaults.predictionDistance);
    expect(params.maxCcdSubsteps).toBeGreaterThanOrEqual(defaults.maxCcdSubsteps);
  });

  it('handles missing integration parameters gracefully', () => {
    const world = {};

    configureCreatureSimulationWorld(world);

    const defaults = getStabilityDefaults();

    expect(world.timestep).toBeCloseTo(defaults.timestep);
  });
});
