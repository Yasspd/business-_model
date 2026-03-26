import { Injectable } from '@nestjs/common';
import {
  LocalAction,
  Mode,
  SystemAction,
} from '../simulation/types/action-mode.type';
import { Entity } from '../simulation/types/entity.type';
import { Event } from '../simulation/types/event.type';
import { clamp } from './math.util';

@Injectable()
export class ActionEngine {
  decideEntityAction(
    entity: Pick<Entity, 'riskScore' | 'localThreshold' | 'currentState'>,
  ): LocalAction {
    if (entity.riskScore > entity.localThreshold) {
      if (
        entity.currentState === 'critical' ||
        entity.currentState === 'reactive'
      ) {
        return 'dampen';
      }

      return 'notify';
    }

    if (entity.riskScore > entity.localThreshold - 0.08) {
      return 'watch';
    }

    return 'no_action';
  }

  decideSystemAction(
    chaosIndex: number,
    globalThreshold: number,
  ): SystemAction {
    if (chaosIndex > globalThreshold) {
      if (chaosIndex >= 0.8) {
        return 'stabilize_system';
      }

      return 'rebalance_attention';
    }

    return 'system_normal';
  }

  applyLocalActionEffects(entity: Entity, mode: Mode): void {
    if (mode === 'baseline') {
      return;
    }

    if (entity.action === 'dampen') {
      entity.temperature = clamp(entity.temperature - 0.12, 0, 1);
      entity.influence = clamp(entity.influence - 0.1, 0, 1);
      return;
    }

    if (entity.action === 'notify') {
      entity.temperature = clamp(entity.temperature - 0.05, 0, 1);
    }
  }

  applySystemActionEffects(
    systemAction: SystemAction,
    mode: Mode,
    entities: Entity[],
    activeEvent: Event | null,
  ): void {
    if (mode === 'baseline') {
      return;
    }

    if (systemAction === 'rebalance_attention' && activeEvent) {
      activeEvent.intensity = clamp(activeEvent.intensity - 0.05, 0.1, 1);
      return;
    }

    if (systemAction === 'stabilize_system') {
      if (activeEvent) {
        activeEvent.intensity = clamp(activeEvent.intensity - 0.1, 0.1, 1);
      }

      for (const entity of entities) {
        entity.temperature = clamp(entity.temperature - 0.05, 0, 1);
      }
    }
  }
}
