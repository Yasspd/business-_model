import { Event } from '../simulation/types/event.type';
import { Scenario } from '../simulation/types/scenario-config.type';

const defaultEvent: Event = {
  id: 'event-global-hype-wave',
  name: 'Global Hype Wave',
  type: 'trend',
  x: 0.85,
  y: 0.8,
  intensity: 0.8,
  severity: 0.7,
  relevance: 0.9,
  scope: 0.75,
  duration: 8,
  startStep: 2,
  isActive: true,
};

export const DEFAULT_SCENARIO: Scenario = {
  key: 'global-chaos-mvp',
  name: 'Global Chaos MVP',
  states: [
    'calm',
    'interested',
    'reactive',
    'critical',
    'stabilized',
    'failed',
  ],
  successStates: ['stabilized'],
  failureStates: ['failed'],
  terminalStates: ['stabilized', 'failed'],
  riskMap: {
    calm: 0.1,
    interested: 0.3,
    reactive: 0.65,
    critical: 0.9,
    stabilized: 0.05,
    failed: 1,
  },
  transitionMatrix: {
    calm: {
      calm: 0.55,
      interested: 0.3,
      reactive: 0.1,
      critical: 0,
      stabilized: 0.05,
      failed: 0,
    },
    interested: {
      calm: 0.1,
      interested: 0.45,
      reactive: 0.3,
      critical: 0.1,
      stabilized: 0.05,
      failed: 0,
    },
    reactive: {
      calm: 0.05,
      interested: 0.15,
      reactive: 0.35,
      critical: 0.25,
      stabilized: 0.1,
      failed: 0.1,
    },
    critical: {
      calm: 0,
      interested: 0.05,
      reactive: 0.2,
      critical: 0.35,
      stabilized: 0.15,
      failed: 0.25,
    },
    stabilized: {
      stabilized: 1,
    },
    failed: {
      failed: 1,
    },
  },
  segmentPresets: {
    stable: {
      initialState: 'calm',
      temperature: { min: 0.1, max: 0.25 },
      weight: { min: 0.3, max: 0.55 },
      sensitivity: { min: 0.15, max: 0.35 },
      relevance: { min: 0.2, max: 0.5 },
      position: { min: 0.1, max: 0.45 },
    },
    regular: {
      initialState: 'interested',
      temperature: { min: 0.2, max: 0.45 },
      weight: { min: 0.35, max: 0.65 },
      sensitivity: { min: 0.3, max: 0.6 },
      relevance: { min: 0.35, max: 0.7 },
      position: { min: 0.25, max: 0.65 },
    },
    reactive: {
      initialState: 'reactive',
      temperature: { min: 0.35, max: 0.7 },
      weight: { min: 0.4, max: 0.8 },
      sensitivity: { min: 0.55, max: 0.9 },
      relevance: { min: 0.5, max: 0.95 },
      position: { min: 0.45, max: 0.85 },
    },
  },
  segmentDistribution: {
    stable: 0.35,
    regular: 0.45,
    reactive: 0.2,
  },
  events: [defaultEvent],
  clusterRadius: 0.18,
  hotTemperatureThreshold: 0.7,
  maxFailureDepth: 4,
  riskScoreWeights: {
    stateRisk: 0.3,
    temperature: 0.25,
    influence: 0.2,
    velocity: 0.1,
    failureProbability: 0.15,
  },
  chaosIndexWeights: {
    avgTemperature: 0.25,
    avgVelocity: 0.2,
    clusterDensity: 0.2,
    hotShare: 0.15,
    failureProximity: 0.2,
  },
  fixedThresholds: {
    local: 0.65,
    global: 0.7,
  },
  adaptiveThresholds: {
    localSigmaMultiplier: 0.5,
    globalSigmaMultiplier: 0.75,
    localMin: 0.35,
    localMax: 0.95,
    globalMin: 0.4,
    globalMax: 0.95,
  },
};

export const SCENARIOS: Scenario[] = [DEFAULT_SCENARIO];
