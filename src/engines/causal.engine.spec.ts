import { CausalEngine } from './causal.engine';
import {
  AnalysisExecutionRequest,
  AnalysisRunExecutor,
} from './analysis-engine.type';
import {
  createSimulationResponse,
  createStrongStressRunDto,
} from '../testing/simulation-test.helper';

describe('CausalEngine', () => {
  let engine: CausalEngine;

  beforeEach(() => {
    engine = new CausalEngine();
  });

  function createStubExecutor(): AnalysisRunExecutor {
    const responsesByTag = new Map<
      string,
      ReturnType<typeof createSimulationResponse>
    >([
      [
        'causal:mode_fixed_control',
        createSimulationResponse({
          mode: 'fixed',
          summary: {
            ...createSimulationResponse().summary,
            failureRate: 0.32,
            finalChaosIndex: 0.42,
            avgRiskScore: 0.41,
          },
        }),
      ],
      [
        'causal:local_actions_off',
        createSimulationResponse({
          summary: {
            ...createSimulationResponse().summary,
            failureRate: 0.28,
            finalChaosIndex: 0.36,
            avgRiskScore: 0.37,
          },
        }),
      ],
      [
        'causal:system_actions_off',
        createSimulationResponse({
          summary: {
            ...createSimulationResponse().summary,
            failureRate: 0.24,
            finalChaosIndex: 0.34,
            avgRiskScore: 0.35,
          },
        }),
      ],
      [
        'causal:event_stronger',
        createSimulationResponse({
          summary: {
            ...createSimulationResponse().summary,
            failureRate: 0.27,
            finalChaosIndex: 0.39,
            avgRiskScore: 0.4,
          },
        }),
      ],
      [
        'causal:event_weaker',
        createSimulationResponse({
          summary: {
            ...createSimulationResponse().summary,
            failureRate: 0.12,
            finalChaosIndex: 0.19,
            avgRiskScore: 0.22,
          },
        }),
      ],
      [
        'causal:threshold_tightened',
        createSimulationResponse({
          summary: {
            ...createSimulationResponse().summary,
            failureRate: 0.16,
            finalChaosIndex: 0.21,
            avgRiskScore: 0.25,
          },
        }),
      ],
    ]);

    return (request: AnalysisExecutionRequest) => {
      const response = responsesByTag.get(request.tag ?? '');

      if (!response) {
        throw new Error(`Unexpected analysis tag: ${request.tag ?? 'missing'}`);
      }

      return response;
    };
  }

  it('builds ranked paired-run causal comparisons for the requested target metric', () => {
    const baseResponse = createSimulationResponse({
      summary: {
        ...createSimulationResponse().summary,
        failureRate: 0.2,
        finalChaosIndex: 0.27,
        avgRiskScore: 0.34,
      },
    });

    const analysis = engine.analyze(
      baseResponse,
      createStrongStressRunDto(),
      {
        enabled: true,
        targetMetric: 'failureRate',
        maxInterventions: 6,
      },
      createStubExecutor(),
    );

    expect(analysis.enabled).toBe(true);
    expect(analysis.method).toBe('simulation_interventional_estimate');
    expect(analysis.targetMetric).toBe('failureRate');
    expect(analysis.comparisons).toHaveLength(6);
    expect(analysis.topDrivers[0].metric).toBe('failureRate');
    expect(analysis.chaosDrivers[0].metric).toBe('finalChaosIndex');
    expect(analysis.topDrivers[0].absoluteEffect).toBeGreaterThanOrEqual(
      analysis.topDrivers[1].absoluteEffect,
    );

    for (const comparison of analysis.comparisons) {
      expect(Number.isFinite(comparison.baselineValue)).toBe(true);
      expect(Number.isFinite(comparison.treatedValue)).toBe(true);
      expect(Number.isFinite(comparison.estimatedEffect)).toBe(true);
      expect(comparison.caveats.length).toBeGreaterThan(0);
    }
  });

  it('respects the intervention limit and preserves effect direction semantics', () => {
    const baseResponse = createSimulationResponse({
      summary: {
        ...createSimulationResponse().summary,
        failureRate: 0.2,
      },
    });
    const analysis = engine.analyze(
      baseResponse,
      createStrongStressRunDto(),
      {
        enabled: true,
        targetMetric: 'failureRate',
        maxInterventions: 2,
      },
      createStubExecutor(),
    );

    expect(analysis.comparisons).toHaveLength(2);
    expect(
      analysis.comparisons.every((comparison) =>
        ['increase', 'decrease', 'no_change'].includes(
          comparison.effectDirection,
        ),
      ),
    ).toBe(true);
  });
});
