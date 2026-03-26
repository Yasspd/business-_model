import { Injectable } from '@nestjs/common';
import {
  LocalAction,
  Mode,
  SystemAction,
} from '../simulation/types/action-mode.type';
import { Entity } from '../simulation/types/entity.type';
import { Event } from '../simulation/types/event.type';
import { clamp } from './math.util';

export interface LocalActionEffect {
  temperatureDelta: number;
  influenceDelta: number;
}

export interface SystemActionEffect {
  eventIntensityDelta: number;
  entityTemperatureDelta: number;
}

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

  getLocalActionEffect(action: LocalAction): LocalActionEffect {
    if (action === 'dampen') {
      return {
        temperatureDelta: -0.12,
        influenceDelta: -0.1,
      };
    }

    if (action === 'notify') {
      return {
        temperatureDelta: -0.05,
        influenceDelta: 0,
      };
    }

    return {
      temperatureDelta: 0,
      influenceDelta: 0,
    };
  }

  getSystemActionEffect(systemAction: SystemAction): SystemActionEffect {
    if (systemAction === 'rebalance_attention') {
      return {
        eventIntensityDelta: -0.05,
        entityTemperatureDelta: 0,
      };
    }

    if (systemAction === 'stabilize_system') {
      return {
        eventIntensityDelta: -0.1,
        entityTemperatureDelta: -0.05,
      };
    }

    return {
      eventIntensityDelta: 0,
      entityTemperatureDelta: 0,
    };
  }

  applyLocalActionEffects(entity: Entity, mode: Mode, share = 1): void {
    if (mode === 'baseline' || share <= 0) {
      return;
    }

    const effect = this.getLocalActionEffect(entity.action);
    entity.temperature = clamp(
      entity.temperature + effect.temperatureDelta * share,
      0,
      1,
    );
    entity.influence = clamp(
      entity.influence + effect.influenceDelta * share,
      0,
      1,
    );
  }

  applySystemActionEffects(
    systemAction: SystemAction,
    mode: Mode,
    entities: Entity[],
    activeEvent: Event | null,
    share = 1,
  ): void {
    if (mode === 'baseline' || share <= 0) {
      return;
    }

    const effect = this.getSystemActionEffect(systemAction);

    if (activeEvent && effect.eventIntensityDelta !== 0) {
      activeEvent.intensity = clamp(
        activeEvent.intensity + effect.eventIntensityDelta * share,
        0.1,
        1,
      );
    }

    if (effect.entityTemperatureDelta !== 0) {
      for (const entity of entities) {
        entity.temperature = clamp(
          entity.temperature + effect.entityTemperatureDelta * share,
          0,
          1,
        );
      }
    }
  }
}
