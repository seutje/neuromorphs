import {
  DEFAULT_SELECTION_WEIGHTS,
  objectiveToSelectionWeights,
  resolveSelectionWeights,
  scoreLocomotionWithWeights
} from '../public/evolution/fitness.js';

describe('scoreLocomotionWithWeights', () => {
  it('combines locomotion fitness with weighted distance and speed bonuses', () => {
    const metrics = {
      fitness: 6.2,
      displacement: 4.8,
      averageSpeed: 1.6,
      fallFraction: 0.2
    };
    const weights = { distance: 0.5, speed: 1, upright: 1 };
    const expected = 6.2 + 0.5 * 4.8 + 1 * 1.6 + 1 * (1 - 0.2) * 6.2;
    expect(scoreLocomotionWithWeights(metrics, weights)).toBeCloseTo(expected, 5);
  });

  it('scales the upright reward proportionally to the provided weight', () => {
    const metrics = {
      fitness: 5.5,
      displacement: 2.4,
      averageSpeed: 1.1,
      fallFraction: 0.25
    };
    const lowUpright = scoreLocomotionWithWeights(metrics, {
      distance: 0.5,
      speed: 0.5,
      upright: 0.25
    });
    const highUpright = scoreLocomotionWithWeights(metrics, {
      distance: 0.5,
      speed: 0.5,
      upright: 2
    });
    expect(highUpright).toBeGreaterThan(lowUpright);
  });

  it('falls back to locomotion fitness when weights are zero or metrics incomplete', () => {
    const metrics = {
      fitness: 4.8,
      displacement: 3.1,
      averageSpeed: 0.9,
      fallFraction: 0.4
    };
    expect(
      scoreLocomotionWithWeights(metrics, { distance: 0, speed: 0, upright: 0 })
    ).toBeCloseTo(4.8, 5);
    expect(
      scoreLocomotionWithWeights({ displacement: 2, averageSpeed: 1, fallFraction: 0.1 }, {
        distance: 0,
        speed: 0,
        upright: 0
      })
    ).toBeGreaterThan(0);
  });

  it('guards against invalid metric payloads', () => {
    expect(scoreLocomotionWithWeights(null, DEFAULT_SELECTION_WEIGHTS)).toBe(0);
    expect(
      scoreLocomotionWithWeights(
        { averageSpeed: Number.NaN, fallFraction: 2 },
        DEFAULT_SELECTION_WEIGHTS
      )
    ).toBe(0);
  });
});

describe('selection weight helpers', () => {
  it('sanitizes invalid entries with resolveSelectionWeights', () => {
    const weights = resolveSelectionWeights({ distance: 'abc', speed: -2, upright: Infinity });
    expect(weights.distance).toBeCloseTo(DEFAULT_SELECTION_WEIGHTS.distance, 5);
    expect(weights.speed).toBe(0);
    expect(weights.upright).toBeCloseTo(DEFAULT_SELECTION_WEIGHTS.upright, 5);
  });

  it('provides stronger emphasis for legacy objectives', () => {
    const speedWeights = objectiveToSelectionWeights('speed');
    expect(speedWeights.speed).toBeGreaterThan(speedWeights.distance);
    const uprightWeights = objectiveToSelectionWeights('upright');
    expect(uprightWeights.upright).toBeGreaterThan(DEFAULT_SELECTION_WEIGHTS.upright);
  });
});
