import { Type } from 'class-transformer';
import {
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  Min,
  ValidateNested,
  IsIn,
} from 'class-validator';
import { ACTION_MODES } from '../types/action-mode.type';

const SIMULATION_PROFILES = ['demo', 'realistic'] as const;

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
}
