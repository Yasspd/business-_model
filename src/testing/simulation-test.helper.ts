import { RunSimulationDto } from '../simulation/dto/run-simulation.dto';
import { Entity } from '../simulation/types/entity.type';
import {
  SimulationResponse,
  SimulationStepItem,
} from '../simulation/types/simulation-response.type';

export function createEntity(overrides: Partial<Entity> = {}): Entity {
  const x = overrides.x ?? 0.5;
  const y = overrides.y ?? 0.5;

  return {
    id: overrides.id ?? 'entity-1',
    segment: overrides.segment ?? 'regular',
    currentState: overrides.currentState ?? 'interested',
    history: overrides.history ?? [],
    x,
    y,
    prevX: overrides.prevX ?? x,
    prevY: overrides.prevY ?? y,
    temperature: overrides.temperature ?? 0.3,
    weight: overrides.weight ?? 0.5,
    sensitivity: overrides.sensitivity ?? 0.5,
    relevance: overrides.relevance ?? 0.5,
    influence: overrides.influence ?? 0,
    velocity: overrides.velocity ?? 0,
    stateRisk: overrides.stateRisk ?? 0.3,
    failureProbability: overrides.failureProbability ?? 0.2,
    riskScore: overrides.riskScore ?? 0.3,
    localThreshold: overrides.localThreshold ?? 0.65,
    action: overrides.action ?? 'no_action',
    isFinished: overrides.isFinished ?? false,
  };
}

export function createStrongStressRunDto(
  overrides: Partial<RunSimulationDto> = {},
): RunSimulationDto {
  return {
    scenarioKey: 'global-chaos-mvp',
    entitiesCount: 100,
    steps: 8,
    mode: 'adaptive',
    profile: 'stress',
    seed: 123,
    activeEventOverride: {
      intensity: 1,
      relevance: 1,
      scope: 1,
      x: 0.92,
      y: 0.92,
      duration: 3,
      startStep: 1,
      ...overrides.activeEventOverride,
    },
    returnEntitiesLimit: 20,
    ...overrides,
  };
}

export function createSimulationStepItem(
  overrides: Partial<SimulationStepItem> = {},
): SimulationStepItem {
  return {
    step: overrides.step ?? 1,
    avgTemperature: overrides.avgTemperature ?? 0.3,
    avgInfluence: overrides.avgInfluence ?? 0.2,
    avgVelocity: overrides.avgVelocity ?? 0.15,
    avgCurrentInfluence: overrides.avgCurrentInfluence ?? 0.2,
    avgResidualInfluence: overrides.avgResidualInfluence ?? 0,
    avgCurrentVelocity: overrides.avgCurrentVelocity ?? 0.15,
    avgResidualVelocity: overrides.avgResidualVelocity ?? 0,
    avgRiskScore: overrides.avgRiskScore ?? 0.35,
    avgFailureProbability: overrides.avgFailureProbability ?? 0.25,
    clusterDensity: overrides.clusterDensity ?? 0.18,
    hotShare: overrides.hotShare ?? 0.08,
    failureProximity: overrides.failureProximity ?? 0.25,
    chaosIndex: overrides.chaosIndex ?? 0.27,
    globalThreshold: overrides.globalThreshold ?? 0.44,
    systemAction: overrides.systemAction ?? 'system_normal',
    activeEventIntensity: overrides.activeEventIntensity ?? 0.6,
    stateDistribution: overrides.stateDistribution ?? {
      calm: 4,
      interested: 4,
      reactive: 2,
    },
    actionDistribution: overrides.actionDistribution ?? {
      no_action: 8,
      watch: 1,
      notify: 1,
    },
    actionsBreakdown: overrides.actionsBreakdown ?? {
      watch: 1,
      notify: 1,
      dampen: 0,
      total: 2,
    },
    finishedThisStep: overrides.finishedThisStep ?? 0,
    stabilizedThisStep: overrides.stabilizedThisStep ?? 0,
    failedThisStep: overrides.failedThisStep ?? 0,
    cumulativeFinished: overrides.cumulativeFinished ?? 0,
    cumulativeStabilized: overrides.cumulativeStabilized ?? 0,
    cumulativeFailed: overrides.cumulativeFailed ?? 0,
    eventSnapshot: overrides.eventSnapshot ?? null,
    breakdown: overrides.breakdown,
  };
}

export function createSimulationResponse(
  overrides: Partial<SimulationResponse> = {},
): SimulationResponse {
  const baseStep = createSimulationStepItem(overrides.lastStep ?? {});

  return {
    runId: overrides.runId ?? 'run-test',
    startedAt: overrides.startedAt ?? '2026-03-29T00:00:00.000Z',
    finishedAt: overrides.finishedAt ?? '2026-03-29T00:00:01.000Z',
    status: overrides.status ?? 'completed',
    scenarioKey: overrides.scenarioKey ?? 'global-chaos-mvp',
    mode: overrides.mode ?? 'adaptive',
    profile: overrides.profile ?? 'stress',
    seed: overrides.seed ?? 123,
    entitiesCount: overrides.entitiesCount ?? 10,
    requestedSteps: overrides.requestedSteps ?? 1,
    activeEventSnapshot: overrides.activeEventSnapshot ?? null,
    configSnapshot: overrides.configSnapshot ?? {
      profile: overrides.profile ?? 'stress',
      clusterRadius: 0.18,
      hotTemperatureThreshold: 0.7,
      systemHotThreshold: 0.66,
      visualHotThreshold: 0.6,
      maxFailureDepth: 4,
      storeTimeline: true,
    },
    summary: overrides.summary ?? {
      totalEntities: 10,
      finishedEntities: 3,
      stabilizedCount: 1,
      failedCount: 2,
      actionCount: 2,
      actionCountTotal: 6,
      lastStepActionCount: 2,
      watchCountTotal: 3,
      notifyCountTotal: 2,
      dampenCountTotal: 1,
      lastStepActionsBreakdown: {
        watch: 1,
        notify: 1,
        dampen: 0,
        total: 2,
      },
      hotEntities: 1,
      hotEntitiesTotal: 2,
      hotActiveEntities: 1,
      maxHotEntities: 2,
      maxTemperature: 0.74,
      conversionRate: 0.1,
      failureRate: 0.2,
      avgTemperature: 0.32,
      avgInfluence: 0.2,
      avgCurrentInfluence: 0.18,
      avgResidualInfluence: 0.04,
      avgCurrentVelocity: 0.12,
      avgResidualVelocity: 0.03,
      avgRiskScore: 0.34,
      avgFailureProbability: 0.26,
      finalChaosIndex: baseStep.chaosIndex,
      maxChaosIndex: Math.max(baseStep.chaosIndex, 0.31),
      avgChaosIndex: baseStep.chaosIndex,
      finalGlobalThreshold: baseStep.globalThreshold,
      finalSystemAction: baseStep.systemAction,
    },
    lastStep: overrides.lastStep ?? baseStep,
    steps: overrides.steps ?? [baseStep],
    entities: overrides.entities ?? [createEntity()],
    debug: overrides.debug ?? {
      clusterRadius: 0.18,
      hotTemperatureThreshold: 0.7,
      systemHotThreshold: 0.66,
      visualHotThreshold: 0.6,
      transitionMatrixValidated: true,
    },
    analysis: overrides.analysis,
  };
}

export function normalizeSimulationResponse(response: SimulationResponse) {
  const stableResponse = structuredClone(response);

  Reflect.deleteProperty(stableResponse, 'runId');
  Reflect.deleteProperty(stableResponse, 'startedAt');
  Reflect.deleteProperty(stableResponse, 'finishedAt');

  return stableResponse;
}

export function stripAnalysis<T extends SimulationResponse>(response: T) {
  const stableResponse = structuredClone(response);

  Reflect.deleteProperty(stableResponse, 'analysis');

  return stableResponse;
}

export function sumDistribution(distribution: Record<string, number>): number {
  return Object.values(distribution).reduce((sum, value) => sum + value, 0);
}

export function countNonNoAction(distribution: Record<string, number>): number {
  return Object.entries(distribution).reduce(
    (sum, [action, count]) => (action === 'no_action' ? sum : sum + count),
    0,
  );
}

export function expectFiniteInRange(
  value: number,
  min: number,
  max: number,
): void {
  expect(Number.isFinite(value)).toBe(true);
  expect(value).toBeGreaterThanOrEqual(min);
  expect(value).toBeLessThanOrEqual(max);
}
