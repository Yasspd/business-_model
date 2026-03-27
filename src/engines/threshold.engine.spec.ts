import { DEFAULT_SCENARIO } from '../scenario/scenario.config';
import { createEntity } from '../testing/simulation-test.helper';
import { clamp, mean, std } from './math.util';
import { ThresholdEngine } from './threshold.engine';

describe('ThresholdEngine', () => {
  let engine: ThresholdEngine;

  beforeEach(() => {
    engine = new ThresholdEngine();
  });

  it('returns fixed thresholds without drift in fixed mode', () => {
    const entities = [
      createEntity({ id: 'stable-1', segment: 'stable', riskScore: 0.15 }),
      createEntity({ id: 'regular-1', segment: 'regular', riskScore: 0.55 }),
      createEntity({ id: 'reactive-1', segment: 'reactive', riskScore: 0.85 }),
    ];

    const localThresholds = engine.computeLocalThresholds(
      entities,
      'fixed',
      DEFAULT_SCENARIO.fixedThresholds,
      DEFAULT_SCENARIO.adaptiveThresholds,
    );
    const globalThreshold = engine.computeGlobalThreshold(
      [0.15, 0.55, 0.95],
      'fixed',
      DEFAULT_SCENARIO.fixedThresholds,
      DEFAULT_SCENARIO.adaptiveThresholds,
    );

    expect(Array.from(localThresholds.values())).toEqual(
      Array.from({ length: entities.length }, () => 0.65),
    );
    expect(globalThreshold).toBe(0.7);
  });

  it('computes deterministic adaptive local thresholds per segment', () => {
    const entities = [
      createEntity({ id: 'stable-1', segment: 'stable', riskScore: 0.2 }),
      createEntity({ id: 'stable-2', segment: 'stable', riskScore: 0.6 }),
      createEntity({ id: 'regular-1', segment: 'regular', riskScore: 0.35 }),
      createEntity({ id: 'regular-2', segment: 'regular', riskScore: 0.55 }),
      createEntity({ id: 'reactive-1', segment: 'reactive', riskScore: 0.7 }),
      createEntity({ id: 'reactive-2', segment: 'reactive', riskScore: 0.9 }),
    ];

    const firstPass = engine.computeLocalThresholds(
      entities,
      'adaptive',
      DEFAULT_SCENARIO.fixedThresholds,
      DEFAULT_SCENARIO.adaptiveThresholds,
    );
    const secondPass = engine.computeLocalThresholds(
      entities,
      'adaptive',
      DEFAULT_SCENARIO.fixedThresholds,
      DEFAULT_SCENARIO.adaptiveThresholds,
    );
    const stableExpected = clamp(
      mean([0.2, 0.6]) + 0.5 * std([0.2, 0.6]),
      0.35,
      0.95,
    );
    const regularExpected = clamp(
      mean([0.35, 0.55]) + 0.5 * std([0.35, 0.55]),
      0.35,
      0.95,
    );
    const reactiveExpected = clamp(
      mean([0.7, 0.9]) + 0.5 * std([0.7, 0.9]),
      0.35,
      0.95,
    );

    expect(Array.from(firstPass.entries())).toEqual(
      Array.from(secondPass.entries()),
    );
    expect(firstPass.get('stable-1')).toBeCloseTo(stableExpected);
    expect(firstPass.get('stable-2')).toBeCloseTo(stableExpected);
    expect(firstPass.get('regular-1')).toBeCloseTo(regularExpected);
    expect(firstPass.get('regular-2')).toBeCloseTo(regularExpected);
    expect(firstPass.get('reactive-1')).toBeCloseTo(reactiveExpected);
    expect(firstPass.get('reactive-2')).toBeCloseTo(reactiveExpected);
  });

  it('clamps adaptive local and global thresholds to configured bounds', () => {
    const lowRiskEntities = [
      createEntity({ id: 'stable-low-1', segment: 'stable', riskScore: 0 }),
      createEntity({ id: 'stable-low-2', segment: 'stable', riskScore: 0 }),
    ];
    const highRiskEntities = [
      createEntity({
        id: 'reactive-high-1',
        segment: 'reactive',
        riskScore: 1,
      }),
      createEntity({
        id: 'reactive-high-2',
        segment: 'reactive',
        riskScore: 1,
      }),
    ];

    const lowLocalThreshold = engine.computeLocalThresholds(
      lowRiskEntities,
      'adaptive',
      DEFAULT_SCENARIO.fixedThresholds,
      DEFAULT_SCENARIO.adaptiveThresholds,
    );
    const highLocalThreshold = engine.computeLocalThresholds(
      highRiskEntities,
      'adaptive',
      DEFAULT_SCENARIO.fixedThresholds,
      DEFAULT_SCENARIO.adaptiveThresholds,
    );
    const lowGlobalThreshold = engine.computeGlobalThreshold(
      [],
      'adaptive',
      DEFAULT_SCENARIO.fixedThresholds,
      DEFAULT_SCENARIO.adaptiveThresholds,
    );
    const highGlobalThreshold = engine.computeGlobalThreshold(
      [1, 1, 1],
      'adaptive',
      DEFAULT_SCENARIO.fixedThresholds,
      DEFAULT_SCENARIO.adaptiveThresholds,
    );

    expect(lowLocalThreshold.get('stable-low-1')).toBe(0.35);
    expect(highLocalThreshold.get('reactive-high-1')).toBe(0.95);
    expect(lowGlobalThreshold).toBe(0.4);
    expect(highGlobalThreshold).toBe(0.95);
  });
});
