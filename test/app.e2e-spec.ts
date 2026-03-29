import type { Server } from 'node:http';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from './../src/app.module';
import { DEFAULT_SCENARIO } from './../src/scenario/scenario.config';
import type { EmpiricalInterval } from './../src/simulation/types/analysis.type';
import type {
  SimulationResponse,
  SimulationRunListItem,
  SimulationStepItem,
} from './../src/simulation/types/simulation-response.type';

type TestMode = 'adaptive' | 'baseline' | 'fixed' | 'hybrid';

interface StrongEventOverride {
  intensity: number;
  relevance: number;
  scope: number;
  x: number;
  y: number;
  duration: number;
  startStep: number;
}

interface RunSimulationRequestPayload {
  scenarioKey: string;
  entitiesCount: number;
  steps: number;
  mode: TestMode;
  profile?: 'demo' | 'realistic' | 'stress';
  seed?: number;
  activeEventOverride?: StrongEventOverride;
  returnEntitiesLimit?: number;
  analysisOptions?: {
    causal?: boolean | { enabled?: boolean; targetMetric?: string };
    robust?: boolean | { enabled?: boolean; objective?: string };
    uncertainty?:
      | boolean
      | {
          enabled?: boolean;
          level?: number;
          method?: string;
          resamples?: number;
        };
  };
}

const TERMINAL_STATES = new Set(['failed', 'stabilized']);
const STRONG_STRESS_OVERRIDE: StrongEventOverride = {
  intensity: 1,
  relevance: 1,
  scope: 1,
  x: 0.92,
  y: 0.92,
  duration: 3,
  startStep: 1,
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isSimulationStepItem(value: unknown): value is SimulationStepItem {
  return (
    isRecord(value) &&
    typeof value.step === 'number' &&
    typeof value.chaosIndex === 'number' &&
    typeof value.globalThreshold === 'number' &&
    typeof value.systemAction === 'string'
  );
}

function isSimulationResponse(value: unknown): value is SimulationResponse {
  return (
    isRecord(value) &&
    typeof value.runId === 'string' &&
    typeof value.startedAt === 'string' &&
    typeof value.finishedAt === 'string' &&
    typeof value.status === 'string' &&
    typeof value.scenarioKey === 'string' &&
    typeof value.mode === 'string' &&
    typeof value.profile === 'string' &&
    typeof value.seed === 'number' &&
    typeof value.entitiesCount === 'number' &&
    typeof value.requestedSteps === 'number' &&
    isRecord(value.summary) &&
    (value.lastStep === null || isSimulationStepItem(value.lastStep)) &&
    Array.isArray(value.steps) &&
    Array.isArray(value.entities) &&
    isRecord(value.debug)
  );
}

function isSimulationRunListItem(
  value: unknown,
): value is SimulationRunListItem {
  return (
    isRecord(value) &&
    typeof value.runId === 'string' &&
    typeof value.status === 'string' &&
    typeof value.scenarioKey === 'string' &&
    typeof value.mode === 'string' &&
    typeof value.profile === 'string' &&
    typeof value.seed === 'number' &&
    typeof value.entitiesCount === 'number' &&
    typeof value.requestedSteps === 'number' &&
    isRecord(value.summary)
  );
}

function createStrongStressPayload(
  mode: 'adaptive' | 'fixed',
  seed = 123,
): RunSimulationRequestPayload {
  return {
    scenarioKey: 'global-chaos-mvp',
    entitiesCount: 100,
    steps: 8,
    mode,
    profile: 'stress',
    seed,
    activeEventOverride: { ...STRONG_STRESS_OVERRIDE },
  };
}

async function postSimulationRun(
  httpServer: Server,
  payload: RunSimulationRequestPayload,
): Promise<SimulationResponse> {
  const response = await request(httpServer)
    .post('/simulation/run')
    .send(payload)
    .expect(201);
  const body: unknown = response.body;

  expect(isSimulationResponse(body)).toBe(true);

  if (!isSimulationResponse(body)) {
    throw new Error('Run response does not match SimulationResponse');
  }

  return body;
}

function normalizeSimulationResponse(
  response: SimulationResponse,
): Omit<SimulationResponse, 'finishedAt' | 'runId' | 'startedAt'> {
  const { runId, startedAt, finishedAt, ...stablePayload } = response;
  void runId;
  void startedAt;
  void finishedAt;

  return stablePayload;
}

function stripAnalysisResponse(
  response: Omit<SimulationResponse, 'finishedAt' | 'runId' | 'startedAt'>,
) {
  const normalized = structuredClone(response);

  Reflect.deleteProperty(normalized, 'analysis');

  return normalized;
}

function sumDistribution(distribution: Record<string, number>): number {
  return Object.values(distribution).reduce((sum, value) => sum + value, 0);
}

function countNonNoAction(distribution: Record<string, number>): number {
  return Object.entries(distribution).reduce(
    (sum, [action, value]) => (action === 'no_action' ? sum : sum + value),
    0,
  );
}

function expectFiniteInRange(value: number, min = 0, max = 1): void {
  expect(Number.isFinite(value)).toBe(true);
  expect(value).toBeGreaterThanOrEqual(min);
  expect(value).toBeLessThanOrEqual(max);
}

function assertCoreRunInvariants(body: SimulationResponse): void {
  expect(body.steps).toHaveLength(body.requestedSteps);
  expect(body.summary.totalEntities).toBe(body.entitiesCount);
  expect(body.entities.length).toBeLessThanOrEqual(body.entitiesCount);
  expect(body.summary.finishedEntities).toBe(
    body.summary.stabilizedCount + body.summary.failedCount,
  );
  expect(body.lastStep?.cumulativeFinished).toBe(body.summary.finishedEntities);
  expect(body.lastStep?.cumulativeFailed).toBe(body.summary.failedCount);
  expect(body.lastStep?.cumulativeStabilized).toBe(
    body.summary.stabilizedCount,
  );
  expect(body.summary.actionCount).toBe(body.summary.lastStepActionCount);
  expect(body.summary.lastStepActionCount).toBe(
    body.summary.lastStepActionsBreakdown.total,
  );
  expect(body.summary.finalChaosIndex).toBe(body.lastStep?.chaosIndex ?? 0);
  expect(body.summary.finalGlobalThreshold).toBe(
    body.lastStep?.globalThreshold ?? 0,
  );
  expect(body.summary.finalSystemAction).toBe(
    body.lastStep?.systemAction ?? 'system_normal',
  );
  expectFiniteInRange(body.summary.avgTemperature);
  expectFiniteInRange(body.summary.avgInfluence);
  expectFiniteInRange(body.summary.avgCurrentInfluence);
  expectFiniteInRange(body.summary.avgResidualInfluence);
  expectFiniteInRange(body.summary.avgCurrentVelocity);
  expectFiniteInRange(body.summary.avgResidualVelocity);
  expectFiniteInRange(body.summary.avgRiskScore);
  expectFiniteInRange(body.summary.avgFailureProbability);
  expectFiniteInRange(body.summary.finalChaosIndex);
  expectFiniteInRange(body.summary.maxChaosIndex);
  expectFiniteInRange(body.summary.avgChaosIndex);
  expectFiniteInRange(body.summary.finalGlobalThreshold);
  expectFiniteInRange(body.summary.conversionRate);
  expectFiniteInRange(body.summary.failureRate);
  expectFiniteInRange(body.summary.maxTemperature);

  let previousCumulativeFinished = 0;
  let previousCumulativeFailed = 0;
  let previousCumulativeStabilized = 0;

  for (const [index, step] of body.steps.entries()) {
    expect(step.step).toBe(index + 1);
    expectFiniteInRange(step.avgTemperature);
    expectFiniteInRange(step.avgInfluence);
    expectFiniteInRange(step.avgVelocity);
    expectFiniteInRange(step.avgCurrentInfluence);
    expectFiniteInRange(step.avgResidualInfluence);
    expectFiniteInRange(step.avgCurrentVelocity);
    expectFiniteInRange(step.avgResidualVelocity);
    expectFiniteInRange(step.avgRiskScore);
    expectFiniteInRange(step.avgFailureProbability);
    expectFiniteInRange(step.clusterDensity);
    expectFiniteInRange(step.hotShare);
    expectFiniteInRange(step.failureProximity);
    expectFiniteInRange(step.chaosIndex);
    expectFiniteInRange(step.globalThreshold);
    expectFiniteInRange(step.activeEventIntensity);
    expect(sumDistribution(step.stateDistribution)).toBe(
      body.summary.totalEntities,
    );
    expect(sumDistribution(step.actionDistribution)).toBe(
      body.summary.totalEntities,
    );
    expect(countNonNoAction(step.actionDistribution)).toBe(
      step.actionsBreakdown.total,
    );
    expect(step.actionsBreakdown.total).toBe(
      step.actionsBreakdown.watch +
        step.actionsBreakdown.notify +
        step.actionsBreakdown.dampen,
    );
    expect(step.cumulativeFinished).toBeGreaterThanOrEqual(
      previousCumulativeFinished,
    );
    expect(step.cumulativeFailed).toBeGreaterThanOrEqual(
      previousCumulativeFailed,
    );
    expect(step.cumulativeStabilized).toBeGreaterThanOrEqual(
      previousCumulativeStabilized,
    );

    previousCumulativeFinished = step.cumulativeFinished;
    previousCumulativeFailed = step.cumulativeFailed;
    previousCumulativeStabilized = step.cumulativeStabilized;
  }

  for (const entity of body.entities) {
    expectFiniteInRange(entity.x);
    expectFiniteInRange(entity.y);
    expectFiniteInRange(entity.temperature);
    expectFiniteInRange(entity.influence);
    expectFiniteInRange(entity.velocity);
    expectFiniteInRange(entity.stateRisk);
    expectFiniteInRange(entity.failureProbability);
    expectFiniteInRange(entity.riskScore);
    expectFiniteInRange(entity.localThreshold);
    expect(entity.history.length).toBeLessThanOrEqual(body.requestedSteps);
    expect(entity.history.map((historyItem) => historyItem.step)).toEqual(
      Array.from(
        { length: entity.history.length },
        (_, stepIndex) => stepIndex + 1,
      ),
    );

    for (const historyItem of entity.history) {
      expectFiniteInRange(historyItem.x);
      expectFiniteInRange(historyItem.y);
      expectFiniteInRange(historyItem.temperature);
      expectFiniteInRange(historyItem.influence);
      expectFiniteInRange(historyItem.velocity);
      expectFiniteInRange(historyItem.riskScore);
      expectFiniteInRange(historyItem.localThreshold);
    }

    if (entity.isFinished) {
      expect(TERMINAL_STATES.has(entity.currentState)).toBe(true);
      expect(TERMINAL_STATES.has(entity.history.at(-1)?.state ?? '')).toBe(
        true,
      );
    }
  }
}

function assertAnalysisBlocksAreFinite(body: SimulationResponse): void {
  expect(body.analysis).toBeDefined();

  if (!body.analysis) {
    throw new Error('Expected analysis block in response');
  }

  if (body.analysis.causal) {
    for (const comparison of body.analysis.causal.comparisons) {
      expect(Number.isFinite(comparison.baselineValue)).toBe(true);
      expect(Number.isFinite(comparison.treatedValue)).toBe(true);
      expect(Number.isFinite(comparison.estimatedEffect)).toBe(true);
      expect(['small', 'moderate', 'large']).toContain(
        comparison.effectStrengthLabel,
      );
    }
  }

  if (body.analysis.robust) {
    for (const score of body.analysis.robust.ranking) {
      expect(Number.isFinite(score.expectedScore)).toBe(true);
      expect(Number.isFinite(score.worstCaseScore)).toBe(true);
      expect(Number.isFinite(score.tailRiskScore)).toBe(true);
      expect(Number.isFinite(score.stabilityScore)).toBe(true);
      expect(Number.isFinite(score.robustScore)).toBe(true);
      expect(Number.isFinite(score.scoreGapFromBest)).toBe(true);
      expect(score.explanation.strongestFactors.length).toBeGreaterThan(0);
    }
  }

  if (body.analysis.uncertainty) {
    const intervals = Object.values(body.analysis.uncertainty.metrics) as Array<
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

    expect(body.analysis.uncertainty.notes.length).toBeGreaterThan(0);
  }
}

describe('Simulation controller (e2e)', () => {
  let app: INestApplication;
  let httpServer: Server;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        transform: true,
        whitelist: true,
        forbidNonWhitelisted: true,
      }),
    );
    await app.init();
    httpServer = app.getHttpServer() as Server;
  });

  afterEach(async () => {
    await app.close();
  });

  it('GET /simulation/scenarios returns available scenarios', async () => {
    const response = await request(httpServer)
      .get('/simulation/scenarios')
      .expect(200);

    const body: unknown = response.body;

    expect(Array.isArray(body)).toBe(true);

    if (!Array.isArray(body)) {
      throw new Error('Scenarios response must be an array');
    }

    expect(body[0]).toMatchObject({
      key: 'global-chaos-mvp',
    });
  });

  it('POST /simulation/run returns the expanded run response and satisfies core invariants', async () => {
    const body = await postSimulationRun(httpServer, {
      scenarioKey: 'global-chaos-mvp',
      entitiesCount: 10,
      steps: 3,
      mode: 'adaptive',
      seed: 12345,
      returnEntitiesLimit: 4,
    });

    expect(body.scenarioKey).toBe('global-chaos-mvp');
    expect(body.mode).toBe('adaptive');
    expect(body.profile).toBe('demo');
    expect(body.status).toBe('completed');
    expect(body.lastStep?.step).toBe(3);
    expect(body.entities).toHaveLength(4);
    expect(body.configSnapshot.storeTimeline).toBe(true);
    expect(body.debug.transitionMatrixValidated).toBe(true);
    expect(body.analysis).toBeUndefined();
    assertCoreRunInvariants(body);
  });

  it('latest and runs endpoints expose saved run records', async () => {
    const firstRunResponse = await request(httpServer)
      .post('/simulation/run')
      .send({
        scenarioKey: 'global-chaos-mvp',
        entitiesCount: 10,
        steps: 2,
        mode: 'baseline',
        seed: 101,
      })
      .expect(201);
    const secondRunResponse = await request(httpServer)
      .post('/simulation/run')
      .send({
        scenarioKey: 'global-chaos-mvp',
        entitiesCount: 12,
        steps: 4,
        mode: 'adaptive',
        seed: 202,
      })
      .expect(201);

    const firstBody: unknown = firstRunResponse.body;
    const secondBody: unknown = secondRunResponse.body;

    expect(isSimulationResponse(firstBody)).toBe(true);
    expect(isSimulationResponse(secondBody)).toBe(true);

    if (!isSimulationResponse(firstBody) || !isSimulationResponse(secondBody)) {
      throw new Error('POST /simulation/run returned an invalid response');
    }

    const latestResponse = await request(httpServer)
      .get('/simulation/latest')
      .expect(200);
    const latestBody: unknown = latestResponse.body;

    expect(isSimulationResponse(latestBody)).toBe(true);

    if (!isSimulationResponse(latestBody)) {
      throw new Error('GET /simulation/latest returned an invalid response');
    }

    expect(latestBody.runId).toBe(secondBody.runId);

    const listResponse = await request(httpServer)
      .get('/simulation/runs?limit=2')
      .expect(200);
    const listBody: unknown = listResponse.body;

    expect(Array.isArray(listBody)).toBe(true);

    if (!Array.isArray(listBody)) {
      throw new Error('GET /simulation/runs must return an array');
    }

    expect(listBody).toHaveLength(2);
    expect(isSimulationRunListItem(listBody[0])).toBe(true);
    expect(isSimulationRunListItem(listBody[1])).toBe(true);

    if (
      !isSimulationRunListItem(listBody[0]) ||
      !isSimulationRunListItem(listBody[1])
    ) {
      throw new Error('Run list item does not match SimulationRunListItem');
    }

    expect(listBody[0].runId).toBe(secondBody.runId);
    expect(listBody[1].runId).toBe(firstBody.runId);

    const byIdResponse = await request(httpServer)
      .get(`/simulation/runs/${firstBody.runId}`)
      .expect(200);
    const byIdBody: unknown = byIdResponse.body;

    expect(isSimulationResponse(byIdBody)).toBe(true);

    if (!isSimulationResponse(byIdBody)) {
      throw new Error(
        'GET /simulation/runs/:runId returned an invalid response',
      );
    }

    expect(byIdBody.runId).toBe(firstBody.runId);
  });

  it('terminal entities freeze after reaching terminal state', async () => {
    const response = await request(httpServer)
      .post('/simulation/run')
      .send({
        scenarioKey: 'global-chaos-mvp',
        entitiesCount: 10,
        steps: 6,
        mode: 'adaptive',
        seed: 1,
        returnEntitiesLimit: 10,
      })
      .expect(201);

    const body: unknown = response.body;

    expect(isSimulationResponse(body)).toBe(true);

    if (!isSimulationResponse(body)) {
      throw new Error('Run response does not match SimulationResponse');
    }

    const frozenEntity = body.entities.find(
      (entity) =>
        entity.isFinished && entity.history.length < body.requestedSteps,
    );

    expect(frozenEntity).toBeDefined();
    expect(frozenEntity?.action).toBe('no_action');
    expect(frozenEntity?.history.at(-1)?.action).toBe('no_action');
    expect(['failed', 'stabilized']).toContain(
      frozenEntity?.history.at(-1)?.state,
    );
    expect(
      frozenEntity?.history.map((historyItem) => historyItem.step),
    ).toEqual(
      Array.from(
        { length: frozenEntity?.history.length ?? 0 },
        (_, index) => index + 1,
      ),
    );
  });

  it('late event telemetry separates current and residual influence/velocity', async () => {
    const body = await postSimulationRun(httpServer, {
      scenarioKey: 'global-chaos-mvp',
      entitiesCount: 100,
      steps: 7,
      mode: 'adaptive',
      seed: 555,
      activeEventOverride: {
        intensity: 1,
        relevance: 1,
        scope: 1,
        x: 0.92,
        y: 0.92,
        duration: 1,
        startStep: 4,
      },
    });

    expect(body.steps[0].activeEventIntensity).toBe(0);
    expect(body.steps[0].avgCurrentInfluence).toBe(0);
    expect(body.steps[0].avgCurrentVelocity).toBe(0);
    expect(body.steps[3].activeEventIntensity).toBeGreaterThan(0);
    expect(body.steps[3].avgCurrentInfluence).toBeGreaterThan(0);
    expect(body.steps[3].avgCurrentVelocity).toBeGreaterThan(0);
    expect(body.steps[4].activeEventIntensity).toBe(0);
    expect(body.steps[4].avgCurrentInfluence).toBe(0);
    expect(body.steps[4].avgCurrentVelocity).toBe(0);
    expect(body.steps[4].avgResidualInfluence).toBeGreaterThan(0);
    expect(body.steps[4].avgResidualVelocity).toBeGreaterThan(0);
    assertCoreRunInvariants(body);
  });

  it('same seed is deterministic for repeated adaptive stress runs', async () => {
    for (const seed of [123, 321]) {
      const firstRun = await postSimulationRun(
        httpServer,
        createStrongStressPayload('adaptive', seed),
      );
      const secondRun = await postSimulationRun(
        httpServer,
        createStrongStressPayload('adaptive', seed),
      );

      assertCoreRunInvariants(firstRun);
      assertCoreRunInvariants(secondRun);
      expect(normalizeSimulationResponse(firstRun)).toEqual(
        normalizeSimulationResponse(secondRun),
      );
    }
  });

  it('fixed mode stays passive under strong stress', async () => {
    const body = await postSimulationRun(
      httpServer,
      createStrongStressPayload('fixed'),
    );

    assertCoreRunInvariants(body);
    expect(body.summary.actionCountTotal).toBe(0);
    expect(body.summary.watchCountTotal).toBe(0);
    expect(body.summary.notifyCountTotal).toBe(0);
    expect(body.summary.dampenCountTotal).toBe(0);
    expect(body.summary.actionCount).toBe(0);
    expect(body.summary.lastStepActionCount).toBe(0);
    expect(body.summary.finalGlobalThreshold).toBe(
      DEFAULT_SCENARIO.fixedThresholds.global,
    );

    for (const step of body.steps) {
      expect(step.actionsBreakdown.total).toBe(0);
      expect(step.actionsBreakdown.watch).toBe(0);
      expect(step.actionsBreakdown.notify).toBe(0);
      expect(step.actionsBreakdown.dampen).toBe(0);
      expect(step.systemAction).toBe('system_normal');
      expect(step.globalThreshold).toBe(
        DEFAULT_SCENARIO.fixedThresholds.global,
      );
      expect(countNonNoAction(step.actionDistribution)).toBe(0);
    }

    for (const entity of body.entities) {
      for (const historyItem of entity.history) {
        expect(historyItem.action).toBe('no_action');
        expect(historyItem.localThreshold).toBe(
          DEFAULT_SCENARIO.fixedThresholds.local,
        );
      }
    }
  });

  it('adaptive mode becomes active under strong stress', async () => {
    const body = await postSimulationRun(
      httpServer,
      createStrongStressPayload('adaptive'),
    );

    assertCoreRunInvariants(body);
    expect(body.summary.actionCountTotal).toBeGreaterThan(0);
    expect(body.summary.watchCountTotal).toBeGreaterThan(0);
    expect(body.summary.dampenCountTotal).toBeGreaterThan(0);
    expect(body.summary.notifyCountTotal).toBeGreaterThan(0);
    expect(body.steps.some((step) => step.actionsBreakdown.total > 0)).toBe(
      true,
    );
    expect(
      body.steps.some(
        (step) =>
          step.globalThreshold !== DEFAULT_SCENARIO.fixedThresholds.global,
      ),
    ).toBe(true);
    expect(
      body.entities.some((entity) =>
        entity.history.some(
          (historyItem) =>
            historyItem.localThreshold !==
            DEFAULT_SCENARIO.fixedThresholds.local,
        ),
      ),
    ).toBe(true);
  });

  it('adaptive and fixed diverge in trajectory under the same strong stress', async () => {
    const adaptiveBody = await postSimulationRun(
      httpServer,
      createStrongStressPayload('adaptive'),
    );
    const fixedBody = await postSimulationRun(
      httpServer,
      createStrongStressPayload('fixed'),
    );

    assertCoreRunInvariants(adaptiveBody);
    assertCoreRunInvariants(fixedBody);

    const stepTrajectoryDiverged = adaptiveBody.steps.some(
      (step, index) =>
        step.chaosIndex !== fixedBody.steps[index].chaosIndex ||
        step.avgTemperature !== fixedBody.steps[index].avgTemperature ||
        step.avgRiskScore !== fixedBody.steps[index].avgRiskScore ||
        step.avgCurrentInfluence !== fixedBody.steps[index].avgCurrentInfluence,
    );
    const summaryTrajectoryDiverged =
      adaptiveBody.summary.finalChaosIndex !==
        fixedBody.summary.finalChaosIndex ||
      adaptiveBody.summary.avgChaosIndex !== fixedBody.summary.avgChaosIndex ||
      adaptiveBody.summary.avgTemperature !==
        fixedBody.summary.avgTemperature ||
      adaptiveBody.summary.avgRiskScore !== fixedBody.summary.avgRiskScore ||
      adaptiveBody.summary.finalGlobalThreshold !==
        fixedBody.summary.finalGlobalThreshold ||
      adaptiveBody.summary.actionCountTotal !==
        fixedBody.summary.actionCountTotal;

    expect(stepTrajectoryDiverged || summaryTrajectoryDiverged).toBe(true);
    expect(adaptiveBody.summary.actionCountTotal).toBeGreaterThan(
      fixedBody.summary.actionCountTotal,
    );
  });

  it('adaptive and fixed diverge in terminal outcomes under the same strong stress', async () => {
    const adaptiveBody = await postSimulationRun(
      httpServer,
      createStrongStressPayload('adaptive'),
    );
    const fixedBody = await postSimulationRun(
      httpServer,
      createStrongStressPayload('fixed'),
    );

    assertCoreRunInvariants(adaptiveBody);
    assertCoreRunInvariants(fixedBody);
    expect(
      adaptiveBody.summary.stabilizedCount !==
        fixedBody.summary.stabilizedCount ||
        adaptiveBody.summary.failedCount !== fixedBody.summary.failedCount,
    ).toBe(true);
  });

  it('returns optional causal, robust, and uncertainty analysis without breaking the base contract', async () => {
    const withoutAnalysis = await postSimulationRun(httpServer, {
      scenarioKey: 'global-chaos-mvp',
      entitiesCount: 50,
      steps: 6,
      mode: 'adaptive',
      profile: 'stress',
      seed: 123,
      activeEventOverride: { ...STRONG_STRESS_OVERRIDE },
      returnEntitiesLimit: 8,
    });
    const withAnalysis = await postSimulationRun(httpServer, {
      scenarioKey: 'global-chaos-mvp',
      entitiesCount: 50,
      steps: 6,
      mode: 'adaptive',
      profile: 'stress',
      seed: 123,
      activeEventOverride: { ...STRONG_STRESS_OVERRIDE },
      returnEntitiesLimit: 8,
      analysisOptions: {
        causal: {
          enabled: true,
          targetMetric: 'failureRate',
        },
        robust: {
          enabled: true,
          objective: 'balanced_resilience',
        },
        uncertainty: {
          enabled: true,
          level: 0.95,
          method: 'calibrated_empirical_interval',
          resamples: 6,
        },
      },
    });

    assertCoreRunInvariants(withoutAnalysis);
    assertCoreRunInvariants(withAnalysis);
    assertAnalysisBlocksAreFinite(withAnalysis);
    expect(withoutAnalysis.analysis).toBeUndefined();
    expect(withAnalysis.analysis?.causal).toBeDefined();
    expect(withAnalysis.analysis?.robust).toBeDefined();
    expect(withAnalysis.analysis?.uncertainty).toBeDefined();
    expect(
      stripAnalysisResponse(normalizeSimulationResponse(withAnalysis)),
    ).toEqual(normalizeSimulationResponse(withoutAnalysis));
  });

  it('keeps analysis deterministic and keeps internal analysis reruns out of public run history', async () => {
    const analysisPayload: RunSimulationRequestPayload = {
      ...createStrongStressPayload('adaptive', 123),
      entitiesCount: 40,
      steps: 6,
      returnEntitiesLimit: 8,
      analysisOptions: {
        causal: {
          enabled: true,
          targetMetric: 'failureRate',
        },
        robust: {
          enabled: true,
          objective: 'balanced_resilience',
          scenarioCount: 6,
        },
        uncertainty: {
          enabled: true,
          level: 0.95,
          method: 'calibrated_empirical_interval',
          resamples: 6,
        },
      },
    };
    const firstRun = await postSimulationRun(httpServer, analysisPayload);
    const secondRun = await postSimulationRun(httpServer, analysisPayload);
    const latestResponse = await request(httpServer)
      .get('/simulation/latest')
      .expect(200);
    const runsResponse = await request(httpServer)
      .get('/simulation/runs?limit=10')
      .expect(200);
    const latestBody: unknown = latestResponse.body;
    const runsBody: unknown = runsResponse.body;

    expect(normalizeSimulationResponse(firstRun)).toEqual(
      normalizeSimulationResponse(secondRun),
    );
    expect(isSimulationResponse(latestBody)).toBe(true);
    expect(Array.isArray(runsBody)).toBe(true);

    if (!isSimulationResponse(latestBody) || !Array.isArray(runsBody)) {
      throw new Error('Analysis history endpoints returned invalid payload');
    }

    expect(latestBody.runId).toBe(secondRun.runId);
    expect(runsBody).toHaveLength(2);
    expect(
      runsBody.every(
        (run) => isSimulationRunListItem(run) && run.status === 'completed',
      ),
    ).toBe(true);
  });
});
