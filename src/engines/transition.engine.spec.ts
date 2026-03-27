import { DEFAULT_SCENARIO } from '../scenario/scenario.config';
import {
  RiskMap,
  Transition,
  TransitionMatrix,
} from '../simulation/types/scenario-config.type';
import { expectFiniteInRange } from '../testing/simulation-test.helper';
import { RandomEngine } from './random.engine';
import { TransitionEngine } from './transition.engine';

describe('TransitionEngine', () => {
  let engine: TransitionEngine;

  beforeEach(() => {
    engine = new TransitionEngine();
  });

  function createValidMatrix(): TransitionMatrix {
    return {
      calm: {
        calm: 0.6,
        reactive: 0.4,
      },
      reactive: {
        calm: 0.25,
        reactive: 0.75,
      },
    };
  }

  it('validates a correct transition matrix', () => {
    expect(
      engine.validateTransitionMatrix(createValidMatrix(), [
        'calm',
        'reactive',
      ]),
    ).toBe(true);
  });

  it('throws for missing transition rows', () => {
    expect(() =>
      engine.validateTransitionMatrix(
        {
          calm: {
            calm: 1,
          },
        },
        ['calm', 'reactive'],
      ),
    ).toThrow('Missing transition row for state "reactive"');
  });

  it('throws for unknown next states', () => {
    expect(() =>
      engine.validateTransitionMatrix(
        {
          calm: {
            calm: 0.5,
            unknown: 0.5,
          },
          reactive: {
            reactive: 1,
          },
        },
        ['calm', 'reactive'],
      ),
    ).toThrow('contains unknown state "unknown"');
  });

  it('throws for out-of-range probabilities', () => {
    expect(() =>
      engine.validateTransitionMatrix(
        {
          calm: {
            calm: 1.1,
          },
          reactive: {
            reactive: 1,
          },
        },
        ['calm', 'reactive'],
      ),
    ).toThrow('is out of range');

    expect(() =>
      engine.validateTransitionMatrix(
        {
          calm: {
            calm: -0.1,
            reactive: 1.1,
          },
          reactive: {
            reactive: 1,
          },
        },
        ['calm', 'reactive'],
      ),
    ).toThrow('is out of range');
  });

  it('throws when a row does not sum to one', () => {
    expect(() =>
      engine.validateTransitionMatrix(
        {
          calm: {
            calm: 0.2,
            reactive: 0.2,
          },
          reactive: {
            reactive: 1,
          },
        },
        ['calm', 'reactive'],
      ),
    ).toThrow('must sum to 1');
  });

  it('throws for empty transition rows', () => {
    expect(() =>
      engine.validateTransitionMatrix(
        {
          calm: {},
          reactive: {
            reactive: 1,
          },
        },
        ['calm', 'reactive'],
      ),
    ).toThrow('is empty');
  });

  it('normalizes positive weights and clips negative weights to zero', () => {
    const normalized = engine.normalizeTransition({
      calm: 2,
      reactive: -1,
      failed: 2,
    });

    expect(normalized).toEqual({
      calm: 0.5,
      reactive: 0,
      failed: 0.5,
    });
    expect(
      Object.values(normalized).reduce(
        (sum, probability) => sum + probability,
        0,
      ),
    ).toBeCloseTo(1);
  });

  it('throws when normalized transition total weight is not positive', () => {
    expect(() =>
      engine.normalizeTransition({
        calm: -1,
        reactive: 0,
      }),
    ).toThrow('requires positive total weight');
  });

  it('picks deterministic next-state sequences for the same seed', () => {
    const transition: Transition = {
      calm: 0.25,
      reactive: 0.5,
      failed: 0.25,
    };
    const firstRandomEngine = new RandomEngine(123);
    const secondRandomEngine = new RandomEngine(123);
    const firstSequence = Array.from({ length: 12 }, () =>
      engine.pickNextStateFromTransition(transition, firstRandomEngine),
    );
    const secondSequence = Array.from({ length: 12 }, () =>
      engine.pickNextStateFromTransition(transition, secondRandomEngine),
    );

    expect(firstSequence).toEqual(secondSequence);
    expect(
      firstSequence.every((state) => Object.keys(transition).includes(state)),
    ).toBe(true);
  });

  it('returns exact failure probabilities on a controlled transition graph', () => {
    const transitions: TransitionMatrix = {
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
    };
    const riskMap: RiskMap = {
      start: 0.4,
      mid: 0.6,
      stabilized: 0.05,
      failed: 1,
    };

    expect(
      engine.estimateFailureProbability(
        'start',
        transitions,
        ['failed'],
        ['stabilized'],
        riskMap,
        4,
      ),
    ).toBeCloseTo(0.875);
  });

  it('uses bounded risk fallback on failure, success, zero depth and missing rows', () => {
    const riskMap: RiskMap = {
      calm: 1.4,
      missing: -0.2,
      stabilized: 0.05,
      failed: 1,
    };
    const transitions: TransitionMatrix = {
      calm: {
        calm: 1,
      },
      stabilized: {
        stabilized: 1,
      },
      failed: {
        failed: 1,
      },
    };

    expect(
      engine.estimateFailureProbability(
        'failed',
        transitions,
        ['failed'],
        ['stabilized'],
        riskMap,
        4,
      ),
    ).toBe(1);
    expect(
      engine.estimateFailureProbability(
        'stabilized',
        transitions,
        ['failed'],
        ['stabilized'],
        riskMap,
        4,
      ),
    ).toBe(0);
    expect(
      engine.estimateFailureProbability(
        'calm',
        transitions,
        ['failed'],
        ['stabilized'],
        riskMap,
        0,
      ),
    ).toBe(1);
    expect(
      engine.estimateFailureProbability(
        'missing',
        transitions,
        ['failed'],
        ['stabilized'],
        riskMap,
        3,
      ),
    ).toBe(0);
  });

  it('keeps estimated failure probability finite and bounded for the default scenario', () => {
    for (const state of DEFAULT_SCENARIO.states) {
      expectFiniteInRange(
        engine.estimateFailureProbability(
          state,
          DEFAULT_SCENARIO.transitionMatrix,
          DEFAULT_SCENARIO.failureStates,
          DEFAULT_SCENARIO.successStates,
          DEFAULT_SCENARIO.riskMap,
          DEFAULT_SCENARIO.maxFailureDepth,
        ),
        0,
        1,
      );
    }
  });
});
