import { Mode, SystemAction } from './action-mode.type';
import { Entity } from './entity.type';
import { EventSnapshot } from './event.type';
import { SimulationProfileKey } from './scenario-config.type';

export type RunStatus = 'completed' | 'failed' | 'partial';

export interface ActionsBreakdown {
  watch: number;
  notify: number;
  dampen: number;
  total: number;
}

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

export interface SimulationConfigSnapshot {
  profile: SimulationProfileKey;
  clusterRadius: number;
  hotTemperatureThreshold: number;
  systemHotThreshold: number;
  visualHotThreshold: number;
  maxFailureDepth: number;
  storeTimeline: boolean;
}

export interface SimulationSummary {
  totalEntities: number;
  finishedEntities: number;
  stabilizedCount: number;
  failedCount: number;
  actionCount: number;
  actionCountTotal: number;
  lastStepActionCount: number;
  watchCountTotal: number;
  notifyCountTotal: number;
  dampenCountTotal: number;
  lastStepActionsBreakdown: ActionsBreakdown;
  hotEntities: number;
  hotEntitiesTotal: number;
  hotActiveEntities: number;
  maxHotEntities: number;
  maxTemperature: number;
  conversionRate: number;
  failureRate: number;
  avgTemperature: number;
  avgInfluence: number;
  avgRiskScore: number;
  avgFailureProbability: number;
  finalChaosIndex: number;
  maxChaosIndex: number;
  avgChaosIndex: number;
  finalGlobalThreshold: number;
  finalSystemAction: SystemAction;
}

export interface SimulationStepItem {
  step: number;
  avgTemperature: number;
  avgInfluence: number;
  avgVelocity: number;
  avgRiskScore: number;
  avgFailureProbability: number;
  clusterDensity: number;
  hotShare: number;
  failureProximity: number;
  chaosIndex: number;
  globalThreshold: number;
  systemAction: SystemAction;
  activeEventIntensity: number;
  stateDistribution: Record<string, number>;
  actionDistribution: Record<string, number>;
  actionsBreakdown: ActionsBreakdown;
  finishedThisStep: number;
  stabilizedThisStep: number;
  failedThisStep: number;
  cumulativeFinished: number;
  cumulativeStabilized: number;
  cumulativeFailed: number;
  eventSnapshot: EventSnapshot | null;
  breakdown?: ChaosIndexBreakdown;
}

export interface SimulationDebug {
  clusterRadius: number;
  hotTemperatureThreshold: number;
  systemHotThreshold: number;
  visualHotThreshold: number;
  transitionMatrixValidated: boolean;
}

export interface SimulationResponse {
  runId: string;
  startedAt: string;
  finishedAt: string;
  status: RunStatus;
  scenarioKey: string;
  mode: Mode;
  profile: SimulationProfileKey;
  seed: number;
  entitiesCount: number;
  requestedSteps: number;
  activeEventSnapshot: EventSnapshot | null;
  configSnapshot: SimulationConfigSnapshot;
  summary: SimulationSummary;
  lastStep: SimulationStepItem | null;
  steps: SimulationStepItem[];
  entities: Entity[];
  debug: SimulationDebug;
}

export interface SimulationRunListItem {
  runId: string;
  startedAt: string;
  finishedAt: string;
  status: RunStatus;
  scenarioKey: string;
  mode: Mode;
  profile: SimulationProfileKey;
  seed: number;
  entitiesCount: number;
  requestedSteps: number;
  summary: SimulationSummary;
  lastStep: SimulationStepItem | null;
}
