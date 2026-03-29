import { TestingModule, Test } from '@nestjs/testing';
import { AppModule } from '../app.module';
import { EmpiricalInterval } from './types/analysis.type';
import {
  countNonNoAction,
  createStrongStressRunDto,
  expectFiniteInRange,
  normalizeSimulationResponse,
  stripAnalysis,
  sumDistribution,
} from '../testing/simulation-test.helper';
import { SimulationService } from './simulation.service';
import { SimulationResponse } from './types/simulation-response.type';

describe('Simulation regression', () => {
  let moduleRef: TestingModule;
  let service: SimulationService;

  beforeEach(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    service = moduleRef.get(SimulationService);
  });

  afterEach(async () => {
    await moduleRef.close();
  });

  function assertCoreRunInvariants(response: SimulationResponse): void {
    expect(response.status).toBe('completed');
    expect(response.steps).toHaveLength(response.requestedSteps);
    expect(response.summary.totalEntities).toBe(response.entitiesCount);
    expect(response.summary.finishedEntities).toBe(
      response.summary.stabilizedCount + response.summary.failedCount,
    );
    expect(response.summary.actionCount).toBe(
      response.summary.lastStepActionCount,
    );
    expect(response.lastStep?.step).toBe(response.requestedSteps);
    expect(response.lastStep?.cumulativeFinished).toBe(
      response.summary.finishedEntities,
    );
    expect(response.lastStep?.cumulativeStabilized).toBe(
      response.summary.stabilizedCount,
    );
    expect(response.lastStep?.cumulativeFailed).toBe(
      response.summary.failedCount,
    );
    expect(response.summary.finalChaosIndex).toBe(
      response.lastStep?.chaosIndex ?? 0,
    );
    expect(response.summary.finalGlobalThreshold).toBe(
      response.lastStep?.globalThreshold ?? 0,
    );
    expect(response.summary.finalSystemAction).toBe(
      response.lastStep?.systemAction ?? 'system_normal',
    );
    expect(response.summary.lastStepActionsBreakdown).toEqual(
      response.lastStep?.actionsBreakdown ?? {
        watch: 0,
        notify: 0,
        dampen: 0,
        total: 0,
      },
    );
    expect(response.summary.maxChaosIndex).toBeGreaterThanOrEqual(
      response.summary.finalChaosIndex,
    );
    expect(response.summary.maxHotEntities).toBeGreaterThanOrEqual(
      response.summary.hotEntities,
    );
    expect(response.summary.hotEntitiesTotal).toBeGreaterThanOrEqual(
      response.summary.hotEntities,
    );
    expect(response.summary.hotEntitiesTotal).toBeGreaterThanOrEqual(
      response.summary.hotActiveEntities,
    );

    expectFiniteInRange(response.summary.avgTemperature, 0, 1);
    expectFiniteInRange(response.summary.avgInfluence, 0, 1);
    expectFiniteInRange(response.summary.avgCurrentInfluence, 0, 1);
    expectFiniteInRange(response.summary.avgResidualInfluence, 0, 1);
    expectFiniteInRange(response.summary.avgCurrentVelocity, 0, 1);
    expectFiniteInRange(response.summary.avgResidualVelocity, 0, 1);
    expectFiniteInRange(response.summary.avgRiskScore, 0, 1);
    expectFiniteInRange(response.summary.avgFailureProbability, 0, 1);
    expectFiniteInRange(response.summary.finalChaosIndex, 0, 1);
    expectFiniteInRange(response.summary.maxChaosIndex, 0, 1);
    expectFiniteInRange(response.summary.avgChaosIndex, 0, 1);
    expectFiniteInRange(response.summary.finalGlobalThreshold, 0.15, 0.95);
    expectFiniteInRange(response.summary.maxTemperature, 0, 1);
    expectFiniteInRange(response.summary.conversionRate, 0, 1);
    expectFiniteInRange(response.summary.failureRate, 0, 1);

    const stepActionTotals = response.steps.reduce(
      (totals, step) => ({
        watch: totals.watch + step.actionsBreakdown.watch,
        notify: totals.notify + step.actionsBreakdown.notify,
        dampen: totals.dampen + step.actionsBreakdown.dampen,
        total: totals.total + step.actionsBreakdown.total,
      }),
      {
        watch: 0,
        notify: 0,
        dampen: 0,
        total: 0,
      },
    );

    expect(stepActionTotals.watch).toBe(response.summary.watchCountTotal);
    expect(stepActionTotals.notify).toBe(response.summary.notifyCountTotal);
    expect(stepActionTotals.dampen).toBe(response.summary.dampenCountTotal);
    expect(stepActionTotals.total).toBe(response.summary.actionCountTotal);

    let previousCumulativeFinished = 0;
    let previousCumulativeStabilized = 0;
    let previousCumulativeFailed = 0;

    for (const step of response.steps) {
      expect(sumDistribution(step.stateDistribution)).toBe(
        response.summary.totalEntities,
      );
      expect(sumDistribution(step.actionDistribution)).toBe(
        response.summary.totalEntities,
      );
      expect(step.actionsBreakdown.total).toBe(
        step.actionsBreakdown.watch +
          step.actionsBreakdown.notify +
          step.actionsBreakdown.dampen,
      );
      expect(step.actionsBreakdown.total).toBe(
        countNonNoAction(step.actionDistribution),
      );

      expectFiniteInRange(step.avgTemperature, 0, 1);
      expectFiniteInRange(step.avgInfluence, 0, 1);
      expectFiniteInRange(step.avgVelocity, 0, 1);
      expectFiniteInRange(step.avgCurrentInfluence, 0, 1);
      expectFiniteInRange(step.avgResidualInfluence, 0, 1);
      expectFiniteInRange(step.avgCurrentVelocity, 0, 1);
      expectFiniteInRange(step.avgResidualVelocity, 0, 1);
      expectFiniteInRange(step.avgRiskScore, 0, 1);
      expectFiniteInRange(step.avgFailureProbability, 0, 1);
      expectFiniteInRange(step.clusterDensity, 0, 1);
      expectFiniteInRange(step.hotShare, 0, 1);
      expectFiniteInRange(step.failureProximity, 0, 1);
      expectFiniteInRange(step.chaosIndex, 0, 1);
      expectFiniteInRange(step.globalThreshold, 0.15, 0.95);
      expect(step.finishedThisStep).toBe(
        step.stabilizedThisStep + step.failedThisStep,
      );
      expect(step.cumulativeFinished).toBe(
        previousCumulativeFinished + step.finishedThisStep,
      );
      expect(step.cumulativeStabilized).toBe(
        previousCumulativeStabilized + step.stabilizedThisStep,
      );
      expect(step.cumulativeFailed).toBe(
        previousCumulativeFailed + step.failedThisStep,
      );
      expect(step.eventSnapshot?.intensity ?? 0).toBe(
        step.activeEventIntensity,
      );

      previousCumulativeFinished = step.cumulativeFinished;
      previousCumulativeStabilized = step.cumulativeStabilized;
      previousCumulativeFailed = step.cumulativeFailed;
    }

    for (const entity of response.entities) {
      expect(entity.history.length).toBeLessThanOrEqual(
        response.requestedSteps,
      );
      expect(entity.history.map((historyItem) => historyItem.step)).toEqual(
        Array.from({ length: entity.history.length }, (_, index) => index + 1),
      );

      for (const historyItem of entity.history) {
        expectFiniteInRange(historyItem.x, 0, 1);
        expectFiniteInRange(historyItem.y, 0, 1);
        expectFiniteInRange(historyItem.temperature, 0, 1);
        expectFiniteInRange(historyItem.influence, 0, 1);
        expectFiniteInRange(historyItem.velocity, 0, 1);
        expectFiniteInRange(historyItem.riskScore, 0, 1);
        expectFiniteInRange(historyItem.localThreshold, 0.35, 0.95);
      }

      if (entity.isFinished) {
        expect(['stabilized', 'failed']).toContain(entity.currentState);
        expect(entity.action).toBe('no_action');
        expect(['stabilized', 'failed']).toContain(
          entity.history.at(-1)?.state,
        );
      }
    }
  }

  function assertAnalysisInvariants(response: SimulationResponse): void {
    expect(response.analysis).toBeDefined();

    if (!response.analysis) {
      throw new Error('Analysis block was expected but is missing');
    }

    if (response.analysis.causal) {
      expect(response.analysis.causal.enabled).toBe(true);
      expect(response.analysis.causal.comparisons.length).toBeGreaterThan(0);

      for (const comparison of response.analysis.causal.comparisons) {
        expect(Number.isFinite(comparison.baselineValue)).toBe(true);
        expect(Number.isFinite(comparison.treatedValue)).toBe(true);
        expect(Number.isFinite(comparison.estimatedEffect)).toBe(true);
        expect(['small', 'moderate', 'large']).toContain(
          comparison.effectStrengthLabel,
        );
      }
    }

    if (response.analysis.robust) {
      expect(response.analysis.robust.enabled).toBe(true);
      expect(response.analysis.robust.ranking.length).toBeGreaterThan(0);

      for (const score of response.analysis.robust.ranking) {
        expectFiniteInRange(score.expectedScore, 0, 1);
        expectFiniteInRange(score.worstCaseScore, 0, 1);
        expectFiniteInRange(score.tailRiskScore, 0, 1);
        expectFiniteInRange(score.stabilityScore, 0, 1);
        expectFiniteInRange(score.robustScore, 0, 1);
        expectFiniteInRange(score.regret, 0, 1);
        expectFiniteInRange(score.scoreGapFromBest, 0, 1);
        expectFiniteInRange(score.downside, 0, 1);
        expect(score.explanation.strongestFactors.length).toBeGreaterThan(0);
        expect(score.explanation.scoreFormula.stabilityWeight).toBe(0);
      }
    }

    if (response.analysis.uncertainty) {
      expect(response.analysis.uncertainty.enabled).toBe(true);
      const intervals = Object.values(
        response.analysis.uncertainty.metrics,
      ) as Array<EmpiricalInterval | undefined>;

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

      expect(response.analysis.uncertainty.notes.length).toBeGreaterThan(0);
    }
  }

  function normalizeAdaptiveHybridResponse(response: SimulationResponse) {
    const normalized = normalizeSimulationResponse(response);

    if (normalized.lastStep) {
      Reflect.deleteProperty(normalized.lastStep, 'breakdown');
    }

    for (const step of normalized.steps) {
      Reflect.deleteProperty(step, 'breakdown');
    }

    return {
      ...normalized,
      mode: 'adaptive',
    };
  }

  it('preserves invariants across a compact profile/mode/seed matrix', () => {
    const profiles = ['demo', 'realistic', 'stress'] as const;
    const modes = ['baseline', 'fixed', 'adaptive', 'hybrid'] as const;
    const seeds = [11, 29];

    for (const profile of profiles) {
      for (const mode of modes) {
        for (const seed of seeds) {
          const response = service.runSimulation({
            scenarioKey: 'global-chaos-mvp',
            entitiesCount: 30,
            steps: 5,
            mode,
            profile,
            seed,
            returnEntitiesLimit: 15,
          });

          assertCoreRunInvariants(response);

          if (mode === 'fixed') {
            expect(response.summary.actionCountTotal).toBe(0);
            expect(response.summary.watchCountTotal).toBe(0);
            expect(response.summary.notifyCountTotal).toBe(0);
            expect(response.summary.dampenCountTotal).toBe(0);
            expect(response.summary.lastStepActionCount).toBe(0);
            expect(response.summary.finalGlobalThreshold).toBe(0.7);

            for (const step of response.steps) {
              expect(step.actionsBreakdown).toEqual({
                watch: 0,
                notify: 0,
                dampen: 0,
                total: 0,
              });
              expect(step.actionDistribution).toEqual({
                no_action: response.summary.totalEntities,
              });
              expect(step.globalThreshold).toBe(0.7);
              expect(step.systemAction).toBe('system_normal');
            }
          } else if (mode === 'hybrid') {
            for (const step of response.steps) {
              expect(step.breakdown).toBeDefined();
            }
          } else {
            for (const step of response.steps) {
              expect(step.breakdown).toBeUndefined();
            }
          }
        }
      }
    }
  });

  it('remains deterministic for repeated runs with the same seed', () => {
    const profiles = ['demo', 'realistic', 'stress'] as const;
    const modes = ['baseline', 'fixed', 'adaptive', 'hybrid'] as const;
    const seeds = [11, 29];

    for (const profile of profiles) {
      for (const mode of modes) {
        for (const seed of seeds) {
          const dto = {
            scenarioKey: 'global-chaos-mvp',
            entitiesCount: 24,
            steps: 4,
            mode,
            profile,
            seed,
            returnEntitiesLimit: 12,
          } as const;
          const firstResponse = service.runSimulation(dto);
          const secondResponse = service.runSimulation(dto);

          expect(normalizeSimulationResponse(firstResponse)).toEqual(
            normalizeSimulationResponse(secondResponse),
          );
        }
      }
    }
  });

  it('keeps adaptive stress distinct from fixed in both trajectory and terminal outcomes', () => {
    const adaptiveResponse = service.runSimulation(
      createStrongStressRunDto({
        mode: 'adaptive',
      }),
    );
    const fixedResponse = service.runSimulation(
      createStrongStressRunDto({
        mode: 'fixed',
      }),
    );

    assertCoreRunInvariants(adaptiveResponse);
    assertCoreRunInvariants(fixedResponse);

    expect(adaptiveResponse.summary.actionCountTotal).toBeGreaterThan(0);
    expect(fixedResponse.summary.actionCountTotal).toBe(0);

    const trajectoryDiverged =
      adaptiveResponse.summary.finalChaosIndex !==
        fixedResponse.summary.finalChaosIndex ||
      adaptiveResponse.summary.avgChaosIndex !==
        fixedResponse.summary.avgChaosIndex ||
      adaptiveResponse.summary.avgTemperature !==
        fixedResponse.summary.avgTemperature ||
      adaptiveResponse.summary.avgRiskScore !==
        fixedResponse.summary.avgRiskScore ||
      adaptiveResponse.summary.finalGlobalThreshold !==
        fixedResponse.summary.finalGlobalThreshold;
    const terminalDiverged =
      adaptiveResponse.summary.stabilizedCount !==
        fixedResponse.summary.stabilizedCount ||
      adaptiveResponse.summary.failedCount !==
        fixedResponse.summary.failedCount;

    expect(trajectoryDiverged).toBe(true);
    expect(terminalDiverged).toBe(true);
  });

  it('keeps baseline as report-only mode without immediate action effects', () => {
    const baselineResponse = service.runSimulation(
      createStrongStressRunDto({
        mode: 'baseline',
      }),
    );
    const adaptiveResponse = service.runSimulation(
      createStrongStressRunDto({
        mode: 'adaptive',
      }),
    );

    assertCoreRunInvariants(baselineResponse);
    assertCoreRunInvariants(adaptiveResponse);

    expect(baselineResponse.steps[0].actionsBreakdown.total).toBeGreaterThan(0);
    expect(baselineResponse.steps[0].actionsBreakdown).toEqual(
      adaptiveResponse.steps[0].actionsBreakdown,
    );
    expect(baselineResponse.steps[0].systemAction).toBe(
      adaptiveResponse.steps[0].systemAction,
    );
    expect(
      baselineResponse.steps[0].avgTemperature !==
        adaptiveResponse.steps[0].avgTemperature ||
        baselineResponse.steps[0].avgInfluence !==
          adaptiveResponse.steps[0].avgInfluence ||
        baselineResponse.steps[0].avgRiskScore !==
          adaptiveResponse.steps[0].avgRiskScore ||
        baselineResponse.steps[0].chaosIndex !==
          adaptiveResponse.steps[0].chaosIndex,
    ).toBe(true);
  });

  it('keeps hybrid semantically aligned with adaptive while exposing breakdown telemetry', () => {
    const adaptiveResponse = service.runSimulation(
      createStrongStressRunDto({
        mode: 'adaptive',
      }),
    );
    const hybridResponse = service.runSimulation(
      createStrongStressRunDto({
        mode: 'hybrid',
      }),
    );

    assertCoreRunInvariants(adaptiveResponse);
    assertCoreRunInvariants(hybridResponse);

    expect(
      adaptiveResponse.steps.every((step) => step.breakdown === undefined),
    ).toBe(true);
    expect(
      hybridResponse.steps.every((step) => step.breakdown !== undefined),
    ).toBe(true);
    expect(normalizeAdaptiveHybridResponse(hybridResponse)).toEqual(
      normalizeAdaptiveHybridResponse(adaptiveResponse),
    );
  });

  it('keeps raw simulation result unchanged when analysis layers are enabled', () => {
    const baseDto = createStrongStressRunDto({
      mode: 'adaptive',
      steps: 6,
      returnEntitiesLimit: 12,
    });
    const baselineResponse = service.runSimulation(baseDto);
    const analyzedResponse = service.runSimulation({
      ...baseDto,
      analysisOptions: {
        causal: true,
        robust: true,
        uncertainty: {
          enabled: true,
          resamples: 6,
        },
      },
    });

    assertCoreRunInvariants(baselineResponse);
    assertCoreRunInvariants(analyzedResponse);
    assertAnalysisInvariants(analyzedResponse);
    expect(
      normalizeSimulationResponse(stripAnalysis(analyzedResponse)),
    ).toEqual(normalizeSimulationResponse(baselineResponse));
  });

  it('keeps analysis deterministic for repeated runs with the same seed', () => {
    const dto = {
      ...createStrongStressRunDto({
        mode: 'adaptive',
        steps: 6,
        returnEntitiesLimit: 10,
      }),
      analysisOptions: {
        causal: {
          enabled: true,
          targetMetric: 'failureRate',
          maxInterventions: 4,
        },
        robust: {
          enabled: true,
          objective: 'balanced_resilience',
          scenarioCount: 4,
        },
        uncertainty: {
          enabled: true,
          level: 0.95,
          method: 'calibrated_empirical_interval',
          resamples: 6,
        },
      },
    };
    const firstResponse = service.runSimulation(dto);
    const secondResponse = service.runSimulation(dto);

    assertAnalysisInvariants(firstResponse);
    assertAnalysisInvariants(secondResponse);
    expect(normalizeSimulationResponse(firstResponse)).toEqual(
      normalizeSimulationResponse(secondResponse),
    );
  });

  it('does not persist internal analysis reruns into latest or public run history', () => {
    const before = service.runSimulation(
      createStrongStressRunDto({
        mode: 'adaptive',
        steps: 5,
        returnEntitiesLimit: 8,
      }),
    );
    const beforeList = service.listRuns({ limit: 20 });

    expect(beforeList).toHaveLength(1);
    expect(beforeList[0].runId).toBe(before.runId);

    const analyzed = service.runSimulation({
      ...createStrongStressRunDto({
        mode: 'adaptive',
        steps: 5,
        returnEntitiesLimit: 8,
      }),
      seed: 777,
      analysisOptions: {
        causal: true,
        robust: {
          enabled: true,
          scenarioCount: 6,
        },
        uncertainty: {
          enabled: true,
          resamples: 8,
        },
      },
    });
    const afterList = service.listRuns({ limit: 20 });

    expect(afterList).toHaveLength(2);
    expect(afterList.map((run) => run.runId)).toEqual([
      analyzed.runId,
      before.runId,
    ]);
    expect(service.getLatestRun().runId).toBe(analyzed.runId);
  });
});
