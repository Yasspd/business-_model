import { UncertaintyEngine } from './uncertainty.engine';
import {
  AnalysisExecutionRequest,
  AnalysisRunExecutor,
  RobustEvaluationResult,
} from './analysis-engine.type';
import { EmpiricalInterval } from '../simulation/types/analysis.type';
import {
  createSimulationResponse,
  createStrongStressRunDto,
} from '../testing/simulation-test.helper';

describe('UncertaintyEngine', () => {
  let engine: UncertaintyEngine;

  beforeEach(() => {
    engine = new UncertaintyEngine();
  });

  function createStubExecutor(): AnalysisRunExecutor {
    return (request: AnalysisExecutionRequest) => {
      const seed = request.dto.seed ?? 0;
      const seedOffset = ((seed % 7) + 7) % 7;

      return createSimulationResponse({
        seed,
        summary: {
          ...createSimulationResponse().summary,
          failureRate: 0.18 + seedOffset * 0.01,
          finalChaosIndex: 0.24 + seedOffset * 0.015,
          stabilizedCount: 8 + seedOffset,
          failedCount: 2 + seedOffset,
          avgRiskScore: 0.3 + seedOffset * 0.01,
        },
      });
    };
  }

  it('builds finite ordered empirical intervals and includes robust policy score when available', () => {
    const baseResponse = createSimulationResponse({
      summary: {
        ...createSimulationResponse().summary,
        failureRate: 0.2,
        finalChaosIndex: 0.28,
        stabilizedCount: 9,
        failedCount: 3,
        avgRiskScore: 0.33,
      },
    });
    const robustEvaluation: RobustEvaluationResult = {
      analysis: {
        enabled: true,
        evaluator: 'scenario_based_policy_evaluator',
        objective: 'balanced_resilience',
        candidatePolicies: [],
        scenarioCount: 3,
        scenarios: [],
        recommendedPolicy: {
          policyId: 'adaptive',
          mode: 'adaptive',
          label: 'Adaptive',
          expectedScore: 0.8,
          worstCaseScore: 0.73,
          tailRiskScore: 0.75,
          stabilityScore: 0.88,
          robustScore: 0.79,
          regret: 0,
          downside: 0.07,
        },
        expectedScores: {},
        worstCaseScores: {},
        tailRiskScores: {},
        ranking: [],
        frontier: [],
        constraints: [],
        notes: [],
      },
      scenarioScores: {
        adaptive: [0.74, 0.8, 0.83],
      },
    };
    const analysis = engine.quantify(
      baseResponse,
      createStrongStressRunDto(),
      {
        enabled: true,
        level: 0.95,
        method: 'calibrated_empirical_interval',
        resamples: 6,
      },
      createStubExecutor(),
      robustEvaluation,
    );

    expect(analysis.enabled).toBe(true);
    expect(analysis.method).toBe('calibrated_empirical_interval');
    expect(analysis.metrics.recommendedPolicyScore).toBeDefined();

    const intervals = Object.values(analysis.metrics) as Array<
      EmpiricalInterval | undefined
    >;

    for (const interval of intervals) {
      if (!interval) {
        continue;
      }

      expect(Number.isFinite(interval.point)).toBe(true);
      expect(Number.isFinite(interval.lower)).toBe(true);
      expect(Number.isFinite(interval.upper)).toBe(true);
      expect(interval.lower).toBeLessThanOrEqual(interval.point);
      expect(interval.point).toBeLessThanOrEqual(interval.upper);
    }

    expect(analysis.calibrationInfo.effectiveSamples).toBe(6);
    expect(analysis.caveats.length).toBeGreaterThan(0);
  });
});
