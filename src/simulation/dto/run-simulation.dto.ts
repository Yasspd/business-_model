import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsNumber,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  Min,
  ValidateNested,
  IsIn,
} from 'class-validator';
import { ACTION_MODES } from '../types/action-mode.type';
import {
  ANALYSIS_TARGET_METRICS,
  ROBUST_OBJECTIVES,
  UNCERTAINTY_METHODS,
} from '../types/analysis.type';

const SIMULATION_PROFILES = ['demo', 'realistic', 'stress'] as const;
const MAX_CAUSAL_INTERVENTIONS = 8;
const MAX_ROBUST_SCENARIOS = 12;
const MAX_UNCERTAINTY_RESAMPLES = 24;

function normalizeNestedAnalysisOption(value: unknown): unknown {
  if (typeof value === 'boolean') {
    return { enabled: value };
  }

  return value;
}

class ActiveEventOverrideDto {
  @IsOptional()
  @Type(() => Number)
  @Min(0)
  @Max(1)
  intensity?: number;

  @IsOptional()
  @Type(() => Number)
  @Min(0)
  @Max(1)
  severity?: number;

  @IsOptional()
  @Type(() => Number)
  @Min(0)
  @Max(1)
  relevance?: number;

  @IsOptional()
  @Type(() => Number)
  @Min(0)
  @Max(1)
  scope?: number;

  @IsOptional()
  @Type(() => Number)
  @Min(0)
  @Max(1)
  x?: number;

  @IsOptional()
  @Type(() => Number)
  @Min(0)
  @Max(1)
  y?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  duration?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  startStep?: number;
}

class CausalAnalysisOptionsDto {
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  enabled?: boolean;

  @IsOptional()
  @IsIn(ANALYSIS_TARGET_METRICS)
  targetMetric?: (typeof ANALYSIS_TARGET_METRICS)[number];

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_CAUSAL_INTERVENTIONS)
  maxInterventions?: number;
}

class RobustAnalysisOptionsDto {
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  enabled?: boolean;

  @IsOptional()
  @IsIn(ROBUST_OBJECTIVES)
  objective?: (typeof ROBUST_OBJECTIVES)[number];

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_ROBUST_SCENARIOS)
  scenarioCount?: number;
}

class UncertaintyAnalysisOptionsDto {
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  enabled?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0.8)
  @Max(0.99)
  level?: number;

  @IsOptional()
  @IsIn(UNCERTAINTY_METHODS)
  method?: (typeof UNCERTAINTY_METHODS)[number];

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(4)
  @Max(MAX_UNCERTAINTY_RESAMPLES)
  resamples?: number;
}

class AnalysisOptionsDto {
  @IsOptional()
  @Transform(({ value }) => normalizeNestedAnalysisOption(value))
  @ValidateNested()
  @Type(() => CausalAnalysisOptionsDto)
  causal?: CausalAnalysisOptionsDto;

  @IsOptional()
  @Transform(({ value }) => normalizeNestedAnalysisOption(value))
  @ValidateNested()
  @Type(() => RobustAnalysisOptionsDto)
  robust?: RobustAnalysisOptionsDto;

  @IsOptional()
  @Transform(({ value }) => normalizeNestedAnalysisOption(value))
  @ValidateNested()
  @Type(() => UncertaintyAnalysisOptionsDto)
  uncertainty?: UncertaintyAnalysisOptionsDto;
}

export class RunSimulationDto {
  @IsString()
  @IsNotEmpty()
  scenarioKey!: string;

  @Type(() => Number)
  @IsInt()
  @Min(10)
  @Max(5000)
  entitiesCount!: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  steps!: number;

  @IsIn(ACTION_MODES)
  mode!: (typeof ACTION_MODES)[number];

  @IsOptional()
  @IsIn(SIMULATION_PROFILES)
  profile?: (typeof SIMULATION_PROFILES)[number];

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  seed?: number;

  @IsOptional()
  @ValidateNested()
  @Type(() => ActiveEventOverrideDto)
  activeEventOverride?: ActiveEventOverrideDto;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(5000)
  returnEntitiesLimit?: number;

  @IsOptional()
  @ValidateNested()
  @Type(() => AnalysisOptionsDto)
  analysisOptions?: AnalysisOptionsDto;
}
