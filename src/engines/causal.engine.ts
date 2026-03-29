import { Injectable } from '@nestjs/common';
import { clamp } from './math.util';
import {
  AnalysisTargetMetric,
  CausalAnalysis,
  CausalAnalysisOptions,
  CausalComparison,
  CausalDriverRankingItem,
  CausalInterventionDescriptor,
  ConfidenceLabel,
  EffectDirection,
  EvidenceLabel,
} from '../simulation/types/analysis.type';
import { SimulationResponse } from '../simulation/types/simulation-response.type';
import {
  AnalysisExecutionRequest,
  AnalysisRunExecutor,
} from './analysis-engine.type';
import { RunSimulationDto } from '../simulation/dto/run-simulation.dto';

interface CausalInterventionPlan {
  descriptor: CausalInterventionDescriptor;
  buildRequest: (baseDto: RunSimulationDto) => AnalysisExecutionRequest;
}

interface MaterializedComparison {
  comparison: CausalComparison;
  chaosEffect: number;
}

@Injectable()
export class CausalEngine {
  analyze(
    baseResponse: SimulationResponse,
    baseDto: RunSimulationDto,
    options: CausalAnalysisOptions,
    execute: AnalysisRunExecutor,
  ): CausalAnalysis {
    const baselineTargetValue = this.extractMetric(
      baseResponse,
      options.targetMetric,
    );
    const baselineChaosValue = this.extractMetric(
      baseResponse,
      'finalChaosIndex',
    );
    const plans = this.buildInterventionPlans(baseDto, baseResponse).slice(
      0,
      options.maxInterventions,
    );
    const materializedComparisons = plans.map((plan) =>
      this.materializeComparison(
        plan,
        baseDto,
        baselineTargetValue,
        baselineChaosValue,
        options.targetMetric,
        execute,
      ),
    );

    return {
      enabled: true,
      method: 'simulation_interventional_estimate',
      targetMetric: options.targetMetric,
      comparisons: materializedComparisons.map(({ comparison }) => comparison),
      topDrivers: this.rankComparisons(
        materializedComparisons,
        options.targetMetric,
      ),
      chaosDrivers: this.rankComparisons(
        materializedComparisons,
        'finalChaosIndex',
      ),
      notes: [
        'Оценка строится на paired rerun интервенциях с одинаковым seed и одинаковым стартовым состоянием.',
        'Это simulation-interventional estimate, а не реальный causal claim по наблюдательным данным.',
      ],
      caveats: [
        'Phase 1 использует одиночные контролируемые интервенции без полноценного SCM/DAG слоя.',
        'Для устойчивости по seed используйте uncertainty layer и robust scenario evaluation вместе с causal summary.',
      ],
    };
  }

  private materializeComparison(
    plan: CausalInterventionPlan,
    baseDto: RunSimulationDto,
    baselineTargetValue: number,
    baselineChaosValue: number,
    targetMetric: AnalysisTargetMetric,
    execute: AnalysisRunExecutor,
  ): MaterializedComparison {
    const treatedResponse = execute(plan.buildRequest(this.cloneDto(baseDto)));
    const treatedValue = this.extractMetric(treatedResponse, targetMetric);
    const estimatedEffect = treatedValue - baselineTargetValue;
    const chaosEffect =
      this.extractMetric(treatedResponse, 'finalChaosIndex') -
      baselineChaosValue;

    return {
      comparison: {
        targetMetric,
        intervention: plan.descriptor,
        baselineValue: baselineTargetValue,
        treatedValue,
        estimatedEffect,
        effectDirection: this.getEffectDirection(estimatedEffect),
        confidenceLabel: this.getConfidenceLabel(estimatedEffect),
        evidenceLabel: this.getEvidenceLabel(estimatedEffect),
        caveats: [
          'Сравнение выполнено на одном и том же seed с изменением только одной интервенции.',
          'Эффект относится к текущей модели симуляции и её assumptions.',
        ],
      },
      chaosEffect,
    };
  }

  private rankComparisons(
    comparisons: MaterializedComparison[],
    metric: AnalysisTargetMetric,
  ): CausalDriverRankingItem[] {
    const ranked = comparisons
      .map(({ comparison, chaosEffect }) => ({
        intervention: comparison.intervention,
        estimatedEffect:
          metric === comparison.targetMetric
            ? comparison.estimatedEffect
            : chaosEffect,
        effectDirection:
          metric === comparison.targetMetric
            ? comparison.effectDirection
            : this.getEffectDirection(chaosEffect),
      }))
      .sort(
        (left, right) =>
          Math.abs(right.estimatedEffect) - Math.abs(left.estimatedEffect),
      );

    return ranked.map((item, index) => ({
      rank: index + 1,
      metric,
      intervention: item.intervention,
      estimatedEffect: item.estimatedEffect,
      absoluteEffect: Math.abs(item.estimatedEffect),
      effectDirection: item.effectDirection,
    }));
  }

  private buildInterventionPlans(
    baseDto: RunSimulationDto,
    baseResponse: SimulationResponse,
  ): CausalInterventionPlan[] {
    const strongerEventOverride = this.scaleEventOverride(
      baseDto,
      baseResponse,
      1.2,
    );
    const weakerEventOverride = this.scaleEventOverride(
      baseDto,
      baseResponse,
      0.8,
    );

    return [
      {
        descriptor: {
          id: 'mode_fixed_control',
          label: 'Режим fixed control',
          description:
            'Переключение в passive control group без adaptive effects.',
        },
        buildRequest: (dto) => ({
          dto: {
            ...dto,
            mode: 'fixed',
          },
          modeOverride: 'fixed',
          tag: 'causal:mode_fixed_control',
        }),
      },
      {
        descriptor: {
          id: 'local_actions_off',
          label: 'Локальные действия отключены',
          description:
            'Локальные decisions и их эффекты отключены при сохранении остальных условий.',
        },
        buildRequest: (dto) => ({
          dto,
          behaviorOverrides: {
            localDecisionsEnabled: false,
            localEffectsEnabled: false,
          },
          tag: 'causal:local_actions_off',
        }),
      },
      {
        descriptor: {
          id: 'system_actions_off',
          label: 'Системный слой отключён',
          description:
            'System action decisions и system effects отключены при сохранении локальной динамики.',
        },
        buildRequest: (dto) => ({
          dto,
          behaviorOverrides: {
            systemDecisionsEnabled: false,
            systemEffectsEnabled: false,
          },
          tag: 'causal:system_actions_off',
        }),
      },
      {
        descriptor: {
          id: 'event_stronger',
          label: 'Событие усилено',
          description:
            'Интенсивность, релевантность и охват primary event усилены относительно baseline run.',
        },
        buildRequest: (dto) => ({
          dto: {
            ...dto,
            activeEventOverride: strongerEventOverride,
          },
          tag: 'causal:event_stronger',
        }),
      },
      {
        descriptor: {
          id: 'event_weaker',
          label: 'Событие ослаблено',
          description:
            'Интенсивность, релевантность и охват primary event ослаблены относительно baseline run.',
        },
        buildRequest: (dto) => ({
          dto: {
            ...dto,
            activeEventOverride: weakerEventOverride,
          },
          tag: 'causal:event_weaker',
        }),
      },
      {
        descriptor: {
          id: 'threshold_tightened',
          label: 'Пороги смещены вниз',
          description:
            'Локальные и глобальные thresholds становятся более чувствительными к росту риска.',
        },
        buildRequest: (dto) => ({
          dto,
          behaviorOverrides: {
            localThresholdShift: -0.05,
            globalThresholdShift: -0.05,
          },
          tag: 'causal:threshold_tightened',
        }),
      },
    ];
  }

  private scaleEventOverride(
    baseDto: RunSimulationDto,
    baseResponse: SimulationResponse,
    multiplier: number,
  ): NonNullable<RunSimulationDto['activeEventOverride']> {
    const snapshot = baseResponse.activeEventSnapshot;
    const source = baseDto.activeEventOverride;

    return {
      intensity: clamp(
        (source?.intensity ??
          snapshot?.baseIntensity ??
          snapshot?.intensity ??
          0) * multiplier,
        0,
        1,
      ),
      severity: clamp(source?.severity ?? snapshot?.severity ?? 0.7, 0, 1),
      relevance: clamp(
        (source?.relevance ??
          snapshot?.baseRelevance ??
          snapshot?.relevance ??
          0) * multiplier,
        0,
        1,
      ),
      scope: clamp(
        (source?.scope ?? snapshot?.baseScope ?? snapshot?.scope ?? 0) *
          multiplier,
        0,
        1,
      ),
      x: clamp(source?.x ?? snapshot?.x ?? 0.5, 0, 1),
      y: clamp(source?.y ?? snapshot?.y ?? 0.5, 0, 1),
      duration: source?.duration ?? snapshot?.duration ?? 1,
      startStep: source?.startStep ?? snapshot?.startStep ?? 1,
    };
  }

  private extractMetric(
    response: SimulationResponse,
    metric: AnalysisTargetMetric,
  ): number {
    if (metric === 'failureRate') {
      return response.summary.failureRate;
    }

    if (metric === 'finalChaosIndex') {
      return response.summary.finalChaosIndex;
    }

    if (metric === 'avgRiskScore') {
      return response.summary.avgRiskScore;
    }

    if (metric === 'avgFailureProbability') {
      return response.summary.avgFailureProbability;
    }

    if (metric === 'stabilizedCount') {
      return response.summary.stabilizedCount;
    }

    return response.summary.failedCount;
  }

  private getEffectDirection(effect: number): EffectDirection {
    if (effect > 1e-9) {
      return 'increase';
    }

    if (effect < -1e-9) {
      return 'decrease';
    }

    return 'no_change';
  }

  private getConfidenceLabel(effect: number): ConfidenceLabel {
    const absoluteEffect = Math.abs(effect);

    if (absoluteEffect >= 0.1) {
      return 'high';
    }

    if (absoluteEffect >= 0.03) {
      return 'medium';
    }

    return 'low';
  }

  private getEvidenceLabel(effect: number): EvidenceLabel {
    const absoluteEffect = Math.abs(effect);

    if (absoluteEffect >= 0.1) {
      return 'strong_single_seed_effect';
    }

    if (absoluteEffect >= 0.03) {
      return 'moderate_single_seed_effect';
    }

    return 'weak_single_seed_effect';
  }

  private cloneDto(dto: RunSimulationDto): RunSimulationDto {
    return structuredClone(dto);
  }
}
