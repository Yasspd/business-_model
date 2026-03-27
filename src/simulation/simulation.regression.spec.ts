import { TestingModule, Test } from '@nestjs/testing';
import { AppModule } from '../app.module';
import {
  countNonNoAction,
  createStrongStressRunDto,
  expectFiniteInRange,
  normalizeSimulationResponse,
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
    }

    for (const entity of response.entities) {
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

  it('preserves invariants across a compact profile/mode/seed matrix', () => {
    const profiles = ['demo', 'realistic', 'stress'] as const;
    const modes = ['fixed', 'adaptive'] as const;
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
          }
        }
      }
    }
  });

  it('remains deterministic for repeated runs with the same seed', () => {
    const profiles = ['demo', 'realistic', 'stress'] as const;
    const modes = ['fixed', 'adaptive'] as const;
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
});
