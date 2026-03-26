import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from './../src/app.module';

describe('SimulationController (e2e)', () => {
  let app: INestApplication;

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
  });

  afterEach(async () => {
    await app.close();
  });

  it('/simulation/scenarios (GET)', () => {
    return request(app.getHttpServer())
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
    const response = await request(app.getHttpServer())
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

    expect(response.body.scenarioKey).toBe('global-chaos-mvp');
    expect(response.body.mode).toBe('adaptive');
    expect(response.body.seed).toBe(12345);
    expect(response.body.summary.totalEntities).toBe(10);
    expect(response.body.steps).toHaveLength(3);
    expect(response.body.entities).toHaveLength(4);
    expect(response.body.debug.transitionMatrixValidated).toBe(true);
  });
});
