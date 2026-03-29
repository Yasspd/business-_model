import { RunSimulationDto } from '../simulation/dto/run-simulation.dto';
import { Mode } from '../simulation/types/action-mode.type';
import {
  RobustAnalysis,
  SimulationAnalysisOptions,
} from '../simulation/types/analysis.type';
import {
  Scenario,
  SimulationProfile,
  SimulationProfileKey,
} from '../simulation/types/scenario-config.type';
import { SimulationResponse } from '../simulation/types/simulation-response.type';

export interface AnalysisBehaviorOverrides {
  useFixedThresholds?: boolean;
  localDecisionsEnabled?: boolean;
  localEffectsEnabled?: boolean;
  systemDecisionsEnabled?: boolean;
  systemEffectsEnabled?: boolean;
  localThresholdShift?: number;
  globalThresholdShift?: number;
}

export interface AnalysisExecutionRequest {
  dto: RunSimulationDto;
  modeOverride?: Mode;
  profileOverride?: SimulationProfileKey;
  behaviorOverrides?: AnalysisBehaviorOverrides;
  scenarioMutator?: (scenario: Scenario, profile: SimulationProfile) => void;
  tag?: string;
}

export type AnalysisRunExecutor = (
  request: AnalysisExecutionRequest,
) => SimulationResponse;

export interface RobustEvaluationResult {
  analysis: RobustAnalysis;
  scenarioScores: Record<string, number[]>;
}

export interface AnalysisBuildContext {
  baseResponse: SimulationResponse;
  baseDto: RunSimulationDto;
  options: SimulationAnalysisOptions;
  execute: AnalysisRunExecutor;
}
