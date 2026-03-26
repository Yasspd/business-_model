import { Injectable } from '@nestjs/common';
import {
  Mode,
  SystemAction,
} from '../simulation/types/action-mode.type';
import { Entity } from '../simulation/types/entity.type';
import { Event } from '../simulation/types/event.type';
import {
  ChaosIndexBreakdown,
  SimulationStepItem,
  SimulationSummary,
} from '../simulation/types/simulation-response.type';
import { ChaosIndexWeights } from '../simulation/types/scenario-config.type';
import { clamp, distance2D, mean } from './math.util';

export interface StepMetricsSnapshot {
  avgTemperature: number;
  avgVelocity: number;
  clusterDensity: number;
  hotShare: number;
  failureProximity: number;
  chaosIndex: number;
  breakdown?: ChaosIndexBreakdown;
}

@Injectable()
export class MetricsEngine {
  computeAvgTemperature(entities: Entity[]): number {
    return mean(entities.map((entity) => entity.temperature));
  }

  computeAvgVelocity(entities: Entity[]): number {
    return mean(entities.map((entity) => entity.velocity));
  }

  computeClusterDensity(
    entities: Entity[],
    activeEvent: Event | null,
    clusterRadius: number,
  ): number {
    if (!activeEvent || entities.length === 0) {
      return 0;
    }

    const clusterCount = entities.filter(
      (entity) =>
        distance2D(entity.x, entity.y, activeEvent.x, activeEvent.y) <=
        clusterRadius,
    ).length;

    return clusterCount / entities.length;
  }

  computeHotShare(entities: Entity[], hotTemperatureThreshold: number): number {
    if (entities.length === 0) {
      return 0;
    }

    const hotCount = entities.filter(
      (entity) => entity.temperature >= hotTemperatureThreshold,
    ).length;

    return hotCount / entities.length;
  }

  computeFailureProximity(entities: Entity[]): number {
    return mean(entities.map((entity) => entity.failureProbability));
  }

  computeChaosIndex(
    snapshot: Omit<StepMetricsSnapshot, 'chaosIndex' | 'breakdown'>,
    weights: ChaosIndexWeights,
  ): number {
    return clamp(
      weights.avgTemperature * snapshot.avgTemperature +
        weights.avgVelocity * snapshot.avgVelocity +
        weights.clusterDensity * snapshot.clusterDensity +
        weights.hotShare * snapshot.hotShare +
        weights.failureProximity * snapshot.failureProximity,
      0,
      1,
    );
  }

  computeStepMetrics(
    entities: Entity[],
    activeEvent: Event | null,
    clusterRadius: number,
    hotTemperatureThreshold: number,
    weights: ChaosIndexWeights,
    mode: Mode,
  ): StepMetricsSnapshot {
    const snapshot = {
      avgTemperature: this.computeAvgTemperature(entities),
      avgVelocity: this.computeAvgVelocity(entities),
      clusterDensity: this.computeClusterDensity(
        entities,
        activeEvent,
        clusterRadius,
      ),
      hotShare: this.computeHotShare(entities, hotTemperatureThreshold),
      failureProximity: this.computeFailureProximity(entities),
    };
    const chaosIndex = this.computeChaosIndex(snapshot, weights);

    if (mode !== 'hybrid') {
      return {
        ...snapshot,
        chaosIndex,
      };
    }

    return {
      ...snapshot,
      chaosIndex,
      breakdown: {
        avgTemperature: snapshot.avgTemperature,
        avgVelocity: snapshot.avgVelocity,
        clusterDensity: snapshot.clusterDensity,
        hotShare: snapshot.hotShare,
        failureProximity: snapshot.failureProximity,
        weightedAvgTemperature: weights.avgTemperature * snapshot.avgTemperature,
        weightedAvgVelocity: weights.avgVelocity * snapshot.avgVelocity,
        weightedClusterDensity:
          weights.clusterDensity * snapshot.clusterDensity,
        weightedHotShare: weights.hotShare * snapshot.hotShare,
        weightedFailureProximity:
          weights.failureProximity * snapshot.failureProximity,
      },
    };
  }

  computeStateDistribution(entities: Entity[]): Record<string, number> {
    return entities.reduce<Record<string, number>>((distribution, entity) => {
      distribution[entity.currentState] =
        (distribution[entity.currentState] ?? 0) + 1;
      return distribution;
    }, {});
  }

  computeActionDistribution(entities: Entity[]): Record<string, number> {
    return entities.reduce<Record<string, number>>((distribution, entity) => {
      distribution[entity.action] = (distribution[entity.action] ?? 0) + 1;
      return distribution;
    }, {});
  }

  buildStepItem(
    step: number,
    metrics: StepMetricsSnapshot,
    globalThreshold: number,
    systemAction: SystemAction,
    activeEventIntensity: number,
    entities: Entity[],
  ): SimulationStepItem {
    return {
      step,
      avgTemperature: metrics.avgTemperature,
      avgVelocity: metrics.avgVelocity,
      clusterDensity: metrics.clusterDensity,
      hotShare: metrics.hotShare,
      failureProximity: metrics.failureProximity,
      chaosIndex: metrics.chaosIndex,
      globalThreshold,
      systemAction,
      activeEventIntensity,
      stateDistribution: this.computeStateDistribution(entities),
      actionDistribution: this.computeActionDistribution(entities),
      breakdown: metrics.breakdown,
    };
  }

  buildFinalSummary(
    entities: Entity[],
    steps: SimulationStepItem[],
    hotTemperatureThreshold: number,
  ): SimulationSummary {
    const totalEntities = entities.length;
    const stabilizedCount = entities.filter(
      (entity) => entity.currentState === 'stabilized',
    ).length;
    const failedCount = entities.filter(
      (entity) => entity.currentState === 'failed',
    ).length;
    const actionCount = entities.filter(
      (entity) => entity.action !== 'no_action',
    ).length;
    const hotEntities = entities.filter(
      (entity) => entity.temperature >= hotTemperatureThreshold,
    ).length;
    const lastStep = steps[steps.length - 1];

    return {
      totalEntities,
      finishedEntities: entities.filter((entity) => entity.isFinished).length,
      stabilizedCount,
      failedCount,
      actionCount,
      hotEntities,
      conversionRate: totalEntities === 0 ? 0 : stabilizedCount / totalEntities,
      failureRate: totalEntities === 0 ? 0 : failedCount / totalEntities,
      avgTemperature: this.computeAvgTemperature(entities),
      avgRiskScore: mean(entities.map((entity) => entity.riskScore)),
      avgFailureProbability: this.computeFailureProximity(entities),
      finalChaosIndex: lastStep?.chaosIndex ?? 0,
      finalGlobalThreshold: lastStep?.globalThreshold ?? 0,
      finalSystemAction: lastStep?.systemAction ?? 'system_normal',
    };
  }
}
