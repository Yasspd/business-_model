import { RobustEngine } from './robust.engine';
import {
  AnalysisExecutionRequest,
  AnalysisRunExecutor,
} from './analysis-engine.type';
import {
  createSimulationResponse,
  createStrongStressRunDto,
} from '../testing/simulation-test.helper';

describe('RobustEngine', () => {
  let engine: RobustEngine;

  beforeEach(() => {
    engine = new RobustEngine();
  });

  function createStubExecutor(): AnalysisRunExecutor {
    const failureRates: Record<string, number> = {
      'baseline:event_intensity_high': 0.34,
      'baseline:event_relevance_scope_high': 0.31,
      'baseline:noise_pressure_high': 0.29,
      'fixed:event_intensity_high': 0.28,
      'fixed:event_relevance_scope_high': 0.26,
      'fixed:noise_pressure_high': 0.24,
      'adaptive:event_intensity_high': 0.17,
      'adaptive:event_relevance_scope_high': 0.15,
      'adaptive:noise_pressure_high': 0.13,
      'hybrid:event_intensity_high': 0.19,
      'hybrid:event_relevance_scope_high': 0.16,
      'hybrid:noise_pressure_high': 0.14,
    };

    return (request: AnalysisExecutionRequest) => {
      const tag = request.tag?.replace('robust:', '') ?? '';
      const failureRate = failureRates[tag];

      if (failureRate === undefined) {
        throw new Error(`Unexpected robust tag: ${request.tag ?? 'missing'}`);
      }

      return createSimulationResponse({
        mode: request.modeOverride ?? request.dto.mode,
        summary: {
          ...createSimulationResponse().summary,
          failureRate,
          conversionRate: 1 - failureRate * 0.8,
          finalChaosIndex: failureRate * 0.75,
          avgChaosIndex: failureRate * 0.7,
        },
      });
    };
  }

  it('evaluates candidate policies across deterministic scenario plans and ranks them', () => {
    const result = engine.evaluate(
      createStrongStressRunDto(),
      {
        enabled: true,
        objective: 'min_failure_rate',
        scenarioCount: 3,
      },
      createStubExecutor(),
    );

    expect(result.analysis.enabled).toBe(true);
    expect(result.analysis.scenarioCount).toBe(3);
    expect(result.analysis.candidatePolicies).toHaveLength(4);
    expect(result.analysis.ranking).toHaveLength(4);
    expect(result.analysis.recommendedPolicy?.policyId).toBe('adaptive');
    expect(result.analysis.frontier.length).toBeGreaterThan(0);
    expect(result.analysis.expectedScores.adaptive).toBeGreaterThan(
      result.analysis.expectedScores.fixed,
    );
    expect(result.analysis.expectedScores.fixed).toBeGreaterThan(
      result.analysis.expectedScores.baseline,
    );
    expect(result.scenarioScores.adaptive).toHaveLength(3);

    for (const score of result.analysis.ranking) {
      expect(Number.isFinite(score.expectedScore)).toBe(true);
      expect(Number.isFinite(score.worstCaseScore)).toBe(true);
      expect(Number.isFinite(score.tailRiskScore)).toBe(true);
      expect(Number.isFinite(score.stabilityScore)).toBe(true);
      expect(Number.isFinite(score.robustScore)).toBe(true);
      expect(Number.isFinite(score.regret)).toBe(true);
      expect(Number.isFinite(score.scoreGapFromBest)).toBe(true);
      expect(Number.isFinite(score.downside)).toBe(true);
      expect(score.explanation.strongestFactors.length).toBeGreaterThan(0);
      expect(score.explanation.scoreFormula.stabilityWeight).toBe(0);
    }
  });

  it('uses deterministic tie-breaks when robust scores are equal', () => {
    const tiedExecutor: AnalysisRunExecutor = (
      request: AnalysisExecutionRequest,
    ) => {
      const policyId = request.tag?.split(':')[1];

      if (!policyId) {
        throw new Error('Missing policy id in robust tag');
      }

      const scoreByPolicy: Record<string, number> = {
        baseline: 0.2,
        fixed: 0.2,
        adaptive: 0.3,
        hybrid: 0.4,
      };
      const failureRate = scoreByPolicy[policyId];

      return createSimulationResponse({
        mode: request.modeOverride ?? request.dto.mode,
        summary: {
          ...createSimulationResponse().summary,
          failureRate,
          conversionRate: 1 - failureRate,
          finalChaosIndex: failureRate,
          avgChaosIndex: failureRate,
        },
      });
    };

    const result = engine.evaluate(
      createStrongStressRunDto(),
      {
        enabled: true,
        objective: 'min_failure_rate',
        scenarioCount: 3,
      },
      tiedExecutor,
    );

    expect(result.analysis.ranking[0].policyId).toBe('baseline');
    expect(result.analysis.ranking[1].policyId).toBe('fixed');
  });
});
