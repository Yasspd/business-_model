import { DEFAULT_SCENARIO } from '../scenario/scenario.config';
import { EventSnapshot } from '../simulation/types/event.type';
import {
  createEntity,
  expectFiniteInRange,
  sumDistribution,
} from '../testing/simulation-test.helper';
import { MetricsEngine } from './metrics.engine';

describe('MetricsEngine', () => {
  let engine: MetricsEngine;

  beforeEach(() => {
    engine = new MetricsEngine();
  });

  function createEventSnapshot(): EventSnapshot {
    return {
      id: 'event-1',
      name: 'event',
      type: 'trend',
      x: 0.5,
      y: 0.5,
      intensity: 0.7,
      severity: 0.6,
      relevance: 0.8,
      scope: 0.75,
      duration: 3,
      startStep: 1,
      isActive: true,
      phase: 'peak',
      baseIntensity: 0.7,
      baseScope: 0.75,
      baseRelevance: 0.8,
    };
  }

  it('computes bounded step metrics and separates current versus residual telemetry', () => {
    const entities = [
      createEntity({
        id: 'entity-1',
        x: 0.5,
        y: 0.5,
        temperature: 0.8,
        influence: 0.5,
        velocity: 0.2,
        riskScore: 0.7,
        failureProbability: 0.6,
      }),
      createEntity({
        id: 'entity-2',
        x: 0.6,
        y: 0.5,
        temperature: 0.4,
        influence: 0.1,
        velocity: 0.05,
        riskScore: 0.3,
        failureProbability: 0.2,
      }),
      createEntity({
        id: 'entity-3',
        currentState: 'stabilized',
        x: 0.52,
        y: 0.55,
        temperature: 0.75,
        influence: 0.3,
        velocity: 0.1,
        riskScore: 0.2,
        failureProbability: 0,
        isFinished: true,
      }),
      createEntity({
        id: 'entity-4',
        currentState: 'failed',
        x: 0.9,
        y: 0.9,
        temperature: 0.1,
        influence: 0.2,
        velocity: 0,
        riskScore: 1,
        failureProbability: 1,
        isFinished: true,
      }),
    ];
    const activeEntities = entities.filter((entity) => !entity.isFinished);
    const metrics = engine.computeStepMetrics(
      entities,
      activeEntities,
      createEventSnapshot(),
      0.18,
      0.7,
      DEFAULT_SCENARIO.chaosIndexWeights,
      true,
    );

    expect(metrics.avgTemperature).toBeCloseTo(0.5125);
    expect(metrics.avgInfluence).toBeCloseTo(0.275);
    expect(metrics.avgCurrentInfluence).toBeCloseTo(0.3);
    expect(metrics.avgResidualInfluence).toBeCloseTo(0.25);
    expect(metrics.avgVelocity).toBeCloseTo(0.0875);
    expect(metrics.avgCurrentVelocity).toBeCloseTo(0.125);
    expect(metrics.avgResidualVelocity).toBeCloseTo(0.05);
    expect(metrics.avgRiskScore).toBeCloseTo(0.55);
    expect(metrics.avgFailureProbability).toBeCloseTo(0.45);
    expect(metrics.clusterDensity).toBeCloseTo(0.75);
    expect(metrics.hotShare).toBeCloseTo(0.5);
    expect(metrics.hotEntities).toBe(2);
    expect(metrics.hotActiveEntities).toBe(1);
    expect(metrics.failureProximity).toBeCloseTo(0.45);
    expect(metrics.maxTemperature).toBeCloseTo(0.8);
    expect(metrics.chaosIndex).toBeCloseTo(0.460625);
    expect(metrics.breakdown).toBeDefined();

    expectFiniteInRange(metrics.avgTemperature, 0, 1);
    expectFiniteInRange(metrics.chaosIndex, 0, 1);
  });

  it('builds internally consistent step distributions and action breakdowns', () => {
    const entities = [
      createEntity({
        id: 'entity-1',
        currentState: 'reactive',
        action: 'watch',
      }),
      createEntity({
        id: 'entity-2',
        currentState: 'critical',
        action: 'notify',
      }),
      createEntity({
        id: 'entity-3',
        currentState: 'stabilized',
        action: 'no_action',
        isFinished: true,
      }),
      createEntity({
        id: 'entity-4',
        currentState: 'failed',
        action: 'no_action',
        isFinished: true,
      }),
    ];
    const activeEntities = entities.filter((entity) => !entity.isFinished);
    const metrics = {
      avgTemperature: 0.5,
      avgInfluence: 0.25,
      avgVelocity: 0.1,
      avgCurrentInfluence: 0.2,
      avgResidualInfluence: 0.3,
      avgCurrentVelocity: 0.12,
      avgResidualVelocity: 0.08,
      avgRiskScore: 0.55,
      avgFailureProbability: 0.45,
      clusterDensity: 0.75,
      hotShare: 0.5,
      hotEntities: 2,
      hotActiveEntities: 1,
      failureProximity: 0.45,
      chaosIndex: 0.46,
      maxTemperature: 0.8,
    };
    const stepItem = engine.buildStepItem({
      step: 3,
      metrics,
      globalThreshold: 0.6,
      systemAction: 'rebalance_attention',
      activeEventIntensity: 0.7,
      eventSnapshot: createEventSnapshot(),
      entities,
      activeEntities,
      finishedThisStep: 1,
      stabilizedThisStep: 1,
      failedThisStep: 0,
      cumulativeFinished: 2,
      cumulativeStabilized: 1,
      cumulativeFailed: 1,
    });

    expect(stepItem.actionsBreakdown).toEqual({
      watch: 1,
      notify: 1,
      dampen: 0,
      total: 2,
    });
    expect(stepItem.actionDistribution).toEqual({
      no_action: 2,
      watch: 1,
      notify: 1,
    });
    expect(sumDistribution(stepItem.stateDistribution)).toBe(4);
    expect(sumDistribution(stepItem.actionDistribution)).toBe(4);
    expect(stepItem.actionsBreakdown.total).toBe(
      stepItem.actionsBreakdown.watch +
        stepItem.actionsBreakdown.notify +
        stepItem.actionsBreakdown.dampen,
    );
  });

  it('builds final summary with consistent derived and bounded metrics', () => {
    const entities = [
      createEntity({
        id: 'entity-1',
        currentState: 'reactive',
        temperature: 0.8,
        influence: 0.5,
        velocity: 0.2,
        riskScore: 0.7,
        failureProbability: 0.6,
        action: 'watch',
      }),
      createEntity({
        id: 'entity-2',
        currentState: 'critical',
        temperature: 0.4,
        influence: 0.1,
        velocity: 0.05,
        riskScore: 0.3,
        failureProbability: 0.2,
        action: 'notify',
      }),
      createEntity({
        id: 'entity-3',
        currentState: 'stabilized',
        temperature: 0.75,
        influence: 0.3,
        velocity: 0.1,
        riskScore: 0.2,
        failureProbability: 0,
        action: 'no_action',
        isFinished: true,
      }),
      createEntity({
        id: 'entity-4',
        currentState: 'failed',
        temperature: 0.1,
        influence: 0.2,
        velocity: 0,
        riskScore: 1,
        failureProbability: 1,
        action: 'no_action',
        isFinished: true,
      }),
    ];
    const activeEntities = entities.filter((entity) => !entity.isFinished);
    const firstStep = engine.buildStepItem({
      step: 1,
      metrics: {
        avgTemperature: 0.5125,
        avgInfluence: 0.275,
        avgVelocity: 0.0875,
        avgCurrentInfluence: 0.3,
        avgResidualInfluence: 0.25,
        avgCurrentVelocity: 0.125,
        avgResidualVelocity: 0.05,
        avgRiskScore: 0.55,
        avgFailureProbability: 0.45,
        clusterDensity: 0.75,
        hotShare: 0.5,
        hotEntities: 2,
        hotActiveEntities: 1,
        failureProximity: 0.45,
        chaosIndex: 0.460625,
        maxTemperature: 0.8,
      },
      globalThreshold: 0.6,
      systemAction: 'system_normal',
      activeEventIntensity: 0.7,
      eventSnapshot: createEventSnapshot(),
      entities,
      activeEntities,
      finishedThisStep: 1,
      stabilizedThisStep: 1,
      failedThisStep: 0,
      cumulativeFinished: 1,
      cumulativeStabilized: 1,
      cumulativeFailed: 0,
    });
    const secondStep = engine.buildStepItem({
      step: 2,
      metrics: {
        avgTemperature: 0.5125,
        avgInfluence: 0.275,
        avgVelocity: 0.0875,
        avgCurrentInfluence: 0.3,
        avgResidualInfluence: 0.25,
        avgCurrentVelocity: 0.125,
        avgResidualVelocity: 0.05,
        avgRiskScore: 0.55,
        avgFailureProbability: 0.45,
        clusterDensity: 0.4,
        hotShare: 0.25,
        hotEntities: 1,
        hotActiveEntities: 1,
        failureProximity: 0.45,
        chaosIndex: 0.2,
        maxTemperature: 0.8,
      },
      globalThreshold: 0.55,
      systemAction: 'rebalance_attention',
      activeEventIntensity: 0.5,
      eventSnapshot: createEventSnapshot(),
      entities,
      activeEntities,
      finishedThisStep: 1,
      stabilizedThisStep: 0,
      failedThisStep: 1,
      cumulativeFinished: 2,
      cumulativeStabilized: 1,
      cumulativeFailed: 1,
    });
    const summary = engine.buildFinalSummary({
      entities,
      steps: [firstStep, secondStep],
      systemHotThreshold: 0.7,
      hotEntitiesTotal: 3,
      maxHotEntities: 2,
      maxTemperature: 0.8,
      actionTotals: {
        watch: 1,
        notify: 2,
        dampen: 3,
        total: 6,
      },
    });

    expect(summary.totalEntities).toBe(4);
    expect(summary.finishedEntities).toBe(2);
    expect(summary.finishedEntities).toBe(
      summary.stabilizedCount + summary.failedCount,
    );
    expect(summary.actionCount).toBe(2);
    expect(summary.lastStepActionCount).toBe(2);
    expect(summary.actionCountTotal).toBe(6);
    expect(summary.lastStepActionsBreakdown).toEqual({
      watch: 1,
      notify: 1,
      dampen: 0,
      total: 2,
    });
    expect(summary.hotEntities).toBe(2);
    expect(summary.hotEntitiesTotal).toBe(3);
    expect(summary.hotActiveEntities).toBe(1);
    expect(summary.maxHotEntities).toBe(2);
    expect(summary.maxTemperature).toBe(0.8);
    expect(summary.conversionRate).toBeCloseTo(0.25);
    expect(summary.failureRate).toBeCloseTo(0.25);
    expect(summary.avgTemperature).toBeCloseTo(0.5125);
    expect(summary.avgInfluence).toBeCloseTo(0.275);
    expect(summary.avgCurrentInfluence).toBeCloseTo(0.3);
    expect(summary.avgResidualInfluence).toBeCloseTo(0.25);
    expect(summary.avgCurrentVelocity).toBeCloseTo(0.125);
    expect(summary.avgResidualVelocity).toBeCloseTo(0.05);
    expect(summary.avgRiskScore).toBeCloseTo(0.55);
    expect(summary.avgFailureProbability).toBeCloseTo(0.45);
    expect(summary.finalChaosIndex).toBeCloseTo(0.2);
    expect(summary.maxChaosIndex).toBeCloseTo(0.460625);
    expect(summary.avgChaosIndex).toBeCloseTo(0.3303125);
    expect(summary.finalGlobalThreshold).toBeCloseTo(0.55);
    expect(summary.finalSystemAction).toBe('rebalance_attention');

    expectFiniteInRange(summary.avgTemperature, 0, 1);
    expectFiniteInRange(summary.avgRiskScore, 0, 1);
    expectFiniteInRange(summary.avgFailureProbability, 0, 1);
    expectFiniteInRange(summary.finalChaosIndex, 0, 1);
    expectFiniteInRange(summary.finalGlobalThreshold, 0, 1);
  });
});
