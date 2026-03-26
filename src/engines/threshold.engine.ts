import { Injectable } from '@nestjs/common';
import { Entity } from '../simulation/types/entity.type';
import {
  AdaptiveThresholdConfig,
  EntitySegment,
  FixedThresholdConfig,
} from '../simulation/types/scenario-config.type';
import { Mode } from '../simulation/types/action-mode.type';
import { clamp, mean, std } from './math.util';

@Injectable()
export class ThresholdEngine {
  computeLocalThresholds(
    entities: Entity[],
    mode: Mode,
    fixedThresholds: FixedThresholdConfig,
    adaptiveThresholds: AdaptiveThresholdConfig,
  ): Map<string, number> {
    const thresholds = new Map<string, number>();

    if (mode === 'fixed') {
      for (const entity of entities) {
        thresholds.set(entity.id, fixedThresholds.local);
      }

      return thresholds;
    }

    const segments: EntitySegment[] = ['stable', 'regular', 'reactive'];

    for (const segment of segments) {
      const segmentEntities = entities.filter(
        (entity) => entity.segment === segment,
      );
      const riskScores = segmentEntities.map((entity) => entity.riskScore);
      const muSegment = mean(riskScores);
      const sigmaSegment = std(riskScores);
      const localThreshold = clamp(
        muSegment + adaptiveThresholds.localSigmaMultiplier * sigmaSegment,
        adaptiveThresholds.localMin,
        adaptiveThresholds.localMax,
      );

      for (const entity of segmentEntities) {
        thresholds.set(entity.id, localThreshold);
      }
    }

    return thresholds;
  }

  computeGlobalThreshold(
    chaosHistory: number[],
    mode: Mode,
    fixedThresholds: FixedThresholdConfig,
    adaptiveThresholds: AdaptiveThresholdConfig,
  ): number {
    if (mode === 'fixed') {
      return fixedThresholds.global;
    }

    const muChaos = mean(chaosHistory);
    const sigmaChaos = std(chaosHistory);

    return clamp(
      muChaos + adaptiveThresholds.globalSigmaMultiplier * sigmaChaos,
      adaptiveThresholds.globalMin,
      adaptiveThresholds.globalMax,
    );
  }
}
