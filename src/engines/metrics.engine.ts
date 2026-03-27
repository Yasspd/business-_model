import { Injectable } from '@nestjs/common';
import { Entity } from '../simulation/types/entity.type';
import { EventSnapshot } from '../simulation/types/event.type';
import {
  ActionsBreakdown,
  ChaosIndexBreakdown,
  SimulationStepItem,
  SimulationSummary,
} from '../simulation/types/simulation-response.type';
import { SystemAction } from '../simulation/types/action-mode.type';
import { ChaosIndexWeights } from '../simulation/types/scenario-config.type';
import { clamp, distance2D, mean } from './math.util';

export interface StepMetricsSnapshot {
  avgTemperature: number;
  avgInfluence: number;
  avgVelocity: number;
  avgCurrentInfluence: number;
  avgResidualInfluence: number;
  avgCurrentVelocity: number;
  avgResidualVelocity: number;
  avgRiskScore: number;
  avgFailureProbability: number;
  clusterDensity: number;
  hotShare: number;
  hotEntities: number;
  hotActiveEntities: number;
  failureProximity: number;
  chaosIndex: number;
  maxTemperature: number;
  breakdown?: ChaosIndexBreakdown;
}

export interface BuildStepItemOptions {
  step: number;
  metrics: StepMetricsSnapshot;
  globalThreshold: number;
  systemAction: SystemAction;
  activeEventIntensity: number;
  eventSnapshot: EventSnapshot | null;
  entities: Entity[];
  activeEntities: Entity[];
  finishedThisStep: number;
  stabilizedThisStep: number;
  failedThisStep: number;
  cumulativeFinished: number;
  cumulativeStabilized: number;
  cumulativeFailed: number;
}

export interface BuildSummaryOptions {
  entities: Entity[];
  steps: SimulationStepItem[];
  systemHotThreshold: number;
  hotEntitiesTotal: number;
  maxHotEntities: number;
  maxTemperature: number;
  actionTotals: ActionsBreakdown;
}

@Injectable()
export class MetricsEngine {
  computeAvgTemperature(entities: Entity[]): number {
    return mean(entities.map((entity) => entity.temperature));
  }

  computeAvgInfluence(entities: Entity[]): number {
    return mean(entities.map((entity) => entity.influence));
  }

  computeAvgVelocity(entities: Entity[]): number {
    return mean(entities.map((entity) => entity.velocity));
  }

  computeResidualEntities(
    entities: Entity[],
    activeEntities: Entity[],
  ): Entity[] {
    const activeEntityIds = new Set(activeEntities.map((entity) => entity.id));

    return entities.filter((entity) => !activeEntityIds.has(entity.id));
  }

  computeAvgRiskScore(entities: Entity[]): number {
    return mean(entities.map((entity) => entity.riskScore));
  }

  computeAvgFailureProbability(entities: Entity[]): number {
    return mean(entities.map((entity) => entity.failureProbability));
  }

  computeMaxTemperature(entities: Entity[]): number {
    return entities.reduce(
      (maxTemperature, entity) => Math.max(maxTemperature, entity.temperature),
      0,
    );
  }

  computeClusterDensity(
    entities: Entity[],
    activeEvent: EventSnapshot | null,
    clusterRadius: number,
  ): number {
    if (!activeEvent?.isActive || entities.length === 0) {
      return 0;
    }

    const clusterCount = entities.filter(
      (entity) =>
        distance2D(entity.x, entity.y, activeEvent.x, activeEvent.y) <=
        clusterRadius,
    ).length;

    return clusterCount / entities.length;
  }

  computeHotEntitiesCount(entities: Entity[], hotThreshold: number): number {
    return entities.filter((entity) => entity.temperature >= hotThreshold)
      .length;
  }

  computeHotShare(entities: Entity[], hotThreshold: number): number {
    if (entities.length === 0) {
      return 0;
    }

    return (
      this.computeHotEntitiesCount(entities, hotThreshold) / entities.length
    );
  }

  computeFailureProximity(entities: Entity[]): number {
    return this.computeAvgFailureProbability(entities);
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
    activeEntities: Entity[],
    activeEvent: EventSnapshot | null,
    clusterRadius: number,
    systemHotThreshold: number,
    weights: ChaosIndexWeights,
    includeBreakdown: boolean,
  ): StepMetricsSnapshot {
    const residualEntities = this.computeResidualEntities(
      entities,
      activeEntities,
    );
    const snapshot = {
      avgTemperature: this.computeAvgTemperature(entities),
      avgInfluence: this.computeAvgInfluence(entities),
      avgVelocity: this.computeAvgVelocity(entities),
      avgCurrentInfluence: this.computeAvgInfluence(activeEntities),
      avgResidualInfluence: this.computeAvgInfluence(residualEntities),
      avgCurrentVelocity: this.computeAvgVelocity(activeEntities),
      avgResidualVelocity: this.computeAvgVelocity(residualEntities),
      avgRiskScore: this.computeAvgRiskScore(entities),
      avgFailureProbability: this.computeAvgFailureProbability(entities),
      clusterDensity: this.computeClusterDensity(
        entities,
        activeEvent,
        clusterRadius,
      ),
      hotShare: this.computeHotShare(entities, systemHotThreshold),
      hotEntities: this.computeHotEntitiesCount(entities, systemHotThreshold),
      hotActiveEntities: this.computeHotEntitiesCount(
        activeEntities,
        systemHotThreshold,
      ),
      failureProximity: this.computeFailureProximity(entities),
      maxTemperature: this.computeMaxTemperature(entities),
    };
    const chaosIndex = this.computeChaosIndex(snapshot, weights);

    if (!includeBreakdown) {
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
        weightedAvgTemperature:
          weights.avgTemperature * snapshot.avgTemperature,
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

  buildActionsBreakdown(activeEntities: Entity[]): ActionsBreakdown {
    const breakdown: ActionsBreakdown = {
      watch: 0,
      notify: 0,
      dampen: 0,
      total: 0,
    };

    for (const entity of activeEntities) {
      if (entity.action === 'watch') {
        breakdown.watch += 1;
      } else if (entity.action === 'notify') {
        breakdown.notify += 1;
      } else if (entity.action === 'dampen') {
        breakdown.dampen += 1;
      }
    }

    breakdown.total = breakdown.watch + breakdown.notify + breakdown.dampen;

    return breakdown;
  }

  computeActionDistribution(
    entities: Entity[],
    activeEntities: Entity[],
  ): Record<string, number> {
    const distribution: Record<string, number> = {
      no_action: entities.length - activeEntities.length,
    };

    for (const entity of activeEntities) {
      distribution[entity.action] = (distribution[entity.action] ?? 0) + 1;
    }

    return distribution;
  }

  buildStepItem(options: BuildStepItemOptions): SimulationStepItem {
    const actionsBreakdown = this.buildActionsBreakdown(options.activeEntities);

    return {
      step: options.step,
      avgTemperature: options.metrics.avgTemperature,
      avgInfluence: options.metrics.avgInfluence,
      avgVelocity: options.metrics.avgVelocity,
      avgCurrentInfluence: options.metrics.avgCurrentInfluence,
      avgResidualInfluence: options.metrics.avgResidualInfluence,
      avgCurrentVelocity: options.metrics.avgCurrentVelocity,
      avgResidualVelocity: options.metrics.avgResidualVelocity,
      avgRiskScore: options.metrics.avgRiskScore,
      avgFailureProbability: options.metrics.avgFailureProbability,
      clusterDensity: options.metrics.clusterDensity,
      hotShare: options.metrics.hotShare,
      failureProximity: options.metrics.failureProximity,
      chaosIndex: options.metrics.chaosIndex,
      globalThreshold: options.globalThreshold,
      systemAction: options.systemAction,
      activeEventIntensity: options.activeEventIntensity,
      stateDistribution: this.computeStateDistribution(options.entities),
      actionDistribution: this.computeActionDistribution(
        options.entities,
        options.activeEntities,
      ),
      actionsBreakdown,
      finishedThisStep: options.finishedThisStep,
      stabilizedThisStep: options.stabilizedThisStep,
      failedThisStep: options.failedThisStep,
      cumulativeFinished: options.cumulativeFinished,
      cumulativeStabilized: options.cumulativeStabilized,
      cumulativeFailed: options.cumulativeFailed,
      eventSnapshot: options.eventSnapshot,
      breakdown: options.metrics.breakdown,
    };
  }

  buildFinalSummary(options: BuildSummaryOptions): SimulationSummary {
    const totalEntities = options.entities.length;
    const stabilizedCount = options.entities.filter(
      (entity) => entity.currentState === 'stabilized',
    ).length;
    const failedCount = options.entities.filter(
      (entity) => entity.currentState === 'failed',
    ).length;
    const hotEntities = this.computeHotEntitiesCount(
      options.entities,
      options.systemHotThreshold,
    );
    const hotActiveEntities = this.computeHotEntitiesCount(
      options.entities.filter((entity) => !entity.isFinished),
      options.systemHotThreshold,
    );
    const activeEntities = options.entities.filter(
      (entity) => !entity.isFinished,
    );
    const residualEntities = options.entities.filter(
      (entity) => entity.isFinished,
    );
    const lastStep = options.steps[options.steps.length - 1];
    const chaosValues = options.steps.map((step) => step.chaosIndex);

    return {
      totalEntities,
      finishedEntities: options.entities.filter((entity) => entity.isFinished)
        .length,
      stabilizedCount,
      failedCount,
      actionCount: lastStep?.actionsBreakdown.total ?? 0,
      actionCountTotal: options.actionTotals.total,
      lastStepActionCount: lastStep?.actionsBreakdown.total ?? 0,
      watchCountTotal: options.actionTotals.watch,
      notifyCountTotal: options.actionTotals.notify,
      dampenCountTotal: options.actionTotals.dampen,
      lastStepActionsBreakdown: lastStep?.actionsBreakdown ?? {
        watch: 0,
        notify: 0,
        dampen: 0,
        total: 0,
      },
      hotEntities,
      hotEntitiesTotal: options.hotEntitiesTotal,
      hotActiveEntities,
      maxHotEntities: options.maxHotEntities,
      maxTemperature: options.maxTemperature,
      conversionRate: totalEntities === 0 ? 0 : stabilizedCount / totalEntities,
      failureRate: totalEntities === 0 ? 0 : failedCount / totalEntities,
      avgTemperature: this.computeAvgTemperature(options.entities),
      avgInfluence: this.computeAvgInfluence(options.entities),
      avgCurrentInfluence: this.computeAvgInfluence(activeEntities),
      avgResidualInfluence: this.computeAvgInfluence(residualEntities),
      avgCurrentVelocity: this.computeAvgVelocity(activeEntities),
      avgResidualVelocity: this.computeAvgVelocity(residualEntities),
      avgRiskScore: this.computeAvgRiskScore(options.entities),
      avgFailureProbability: this.computeAvgFailureProbability(
        options.entities,
      ),
      finalChaosIndex: lastStep?.chaosIndex ?? 0,
      maxChaosIndex: chaosValues.length === 0 ? 0 : Math.max(...chaosValues),
      avgChaosIndex: mean(chaosValues),
      finalGlobalThreshold: lastStep?.globalThreshold ?? 0,
      finalSystemAction: lastStep?.systemAction ?? 'system_normal',
    };
  }
}
