import { scoreLocomotionByObjective } from '../public/evolution/fitness.js';

describe('scoreLocomotionByObjective', () => {
  it('emphasizes distance without discarding locomotion fitness', () => {
    const metrics = {
      fitness: 6.2,
      displacement: 4.8,
      averageSpeed: 1.6,
      fallFraction: 0.2
    };
    expect(scoreLocomotionByObjective(metrics)).toBeCloseTo(8.6);
    expect(scoreLocomotionByObjective(metrics, 'distance')).toBeCloseTo(8.6);
  });

  it('adds a speed bonus on top of the locomotion baseline', () => {
    const metrics = {
      fitness: 5.5,
      displacement: 2.5,
      averageSpeed: 1.2,
      fallFraction: 0.4
    };
    expect(scoreLocomotionByObjective(metrics, 'speed')).toBeCloseTo(6.7);
  });

  it('rewards staying upright while still valuing distance', () => {
    const metrics = {
      fitness: 4.2,
      displacement: 3.2,
      averageSpeed: 0.9,
      fallFraction: 0.35
    };
    expect(scoreLocomotionByObjective(metrics, 'upright')).toBeCloseTo(6.93, 2);
  });

  it('falls back to displacement and speed when fitness is missing', () => {
    const metrics = {
      displacement: 3,
      averageSpeed: 1,
      fallFraction: 0.1
    };
    expect(scoreLocomotionByObjective(metrics, 'speed')).toBeCloseTo(4.5);
  });

  it('guards against invalid metrics values', () => {
    expect(scoreLocomotionByObjective(null, 'speed')).toBe(0);
    expect(
      scoreLocomotionByObjective({ averageSpeed: Number.NaN, fallFraction: 2 }, 'upright')
    ).toBe(0);
  });
});
