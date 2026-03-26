import type { Server } from 'node:http';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from './../src/app.module';
import type {
  SimulationResponse,
  SimulationRunListItem,
  SimulationStepItem,
} from './../src/simulation/types/simulation-response.type';

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

  it('GET /simulation/scenarios возвращает список сценариев', () => {
    return request(httpServer)
      .get('/simulation/scenarios')
      .expect(200)
      .expect([
        {
          key: 'global-chaos-mvp',
          name: 'Глобальный хаос MVP',
        },
      ]);
  });

  it('POST /simulation/run возвращает расширенный run response и сохраняет summary/lastStep', async () => {
    const response = await request(httpServer)
      .post('/simulation/run')
      .send({
        scenarioKey: 'global-chaos-mvp',
        entitiesCount: 10,
        steps: 3,
        mode: 'adaptive',
        seed: 12345,
        returnEntitiesLimit: 4,
      })
      .expect(201);

    const body: unknown = response.body;

    expect(isSimulationResponse(body)).toBe(true);

    if (!isSimulationResponse(body)) {
      throw new Error(
        'Тело ответа не соответствует формату SimulationResponse',
      );
    }

    expect(body.scenarioKey).toBe('global-chaos-mvp');
    expect(body.mode).toBe('adaptive');
    expect(body.profile).toBe('demo');
    expect(body.seed).toBe(12345);
    expect(body.status).toBe('completed');
    expect(body.summary.totalEntities).toBe(10);
    expect(body.summary.finishedEntities).toBe(
      body.summary.stabilizedCount + body.summary.failedCount,
    );
    expect(body.summary.actionCount).toBe(body.summary.lastStepActionCount);
    expect(body.summary.maxChaosIndex).toBeGreaterThanOrEqual(
      body.summary.finalChaosIndex,
    );
    expect(body.lastStep?.step).toBe(3);
    expect(body.steps).toHaveLength(3);
    expect(body.entities).toHaveLength(4);
    expect(body.configSnapshot.storeTimeline).toBe(true);
    expect(body.debug.transitionMatrixValidated).toBe(true);
  });

  it('GET /simulation/latest и /simulation/runs возвращают сохранённые run records', async () => {
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
      throw new Error('Ответ POST /simulation/run имеет неверный формат');
    }

    const latestResponse = await request(httpServer)
      .get('/simulation/latest')
      .expect(200);
    const latestBody: unknown = latestResponse.body;

    expect(isSimulationResponse(latestBody)).toBe(true);

    if (!isSimulationResponse(latestBody)) {
      throw new Error('Ответ GET /simulation/latest имеет неверный формат');
    }

    expect(latestBody.runId).toBe(secondBody.runId);

    const listResponse = await request(httpServer)
      .get('/simulation/runs?limit=2')
      .expect(200);
    const listBody: unknown = listResponse.body;

    expect(Array.isArray(listBody)).toBe(true);

    if (!Array.isArray(listBody)) {
      throw new Error('Ответ GET /simulation/runs должен быть массивом');
    }

    expect(listBody).toHaveLength(2);
    expect(isSimulationRunListItem(listBody[0])).toBe(true);
    expect(isSimulationRunListItem(listBody[1])).toBe(true);

    if (
      !isSimulationRunListItem(listBody[0]) ||
      !isSimulationRunListItem(listBody[1])
    ) {
      throw new Error('Элемент списка run records имеет неверный формат');
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
        'Ответ GET /simulation/runs/:runId имеет неверный формат',
      );
    }

    expect(byIdBody.runId).toBe(firstBody.runId);
    expect(byIdBody.summary.totalEntities).toBe(10);
  });

  it('terminal entities freeze after terminal state and stop extending history', async () => {
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
      throw new Error(
        'Тело ответа не соответствует формату SimulationResponse',
      );
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
    expect(body.lastStep?.cumulativeFinished).toBe(
      body.summary.finishedEntities,
    );
  });

  it('realistic profile and activeEventOverride are reflected in telemetry', async () => {
    const response = await request(httpServer)
      .post('/simulation/run')
      .send({
        scenarioKey: 'global-chaos-mvp',
        entitiesCount: 20,
        steps: 5,
        mode: 'hybrid',
        profile: 'realistic',
        seed: 303,
        activeEventOverride: {
          intensity: 1,
          scope: 1,
          relevance: 1,
          duration: 2,
          startStep: 1,
        },
      })
      .expect(201);

    const body: unknown = response.body;

    expect(isSimulationResponse(body)).toBe(true);

    if (!isSimulationResponse(body)) {
      throw new Error(
        'Тело ответа не соответствует формату SimulationResponse',
      );
    }

    expect(body.profile).toBe('realistic');
    expect(body.configSnapshot.visualHotThreshold).toBeCloseTo(0.62, 5);
    expect(body.summary.maxTemperature).toBeGreaterThanOrEqual(
      body.summary.avgTemperature,
    );
    expect(
      body.steps.some(
        (step) =>
          step.eventSnapshot?.phase === 'aftershock' &&
          step.eventSnapshot.intensity > 0,
      ),
    ).toBe(true);
    expect(
      body.steps.every((step) => typeof step.avgInfluence === 'number'),
    ).toBe(true);
  });
});
