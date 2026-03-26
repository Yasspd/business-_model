import { Injectable } from '@nestjs/common';
import { Entity } from '../simulation/types/entity.type';
import { Event } from '../simulation/types/event.type';
import { clamp, distance2D } from './math.util';

@Injectable()
export class PositionEngine {
  findPrimaryActiveEvent(step: number, events: Event[]): Event | null {
    return (
      events.find(
        (event) =>
          event.isActive &&
          step >= event.startStep &&
          step < event.startStep + event.duration,
      ) ?? null
    );
  }

  computeInfluence(entity: Entity, activeEvent: Event | null): number {
    if (!activeEvent) {
      return 0;
    }

    const distance = distance2D(entity.x, entity.y, activeEvent.x, activeEvent.y);

    return clamp(
      (activeEvent.intensity *
        entity.relevance *
        activeEvent.relevance *
        activeEvent.scope) /
        (1 + distance),
      0,
      1,
    );
  }

  updatePosition(
    entity: Entity,
    activeEvent: Event | null,
    influence: number,
  ): { x: number; y: number } {
    if (!activeEvent) {
      return {
        x: entity.x,
        y: entity.y,
      };
    }

    return {
      x: clamp(
        entity.x + entity.sensitivity * influence * (activeEvent.x - entity.x),
        0,
        1,
      ),
      y: clamp(
        entity.y + entity.sensitivity * influence * (activeEvent.y - entity.y),
        0,
        1,
      ),
    };
  }

  computeVelocity(
    currentX: number,
    currentY: number,
    nextX: number,
    nextY: number,
  ): number {
    const rawVelocity = Math.sqrt(
      (nextX - currentX) ** 2 + (nextY - currentY) ** 2,
    );

    return clamp(rawVelocity, 0, 1);
  }

  updateTemperature(currentTemperature: number, influence: number): number {
    return clamp(0.7 * currentTemperature + 0.3 * influence, 0, 1);
  }
}
