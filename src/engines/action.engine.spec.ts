import { createEntity } from '../testing/simulation-test.helper';
import { ActionEngine } from './action.engine';

describe('ActionEngine', () => {
  let engine: ActionEngine;

  beforeEach(() => {
    engine = new ActionEngine();
  });

  it('selects deterministic actions around threshold cutoffs', () => {
    expect(
      engine.decideEntityAction({
        riskScore: 0.71,
        localThreshold: 0.7,
        currentState: 'reactive',
      }),
    ).toBe('dampen');
    expect(
      engine.decideEntityAction({
        riskScore: 0.71,
        localThreshold: 0.7,
        currentState: 'interested',
      }),
    ).toBe('notify');
    expect(
      engine.decideEntityAction({
        riskScore: 0.63,
        localThreshold: 0.7,
        currentState: 'calm',
      }),
    ).toBe('watch');
    expect(
      engine.decideEntityAction({
        riskScore: 0.62,
        localThreshold: 0.7,
        currentState: 'calm',
      }),
    ).toBe('no_action');
  });

  it('keeps neutral actions neutral and distinguishes notify from dampen effects', () => {
    expect(engine.getLocalActionEffect('no_action')).toEqual({
      temperatureDelta: 0,
      influenceDelta: 0,
    });
    expect(engine.getLocalActionEffect('watch')).toEqual({
      temperatureDelta: 0,
      influenceDelta: 0,
    });
    expect(engine.getLocalActionEffect('notify')).toEqual({
      temperatureDelta: -0.05,
      influenceDelta: 0,
    });
    expect(engine.getLocalActionEffect('dampen')).toEqual({
      temperatureDelta: -0.12,
      influenceDelta: -0.1,
    });
  });

  it('applies local action effects with clamping and baseline guard', () => {
    const dampenedEntity = createEntity({
      temperature: 0.2,
      influence: 0.15,
      action: 'dampen',
    });
    const notifiedEntity = createEntity({
      id: 'entity-2',
      temperature: 0.04,
      influence: 0.35,
      action: 'notify',
    });
    const baselineEntity = createEntity({
      id: 'entity-3',
      temperature: 0.45,
      influence: 0.25,
      action: 'dampen',
    });

    engine.applyLocalActionEffects(dampenedEntity, 'adaptive');
    engine.applyLocalActionEffects(notifiedEntity, 'adaptive');
    engine.applyLocalActionEffects(baselineEntity, 'baseline');

    expect(dampenedEntity.temperature).toBeCloseTo(0.08);
    expect(dampenedEntity.influence).toBeCloseTo(0.05);
    expect(notifiedEntity.temperature).toBe(0);
    expect(notifiedEntity.influence).toBe(0.35);
    expect(baselineEntity.temperature).toBe(0.45);
    expect(baselineEntity.influence).toBe(0.25);
  });

  it('applies system action effects predictably and respects clamps', () => {
    const entities = [
      createEntity({ temperature: 0.03 }),
      createEntity({ id: 'entity-2', temperature: 0.4 }),
    ];
    const event = {
      id: 'event-1',
      name: 'event',
      type: 'trend' as const,
      x: 0.5,
      y: 0.5,
      intensity: 0.12,
      severity: 0.7,
      relevance: 0.9,
      scope: 0.8,
      duration: 3,
      startStep: 1,
      isActive: true,
    };
    const baselineEvent = {
      ...event,
      id: 'event-2',
      intensity: 0.3,
    };

    engine.applySystemActionEffects(
      'stabilize_system',
      'adaptive',
      entities,
      event,
    );
    engine.applySystemActionEffects(
      'rebalance_attention',
      'adaptive',
      [],
      baselineEvent,
    );
    engine.applySystemActionEffects(
      'stabilize_system',
      'baseline',
      entities,
      baselineEvent,
    );

    expect(event.intensity).toBe(0.1);
    expect(entities[0].temperature).toBe(0);
    expect(entities[1].temperature).toBeCloseTo(0.35);
    expect(baselineEvent.intensity).toBeCloseTo(0.25);
  });
});
