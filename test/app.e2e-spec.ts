import type { Server } from 'node:http';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from './../src/app.module';
import type { SimulationResponse } from './../src/simulation/types/simulation-response.type';

function isSimulationResponse(value: unknown): value is SimulationResponse {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const candidate = value as Partial<SimulationResponse>;

  return (
    typeof candidate.scenarioKey === 'string' &&
    typeof candidate.mode === 'string' &&
    typeof candidate.seed === 'number' &&
    typeof candidate.summary === 'object' &&
    Array.isArray(candidate.steps) &&
    Array.isArray(candidate.entities) &&
    typeof candidate.debug === 'object'
  );
}

describe('SimulationController (e2e)', () => {
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

  it('/simulation/scenarios (GET)', () => {
    return request(httpServer)
      .get('/simulation/scenarios')
      .expect(200)
      .expect([
        {
          key: 'global-chaos-mvp',
          name: 'Global Chaos MVP',
        },
      ]);
  });

  it('/simulation/run (POST)', async () => {
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
      throw new Error('Response body is not a valid simulation response');
    }

    expect(body.scenarioKey).toBe('global-chaos-mvp');
    expect(body.mode).toBe('adaptive');
    expect(body.seed).toBe(12345);
    expect(body.summary.totalEntities).toBe(10);
    expect(body.steps).toHaveLength(3);
    expect(body.entities).toHaveLength(4);
    expect(body.debug.transitionMatrixValidated).toBe(true);
  });
});
