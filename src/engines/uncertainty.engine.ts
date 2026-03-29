import { Injectable } from '@nestjs/common';
import { clamp, mean, std } from './math.util';
import {
  EmpiricalInterval,
  UncertaintyAnalysis,
  UncertaintyAnalysisOptions,
  UncertaintyMethod,
} from '../simulation/types/analysis.type';
import {
  AnalysisExecutionRequest,
  AnalysisRunExecutor,
  RobustEvaluationResult,
} from './analysis-engine.type';
import { RunSimulationDto } from '../simulation/dto/run-simulation.dto';
import { SimulationResponse } from '../simulation/types/simulation-response.type';

const DEFAULT_COUNT_DOMAIN_MIN = 0;

@Injectable()
export class UncertaintyEngine {
  quantify(
    baseResponse: SimulationResponse,
    baseDto: RunSimulationDto,
    options: UncertaintyAnalysisOptions,
    execute: AnalysisRunExecutor,
    robustEvaluation?: RobustEvaluationResult,
  ): UncertaintyAnalysis {
    const seeds = this.buildSeedSequence(
      baseResponse.seed,
      Math.max(options.resamples - 1, 0),
    );
    const sampleResponses = seeds.map((seed) =>
      execute(this.buildSeededRequest(baseDto, seed)),
    );
    const failureSamples = [
      baseResponse.summary.failureRate,
      ...sampleResponses.map((response) => response.summary.failureRate),
    ];
    const chaosSamples = [
      baseResponse.summary.finalChaosIndex,
      ...sampleResponses.map((response) => response.summary.finalChaosIndex),
    ];
    const stabilizedSamples = [
      baseResponse.summary.stabilizedCount,
      ...sampleResponses.map((response) => response.summary.stabilizedCount),
    ];
    const failedSamples = [
      baseResponse.summary.failedCount,
      ...sampleResponses.map((response) => response.summary.failedCount),
    ];
    const avgRiskScoreSamples = [
      baseResponse.summary.avgRiskScore,
      ...sampleResponses.map((response) => response.summary.avgRiskScore),
    ];
    const recommendedPolicyScores =
      this.getRecommendedPolicyScores(robustEvaluation);
    const wideningFactor = this.computeWideningFactor(
      failureSamples.length,
      options.method,
    );

    return {
      enabled: true,
      method: options.method,
      metrics: {
        failureRate: this.buildInterval(
          failureSamples,
          baseResponse.summary.failureRate,
          options.level,
          0,
          1,
          options.method,
          wideningFactor,
        ),
        chaosIndex: this.buildInterval(
          chaosSamples,
          baseResponse.summary.finalChaosIndex,
          options.level,
          0,
          1,
          options.method,
          wideningFactor,
        ),
        stabilizedCount: this.buildInterval(
          stabilizedSamples,
          baseResponse.summary.stabilizedCount,
          options.level,
          DEFAULT_COUNT_DOMAIN_MIN,
          baseResponse.summary.totalEntities,
          options.method,
          wideningFactor,
        ),
        failedCount: this.buildInterval(
          failedSamples,
          baseResponse.summary.failedCount,
          options.level,
          DEFAULT_COUNT_DOMAIN_MIN,
          baseResponse.summary.totalEntities,
          options.method,
          wideningFactor,
        ),
        avgRiskScore: this.buildInterval(
          avgRiskScoreSamples,
          baseResponse.summary.avgRiskScore,
          options.level,
          0,
          1,
          options.method,
          wideningFactor,
        ),
        recommendedPolicyScore:
          recommendedPolicyScores === null
            ? undefined
            : this.buildInterval(
                recommendedPolicyScores,
                robustEvaluation?.analysis.recommendedPolicy?.robustScore ?? 0,
                options.level,
                0,
                1,
                options.method,
                wideningFactor,
              ),
      },
      calibrationInfo: {
        level: options.level,
        resamples: options.resamples,
        effectiveSamples: failureSamples.length,
        seedStrategy: 'base-seed plus deterministic prime offsets',
        calibrationMode:
          options.method === 'calibrated_empirical_interval'
            ? 'finite-sample widening over empirical quantiles'
            : 'plain empirical quantile interval',
        wideningFactor,
      },
      caveats: [
        'Интервалы отражают uncertainty внутри simulation engine, а не статистическую гарантию по реальному миру.',
        'Phase 1 использует repeated seeded reruns с empirical interval aggregation.',
      ],
    };
  }

  private getRecommendedPolicyScores(
    robustEvaluation?: RobustEvaluationResult,
  ): number[] | null {
    const recommendedPolicyId =
      robustEvaluation?.analysis.recommendedPolicy?.policyId ?? null;

    if (!recommendedPolicyId) {
      return null;
    }

    return robustEvaluation?.scenarioScores[recommendedPolicyId] ?? null;
  }

  private buildSeededRequest(
    baseDto: RunSimulationDto,
    seed: number,
  ): AnalysisExecutionRequest {
    return {
      dto: {
        ...structuredClone(baseDto),
        seed,
      },
      tag: `uncertainty:seed:${seed}`,
    };
  }

  private buildSeedSequence(baseSeed: number, count: number): number[] {
    return Array.from(
      { length: count },
      (_, index) => baseSeed + (index + 1) * 104_729,
    );
  }

  private buildInterval(
    values: number[],
    point: number,
    level: number,
    domainMin: number,
    domainMax: number,
    method: UncertaintyMethod,
    wideningFactor: number,
  ): EmpiricalInterval {
    const sortedValues = [...values].sort((left, right) => left - right);
    const alpha = clamp(1 - level, 0.01, 0.2);
    const lowerQuantile = this.quantile(sortedValues, alpha / 2);
    const upperQuantile = this.quantile(sortedValues, 1 - alpha / 2);
    const calibrationMargin =
      method === 'calibrated_empirical_interval'
        ? std(sortedValues) * wideningFactor
        : 0;
    const boundedLower = clamp(
      Math.min(lowerQuantile - calibrationMargin, point),
      domainMin,
      domainMax,
    );
    const boundedUpper = clamp(
      Math.max(upperQuantile + calibrationMargin, point),
      domainMin,
      domainMax,
    );

    return {
      point,
      lower: boundedLower,
      upper: boundedUpper,
      level,
      methodLabel:
        method === 'calibrated_empirical_interval'
          ? 'calibrated empirical interval'
          : 'empirical seeded interval',
    };
  }

  private quantile(values: number[], probability: number): number {
    if (values.length === 0) {
      return 0;
    }

    const index = clamp(probability, 0, 1) * (values.length - 1);
    const lowerIndex = Math.floor(index);
    const upperIndex = Math.ceil(index);

    if (lowerIndex === upperIndex) {
      return values[lowerIndex];
    }

    const weight = index - lowerIndex;

    return values[lowerIndex] * (1 - weight) + values[upperIndex] * weight;
  }

  private computeWideningFactor(
    sampleCount: number,
    method: UncertaintyMethod,
  ): number {
    if (method !== 'calibrated_empirical_interval') {
      return 0;
    }

    return mean([0.15, 1 / Math.sqrt(Math.max(sampleCount, 1))]);
  }
}
