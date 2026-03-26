import { Event } from './event.type';

export type State = string;
export type EntitySegment = 'stable' | 'regular' | 'reactive';
export type SimulationProfileKey = 'demo' | 'realistic';
export type TransitionProbability = number;
export type Transition = Record<State, TransitionProbability>;
export type TransitionMatrix = Record<State, Transition>;
export type RiskMap = Record<State, number>;

export interface FeatureRange {
  min: number;
  max: number;
}

export interface FeatureWeights {
  stateRisk: number;
  temperature: number;
  influence: number;
  velocity: number;
  failureProbability: number;
}

export interface ChaosIndexWeights {
  avgTemperature: number;
  avgVelocity: number;
  clusterDensity: number;
  hotShare: number;
  failureProximity: number;
}

export interface SegmentPreset {
  initialState: State;
  temperature: FeatureRange;
  weight: FeatureRange;
  sensitivity: FeatureRange;
  relevance: FeatureRange;
  position: FeatureRange;
}

export interface AdaptiveThresholdConfig {
  localSigmaMultiplier: number;
  globalSigmaMultiplier: number;
  localMin: number;
  localMax: number;
  globalMin: number;
  globalMax: number;
}

export interface FixedThresholdConfig {
  local: number;
  global: number;
}

export interface HotThresholdConfig {
  system: number;
  visual: number;
}

export interface EventLifecycleConfig {
  enabled: boolean;
  rampUpShare: number;
  peakShare: number;
  decayShare: number;
  aftershockSteps: number;
  aftershockIntensityMultiplier: number;
  aftershockScopeMultiplier: number;
  aftershockRelevanceMultiplier: number;
}

export interface DelayedEffectsConfig {
  localImmediateShare: number;
  localNextStepShare: number;
  systemImmediateShare: number;
  systemNextStepShare: number;
  decayFactor: number;
}

export interface InertiaConfig {
  stressMemoryDecay: number;
  temperatureRecovery: number;
  influenceRecovery: number;
  cooldownSteps: number;
}

export interface SegmentDynamicsConfig {
  sensitivityMultiplier: number;
  recoveryFactor: number;
  escalationBias: number;
  transitionBias: number;
}

export interface SeededNoiseConfig {
  influence: number;
  temperature: number;
  transition: number;
}

export interface SimulationProfile {
  key: SimulationProfileKey;
  label: string;
  hotThresholds: HotThresholdConfig;
  eventLifecycle: EventLifecycleConfig;
  delayedEffects: DelayedEffectsConfig;
  inertia: InertiaConfig;
  segmentDynamics: Record<EntitySegment, SegmentDynamicsConfig>;
  noise: SeededNoiseConfig;
  stabilizedTerminal: boolean;
}

export interface Scenario {
  key: string;
  name: string;
  states: State[];
  successStates: State[];
  failureStates: State[];
  terminalStates: State[];
  riskMap: RiskMap;
  transitionMatrix: TransitionMatrix;
  segmentPresets: Record<EntitySegment, SegmentPreset>;
  segmentDistribution: Record<EntitySegment, number>;
  events: Event[];
  clusterRadius: number;
  hotTemperatureThreshold: number;
  maxFailureDepth: number;
  riskScoreWeights: FeatureWeights;
  chaosIndexWeights: ChaosIndexWeights;
  fixedThresholds: FixedThresholdConfig;
  adaptiveThresholds: AdaptiveThresholdConfig;
  defaultProfile: SimulationProfileKey;
  profiles: Record<SimulationProfileKey, SimulationProfile>;
}

export interface ScenarioListItem {
  key: string;
  name: string;
}
