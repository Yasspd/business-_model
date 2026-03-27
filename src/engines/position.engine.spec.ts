import {
  createEntity,
  expectFiniteInRange,
} from '../testing/simulation-test.helper';
import { Event } from '../simulation/types/event.type';
import { PositionEngine } from './position.engine';

describe('PositionEngine', () => {
  let engine: PositionEngine;

  beforeEach(() => {
    engine = new PositionEngine();
  });

  function createEvent(overrides: Partial<Event> = {}): Event {
    return {
      id: overrides.id ?? 'event-1',
      name: overrides.name ?? 'event',
      type: overrides.type ?? 'trend',
      x: overrides.x ?? 0.8,
      y: overrides.y ?? 0.6,
      intensity: overrides.intensity ?? 0.8,
      severity: overrides.severity ?? 0.7,
      relevance: overrides.relevance ?? 0.6,
      scope: overrides.scope ?? 0.7,
      duration: overrides.duration ?? 3,
      startStep: overrides.startStep ?? 2,
      isActive: overrides.isActive ?? true,
    };
  }

  it('finds the active primary event only inside its valid step range', () => {
    const firstEvent = createEvent({
      id: 'inactive',
      isActive: false,
    });
    const secondEvent = createEvent({
      id: 'active',
      startStep: 2,
      duration: 3,
      isActive: true,
    });

    expect(
      engine.findPrimaryActiveEvent(1, [firstEvent, secondEvent]),
    ).toBeNull();
    expect(
      engine.findPrimaryActiveEvent(2, [firstEvent, secondEvent])?.id,
    ).toBe('active');
    expect(
      engine.findPrimaryActiveEvent(4, [firstEvent, secondEvent])?.id,
    ).toBe('active');
    expect(
      engine.findPrimaryActiveEvent(5, [firstEvent, secondEvent]),
    ).toBeNull();
  });

  it('computes influence predictably, incorporates noise and decays with distance', () => {
    const entity = createEntity({
      x: 0,
      y: 0,
      relevance: 0.5,
    });
    const activeEvent = createEvent({
      x: 0.3,
      y: 0.4,
      intensity: 0.8,
      relevance: 0.6,
      scope: 0.7,
    });
    const closerEntity = createEntity({
      id: 'entity-close',
      x: 0.28,
      y: 0.38,
      relevance: 0.5,
    });
    const fartherEntity = createEntity({
      id: 'entity-far',
      x: 0.9,
      y: 0.9,
      relevance: 0.5,
    });

    expect(engine.computeInfluence(entity, null)).toBe(0);
    expect(engine.computeInfluence(entity, activeEvent)).toBeCloseTo(0.112);
    expect(engine.computeInfluence(entity, activeEvent, 0.05)).toBeCloseTo(
      0.162,
    );
    expect(engine.computeInfluence(entity, activeEvent, 5)).toBe(1);
    expect(engine.computeInfluence(closerEntity, activeEvent)).toBeGreaterThan(
      engine.computeInfluence(fartherEntity, activeEvent),
    );
  });

  it('updates position toward the event and respects sensitivity multiplier and clamps', () => {
    const entity = createEntity({
      x: 0.2,
      y: 0.2,
      sensitivity: 0.5,
    });
    const activeEvent = createEvent({
      x: 0.8,
      y: 0.6,
    });

    expect(engine.updatePosition(entity, null, 0.4)).toEqual({
      x: 0.2,
      y: 0.2,
    });
    const nextPosition = engine.updatePosition(entity, activeEvent, 0.4);
    const amplifiedPosition = engine.updatePosition(
      entity,
      activeEvent,
      0.4,
      2,
    );

    expect(nextPosition.x).toBeCloseTo(0.32);
    expect(nextPosition.y).toBeCloseTo(0.28);
    expect(amplifiedPosition.x).toBeCloseTo(0.44);
    expect(amplifiedPosition.y).toBeCloseTo(0.36);
    expect(
      engine.updatePosition(
        createEntity({
          id: 'entity-clamp',
          x: 0.95,
          y: 0.98,
          sensitivity: 1,
        }),
        createEvent({
          x: 2,
          y: 2,
        }),
        1,
        5,
      ),
    ).toEqual({
      x: 1,
      y: 1,
    });
  });

  it('computes velocity as Euclidean distance and clamps it to one', () => {
    expect(engine.computeVelocity(0, 0, 0.3, 0.4)).toBeCloseTo(0.5);
    expect(engine.computeVelocity(0, 0, 2, 2)).toBe(1);
  });

  it('updates temperature by the production formula and clamps bounds', () => {
    expect(engine.updateTemperature(0.4, 0.8)).toBeCloseTo(0.52);
    expect(engine.updateTemperature(1, 5)).toBe(1);
    expectFiniteInRange(engine.updateTemperature(0.2, 0.7), 0, 1);
  });
});
