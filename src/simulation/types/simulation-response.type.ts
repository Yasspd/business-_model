import { Mode, SystemAction } from './action-mode.type';
import { Entity } from './entity.type';

export interface ChaosIndexBreakdown {
  avgTemperature: number;
  avgVelocity: number;
  clusterDensity: number;
  hotShare: number;
  failureProximity: number;
  weightedAvgTemperature: number;
  weightedAvgVelocity: number;
  weightedClusterDensity: number;
  weightedHotShare: number;
  weightedFailureProximity: number;
}

export interface SimulationSummary {
  totalEntities: number;
  finishedEntities: number;
  stabilizedCount: number;
  failedCount: number;
  actionCount: number;
  hotEntities: number;
  conversionRate: number;
  failureRate: number;
  avgTemperature: number;
  avgRiskScore: number;
  avgFailureProbability: number;
  finalChaosIndex: number;
  finalGlobalThreshold: number;
  finalSystemAction: SystemAction;
}

export interface SimulationStepItem {
  step: number;
  avgTemperature: number;
  avgVelocity: number;
  clusterDensity: number;
  hotShare: number;
  failureProximity: number;
  chaosIndex: number;
  globalThreshold: number;
  systemAction: SystemAction;
  activeEventIntensity: number;
  stateDistribution: Record<string, number>;
  actionDistribution: Record<string, number>;
  breakdown?: ChaosIndexBreakdown;
}

export interface SimulationDebug {
  clusterRadius: number;
  hotTemperatureThreshold: number;
  transitionMatrixValidated: boolean;
}

export interface SimulationResponse {
  scenarioKey: string;
  mode: Mode;
  seed: number;
  summary: SimulationSummary;
  steps: SimulationStepItem[];
  entities: Entity[];
  debug: SimulationDebug;
}
