import { scoreLocomotionByObjective } from '../public/evolution/fitness.js';

describe('scoreLocomotionByObjective', () => {
  it('defaults to using displacement for distance objective', () => {
    const metrics = {
      displacement: 4.8,
      averageSpeed: 1.6,
      fallFraction: 0.2
    };
    expect(scoreLocomotionByObjective(metrics)).toBeCloseTo(4.8);
    expect(scoreLocomotionByObjective(metrics, 'distance')).toBeCloseTo(4.8);
  });

  it('returns the average speed when selecting for speed', () => {
    const metrics = {
      displacement: 2.5,
      averageSpeed: 1.2,
      fallFraction: 0.4
    };
    expect(scoreLocomotionByObjective(metrics, 'speed')).toBeCloseTo(1.2);
  });

  it('rewards staying upright by inverting the fall fraction', () => {
    const metrics = {
      displacement: 3.2,
      averageSpeed: 0.9,
      fallFraction: 0.35
    };
    expect(scoreLocomotionByObjective(metrics, 'upright')).toBeCloseTo(0.65);
  });

  it('guards against invalid metrics values', () => {
    expect(scoreLocomotionByObjective(null, 'speed')).toBe(0);
    expect(
      scoreLocomotionByObjective({ averageSpeed: Number.NaN, fallFraction: 2 }, 'upright')
    ).toBe(0);
  });
});
