import {
  FeatureWeights,
  Scenario,
} from '../simulation/types/scenario-config.type';
import { TransitionEngine } from './transition.engine';
import { ScoringEngine } from './scoring.engine';

describe('ScoringEngine', () => {
  let transitionEngine: TransitionEngine;
  let engine: ScoringEngine;

  beforeEach(() => {
    transitionEngine = new TransitionEngine();
    engine = new ScoringEngine(transitionEngine);
  });

  it('computes state risk from the risk map with fallback and clamp', () => {
    expect(
      engine.computeStateRisk('reactive', {
        reactive: 0.65,
      }),
    ).toBe(0.65);
    expect(
      engine.computeStateRisk('missing', {
        reactive: 0.65,
      }),
    ).toBe(0);
    expect(
      engine.computeStateRisk('failed', {
        failed: 1.5,
      }),
    ).toBe(1);
  });

  it('delegates failure probability estimation to TransitionEngine', () => {
    const spy = jest
      .spyOn(transitionEngine, 'estimateFailureProbability')
      .mockReturnValue(0.42);
    const scenario: Pick<
      Scenario,
      | 'transitionMatrix'
      | 'failureStates'
      | 'successStates'
      | 'riskMap'
      | 'maxFailureDepth'
    > = {
      transitionMatrix: {
        calm: {
          calm: 1,
        },
      },
      failureStates: ['failed'],
      successStates: ['stabilized'],
      riskMap: {
        calm: 0.1,
      },
      maxFailureDepth: 4,
    };

    expect(engine.computeFailureProbability('calm', scenario)).toBe(0.42);
    expect(spy).toHaveBeenCalledWith(
      'calm',
      scenario.transitionMatrix,
      scenario.failureStates,
      scenario.successStates,
      scenario.riskMap,
      scenario.maxFailureDepth,
    );
  });

  it('computes exact failure probability on a controlled scenario', () => {
    const scenario: Pick<
      Scenario,
      | 'transitionMatrix'
      | 'failureStates'
      | 'successStates'
      | 'riskMap'
      | 'maxFailureDepth'
    > = {
      transitionMatrix: {
        start: {
          mid: 0.5,
          failed: 0.5,
        },
        mid: {
          stabilized: 0.25,
          failed: 0.75,
        },
        stabilized: {
          stabilized: 1,
        },
        failed: {
          failed: 1,
        },
      },
      failureStates: ['failed'],
      successStates: ['stabilized'],
      riskMap: {
        start: 0.4,
        mid: 0.6,
        stabilized: 0.05,
        failed: 1,
      },
      maxFailureDepth: 4,
    };

    expect(engine.computeFailureProbability('start', scenario)).toBeCloseTo(
      0.875,
    );
  });

  it('computes deterministic weighted risk scores with clamp and monotonic response', () => {
    const weights: FeatureWeights = {
      stateRisk: 0.3,
      temperature: 0.25,
      influence: 0.2,
      velocity: 0.1,
      failureProbability: 0.15,
    };
    const baseScore = engine.computeRiskScore(
      0.2,
      0.3,
      0.1,
      0.05,
      0.4,
      weights,
    );

    expect(baseScore).toBeCloseTo(0.22);
    expect(engine.computeRiskScore(2, 2, 2, 2, 2, weights)).toBe(1);
    expect(engine.computeRiskScore(0.2, 0.3, 0.1, 0.05, 0.4, weights)).toBe(
      baseScore,
    );
    expect(
      engine.computeRiskScore(0.3, 0.3, 0.1, 0.05, 0.4, weights),
    ).toBeGreaterThan(baseScore);
    expect(
      engine.computeRiskScore(0.2, 0.4, 0.1, 0.05, 0.4, weights),
    ).toBeGreaterThan(baseScore);
    expect(
      engine.computeRiskScore(0.2, 0.3, 0.2, 0.05, 0.4, weights),
    ).toBeGreaterThan(baseScore);
    expect(
      engine.computeRiskScore(0.2, 0.3, 0.1, 0.15, 0.4, weights),
    ).toBeGreaterThan(baseScore);
    expect(
      engine.computeRiskScore(0.2, 0.3, 0.1, 0.05, 0.5, weights),
    ).toBeGreaterThan(baseScore);
  });
});
