import { Mode, SystemAction } from './action-mode.type';

export const ANALYSIS_TARGET_METRICS = [
  'failureRate',
  'finalChaosIndex',
  'avgRiskScore',
  'avgFailureProbability',
  'stabilizedCount',
  'failedCount',
] as const;

export const ROBUST_OBJECTIVES = [
  'balanced_resilience',
  'min_failure_rate',
  'min_chaos_index',
  'maximize_stabilization',
] as const;

export const UNCERTAINTY_METHODS = [
  'calibrated_empirical_interval',
  'empirical_seeded_interval',
] as const;

export type AnalysisTargetMetric = (typeof ANALYSIS_TARGET_METRICS)[number];
export type RobustObjective = (typeof ROBUST_OBJECTIVES)[number];
export type UncertaintyMethod = (typeof UNCERTAINTY_METHODS)[number];
export type EffectDirection = 'increase' | 'decrease' | 'no_change';
export type ConfidenceLabel = 'low' | 'medium' | 'high';
export type EvidenceLabel =
  | 'weak_single_seed_effect'
  | 'moderate_single_seed_effect'
  | 'strong_single_seed_effect';

export interface CausalAnalysisOptions {
  enabled: boolean;
  targetMetric: AnalysisTargetMetric;
  maxInterventions: number;
}

export interface RobustAnalysisOptions {
  enabled: boolean;
  objective: RobustObjective;
  scenarioCount: number;
}

export interface UncertaintyAnalysisOptions {
  enabled: boolean;
  level: number;
  method: UncertaintyMethod;
  resamples: number;
}

export interface SimulationAnalysisOptions {
  causal?: CausalAnalysisOptions;
  robust?: RobustAnalysisOptions;
  uncertainty?: UncertaintyAnalysisOptions;
}

export interface CausalInterventionDescriptor {
  id: string;
  label: string;
  description: string;
}

export interface CausalComparison {
  targetMetric: AnalysisTargetMetric;
  intervention: CausalInterventionDescriptor;
  baselineValue: number;
  treatedValue: number;
  estimatedEffect: number;
  effectDirection: EffectDirection;
  confidenceLabel: ConfidenceLabel;
  evidenceLabel: EvidenceLabel;
  caveats: string[];
}

export interface CausalDriverRankingItem {
  rank: number;
  metric: AnalysisTargetMetric;
  intervention: CausalInterventionDescriptor;
  estimatedEffect: number;
  absoluteEffect: number;
  effectDirection: EffectDirection;
}

export interface CausalAnalysis {
  enabled: boolean;
  method: 'simulation_interventional_estimate';
  targetMetric: AnalysisTargetMetric;
  comparisons: CausalComparison[];
  topDrivers: CausalDriverRankingItem[];
  chaosDrivers: CausalDriverRankingItem[];
  notes: string[];
  caveats: string[];
}

export interface RobustScenarioDescriptor {
  id: string;
  label: string;
  description: string;
}

export interface RobustCandidatePolicy {
  policyId: string;
  mode: Mode;
  label: string;
  description: string;
}

export interface RobustPolicyScore {
  policyId: string;
  mode: Mode;
  expectedScore: number;
  worstCaseScore: number;
  tailRiskScore: number;
  stabilityScore: number;
  robustScore: number;
  regret: number;
  downside: number;
}

export interface RobustRecommendedPolicy extends RobustPolicyScore {
  label: string;
}

export interface RobustAnalysis {
  enabled: boolean;
  evaluator: 'scenario_based_policy_evaluator';
  objective: RobustObjective;
  candidatePolicies: RobustCandidatePolicy[];
  scenarioCount: number;
  scenarios: RobustScenarioDescriptor[];
  recommendedPolicy: RobustRecommendedPolicy | null;
  expectedScores: Record<string, number>;
  worstCaseScores: Record<string, number>;
  tailRiskScores: Record<string, number>;
  ranking: RobustPolicyScore[];
  frontier: RobustPolicyScore[];
  constraints: string[];
  notes: string[];
}

export interface EmpiricalInterval {
  point: number;
  lower: number;
  upper: number;
  level: number;
  methodLabel: string;
}

export interface UncertaintyMetricMap {
  failureRate: EmpiricalInterval;
  chaosIndex: EmpiricalInterval;
  stabilizedCount: EmpiricalInterval;
  failedCount: EmpiricalInterval;
  avgRiskScore: EmpiricalInterval;
  recommendedPolicyScore?: EmpiricalInterval;
}

export interface UncertaintyCalibrationInfo {
  level: number;
  resamples: number;
  effectiveSamples: number;
  seedStrategy: string;
  calibrationMode: string;
  wideningFactor: number;
}

export interface UncertaintyAnalysis {
  enabled: boolean;
  method: UncertaintyMethod;
  metrics: UncertaintyMetricMap;
  calibrationInfo: UncertaintyCalibrationInfo;
  caveats: string[];
}

export interface SimulationAnalysis {
  causal?: CausalAnalysis;
  robust?: RobustAnalysis;
  uncertainty?: UncertaintyAnalysis;
}

export interface RobustPolicyDecisionSummary {
  objective: RobustObjective;
  recommendedPolicyId: string | null;
  recommendedPolicyMode: Mode | null;
  recommendedPolicyScore: number | null;
}

export interface AnalysisExplanationNote {
  title: string;
  message: string;
}

export interface CausalSystemActionTrace {
  finalSystemAction: SystemAction;
  finalChaosIndex: number;
}
