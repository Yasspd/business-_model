import { RunSimulationDto } from '../simulation/dto/run-simulation.dto';
import { Entity } from '../simulation/types/entity.type';
import { SimulationResponse } from '../simulation/types/simulation-response.type';

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

export function normalizeSimulationResponse(response: SimulationResponse) {
  const stableResponse = structuredClone(response);

  Reflect.deleteProperty(stableResponse, 'runId');
  Reflect.deleteProperty(stableResponse, 'startedAt');
  Reflect.deleteProperty(stableResponse, 'finishedAt');

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
