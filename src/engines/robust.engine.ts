import { Injectable } from '@nestjs/common';
import { clamp, mean, std } from './math.util';
import {
  RobustAnalysisOptions,
  RobustCandidatePolicy,
  RobustObjective,
  RobustPolicyExplanation,
  RobustPolicyScore,
  RobustScenarioDescriptor,
} from '../simulation/types/analysis.type';
import {
  AnalysisExecutionRequest,
  AnalysisRunExecutor,
  RobustEvaluationResult,
} from './analysis-engine.type';
import { RunSimulationDto } from '../simulation/dto/run-simulation.dto';
import { SimulationResponse } from '../simulation/types/simulation-response.type';

interface RobustScenarioPlan {
  descriptor: RobustScenarioDescriptor;
  buildRequest: (
    baseDto: RunSimulationDto,
    candidate: RobustCandidatePolicy,
  ) => AnalysisExecutionRequest;
}

const ROBUST_SCORE_WEIGHTS = {
  expected: 0.45,
  worstCase: 0.35,
  tailRisk: 0.2,
  stability: 0,
} as const;

@Injectable()
export class RobustEngine {
  evaluate(
    baseDto: RunSimulationDto,
    options: RobustAnalysisOptions,
    execute: AnalysisRunExecutor,
  ): RobustEvaluationResult {
    const candidatePolicies = this.buildCandidatePolicies();
    const scenarioPlans = this.buildScenarioPlans().slice(
      0,
      options.scenarioCount,
    );
    const policyScores = new Map<string, RobustPolicyScore>();
    const scenarioScores: Record<string, number[]> = {};

    for (const candidate of candidatePolicies) {
      const scores = scenarioPlans.map((plan) => {
        const response = execute(
          plan.buildRequest(this.cloneDto(baseDto), candidate),
        );

        return this.computeObjectiveScore(response, options.objective);
      });

      scenarioScores[candidate.policyId] = scores;
      policyScores.set(
        candidate.policyId,
        this.buildPolicyScore(candidate, scores),
      );
    }

    const bestRobustScore = Math.max(
      ...Array.from(policyScores.values()).map((score) => score.robustScore),
    );
    const ranking = Array.from(policyScores.values())
      .map((score) => this.finalizePolicyScore(score, bestRobustScore))
      .sort((left, right) => {
        if (right.robustScore !== left.robustScore) {
          return right.robustScore - left.robustScore;
        }

        if (right.worstCaseScore !== left.worstCaseScore) {
          return right.worstCaseScore - left.worstCaseScore;
        }

        if (right.expectedScore !== left.expectedScore) {
          return right.expectedScore - left.expectedScore;
        }

        return left.policyId.localeCompare(right.policyId);
      });
    const recommended = ranking[0] ?? null;
    const candidateLookup = new Map(
      candidatePolicies.map((candidate) => [candidate.policyId, candidate]),
    );

    return {
      analysis: {
        enabled: true,
        evaluator: 'scenario_based_policy_evaluator',
        objective: options.objective,
        candidatePolicies,
        scenarioCount: scenarioPlans.length,
        scenarios: scenarioPlans.map((plan) => plan.descriptor),
        recommendedPolicy: recommended
          ? {
              ...recommended,
              label:
                candidateLookup.get(recommended.policyId)?.label ??
                recommended.policyId,
            }
          : null,
        expectedScores: this.toScoreMap(ranking, 'expectedScore'),
        worstCaseScores: this.toScoreMap(ranking, 'worstCaseScore'),
        tailRiskScores: this.toScoreMap(ranking, 'tailRiskScore'),
        ranking,
        frontier: ranking.slice(0, Math.min(3, ranking.length)),
        constraints: [
          'Оценка идёт поверх существующего движка без изменения raw simulation result.',
          'Phase 1 использует scenario-based evaluator, а не внешний solver.',
        ],
        notes: [
          'Сравниваются candidate policies baseline/fixed/adaptive/hybrid на одной и той же deterministic scenario matrix.',
          'Recommended policy выбирается по robust score из expected, worst-case и tail-risk компонентов.',
          'stabilityScore в Phase 1 остаётся диагностической метрикой и показывается отдельно, но не участвует в ranking formula.',
          'regret и scoreGapFromBest в Phase 1 означают aggregate robust-score gap from best policy, а не классический scenario-wise regret.',
        ],
      },
      scenarioScores,
    };
  }

  private buildCandidatePolicies(): RobustCandidatePolicy[] {
    return [
      {
        policyId: 'baseline',
        mode: 'baseline',
        label: 'Baseline',
        description: 'Report-only mode without immediate effects.',
      },
      {
        policyId: 'fixed',
        mode: 'fixed',
        label: 'Fixed control',
        description: 'Passive control group with fixed thresholds.',
      },
      {
        policyId: 'adaptive',
        mode: 'adaptive',
        label: 'Adaptive',
        description: 'Active policy with adaptive thresholds and effects.',
      },
      {
        policyId: 'hybrid',
        mode: 'hybrid',
        label: 'Hybrid',
        description: 'Adaptive policy with detailed breakdown telemetry.',
      },
    ];
  }

  private buildScenarioPlans(): RobustScenarioPlan[] {
    return [
      {
        descriptor: {
          id: 'event_intensity_high',
          label: 'Сильный всплеск интенсивности',
          description:
            'Primary event получает усиление intensity при прочих равных.',
        },
        buildRequest: (dto, candidate) => ({
          dto: {
            ...dto,
            mode: candidate.mode,
            activeEventOverride: {
              ...dto.activeEventOverride,
              intensity: clamp(
                (dto.activeEventOverride?.intensity ?? 0.8) * 1.25,
                0,
                1,
              ),
            },
          },
          modeOverride: candidate.mode,
          tag: `robust:${candidate.policyId}:event_intensity_high`,
        }),
      },
      {
        descriptor: {
          id: 'event_relevance_scope_high',
          label: 'Высокая релевантность и охват',
          description: 'Primary event усиливается по relevance и scope.',
        },
        buildRequest: (dto, candidate) => ({
          dto: {
            ...dto,
            mode: candidate.mode,
            activeEventOverride: {
              ...dto.activeEventOverride,
              relevance: clamp(
                (dto.activeEventOverride?.relevance ?? 0.9) * 1.15,
                0,
                1,
              ),
              scope: clamp(
                (dto.activeEventOverride?.scope ?? 0.75) * 1.15,
                0,
                1,
              ),
            },
          },
          modeOverride: candidate.mode,
          tag: `robust:${candidate.policyId}:event_relevance_scope_high`,
        }),
      },
      {
        descriptor: {
          id: 'noise_pressure_high',
          label: 'Высокий шум',
          description:
            'Усиливается stochastic noise в influence, temperature и transition.',
        },
        buildRequest: (dto, candidate) => ({
          dto: {
            ...dto,
            mode: candidate.mode,
          },
          modeOverride: candidate.mode,
          scenarioMutator: (_scenario, profile) => {
            profile.noise.influence = clamp(
              profile.noise.influence * 1.6,
              0,
              1,
            );
            profile.noise.temperature = clamp(
              profile.noise.temperature * 1.6,
              0,
              1,
            );
            profile.noise.transition = clamp(
              profile.noise.transition * 1.6,
              0,
              1,
            );
          },
          tag: `robust:${candidate.policyId}:noise_pressure_high`,
        }),
      },
      {
        descriptor: {
          id: 'reactive_segment_mix',
          label: 'Смесь сегментов смещена к reactive',
          description:
            'Доля reactive сегмента увеличивается за счёт stable и regular.',
        },
        buildRequest: (dto, candidate) => ({
          dto: {
            ...dto,
            mode: candidate.mode,
          },
          modeOverride: candidate.mode,
          scenarioMutator: (scenario) => {
            scenario.segmentDistribution = {
              stable: 0.24,
              regular: 0.38,
              reactive: 0.38,
            };
          },
          tag: `robust:${candidate.policyId}:reactive_segment_mix`,
        }),
      },
      {
        descriptor: {
          id: 'stress_memory_pressure',
          label: 'Давление stress-memory',
          description:
            'Инерция и failure coupling становятся более жёсткими под давлением.',
        },
        buildRequest: (dto, candidate) => ({
          dto: {
            ...dto,
            mode: candidate.mode,
          },
          modeOverride: candidate.mode,
          scenarioMutator: (_scenario, profile) => {
            profile.inertia.stressMemoryDecay = clamp(
              profile.inertia.stressMemoryDecay + 0.08,
              0,
              1,
            );
            profile.transitionImpact.failureCoupling = clamp(
              profile.transitionImpact.failureCoupling + 0.04,
              0,
              1,
            );
          },
          tag: `robust:${candidate.policyId}:stress_memory_pressure`,
        }),
      },
      {
        descriptor: {
          id: 'threshold_sensitivity_shift',
          label: 'Сдвиг чувствительности порогов',
          description:
            'Adaptive thresholds и system threshold становятся более чувствительными.',
        },
        buildRequest: (dto, candidate) => ({
          dto: {
            ...dto,
            mode: candidate.mode,
          },
          modeOverride: candidate.mode,
          scenarioMutator: (scenario, profile) => {
            scenario.adaptiveThresholds.localSigmaMultiplier = clamp(
              scenario.adaptiveThresholds.localSigmaMultiplier - 0.12,
              0.1,
              2,
            );
            scenario.adaptiveThresholds.globalSigmaMultiplier = clamp(
              scenario.adaptiveThresholds.globalSigmaMultiplier - 0.15,
              0.1,
              2,
            );
            profile.systemLayer.globalThresholdShift = clamp(
              profile.systemLayer.globalThresholdShift - 0.04,
              -0.5,
              0.5,
            );
          },
          tag: `robust:${candidate.policyId}:threshold_sensitivity_shift`,
        }),
      },
    ];
  }

  private buildPolicyScore(
    candidate: RobustCandidatePolicy,
    scores: number[],
  ): RobustPolicyScore {
    const expectedScore = mean(scores);
    const sortedScores = [...scores].sort((left, right) => left - right);
    const tailCount = Math.max(1, Math.ceil(sortedScores.length * 0.25));
    const tailRiskScore = mean(sortedScores.slice(0, tailCount));
    const worstCaseScore = sortedScores[0] ?? 0;
    const stabilityScore = clamp(1 - std(scores) / 0.25, 0, 1);
    const downside = clamp(expectedScore - worstCaseScore, 0, 1);
    const robustScore = clamp(
      expectedScore * ROBUST_SCORE_WEIGHTS.expected +
        worstCaseScore * ROBUST_SCORE_WEIGHTS.worstCase +
        tailRiskScore * ROBUST_SCORE_WEIGHTS.tailRisk,
      0,
      1,
    );

    return {
      policyId: candidate.policyId,
      mode: candidate.mode,
      expectedScore,
      worstCaseScore,
      tailRiskScore,
      stabilityScore,
      robustScore,
      regret: 0,
      scoreGapFromBest: 0,
      downside,
      explanation: this.buildExplanation({
        expectedScore,
        worstCaseScore,
        tailRiskScore,
        stabilityScore,
        downside,
      }),
    };
  }

  private finalizePolicyScore(
    score: RobustPolicyScore,
    bestRobustScore: number,
  ): RobustPolicyScore {
    const scoreGapFromBest = clamp(bestRobustScore - score.robustScore, 0, 1);

    return {
      ...score,
      regret: scoreGapFromBest,
      scoreGapFromBest,
    };
  }

  private buildExplanation(score: {
    expectedScore: number;
    worstCaseScore: number;
    tailRiskScore: number;
    stabilityScore: number;
    downside: number;
  }): RobustPolicyExplanation {
    const strongestFactors: string[] = [];

    if (score.worstCaseScore >= 0.75) {
      strongestFactors.push('лучше держится в худшем сценарии');
    }

    if (score.downside <= 0.12) {
      strongestFactors.push(
        'даёт меньшую просадку между средним и худшим исходом',
      );
    }

    if (score.tailRiskScore >= 0.72) {
      strongestFactors.push(
        'лучше удерживает хвостовой риск под стрессовыми возмущениями',
      );
    }

    if (score.stabilityScore >= 0.75) {
      strongestFactors.push(
        'диагностически показывает более ровный разброс между сценариями',
      );
    }

    if (strongestFactors.length === 0) {
      strongestFactors.push(
        'выбор сделан по суммарному robust score без одного доминирующего фактора',
      );
    }

    return {
      strongestFactors: strongestFactors.slice(0, 3),
      scoreFormula: {
        expectedWeight: ROBUST_SCORE_WEIGHTS.expected,
        worstCaseWeight: ROBUST_SCORE_WEIGHTS.worstCase,
        tailRiskWeight: ROBUST_SCORE_WEIGHTS.tailRisk,
        stabilityWeight: ROBUST_SCORE_WEIGHTS.stability,
        note: 'stabilityScore остаётся diagnostic-only в Phase 1 и не участвует в ranking formula.',
      },
    };
  }

  private computeObjectiveScore(
    response: SimulationResponse,
    objective: RobustObjective,
  ): number {
    if (objective === 'min_failure_rate') {
      return clamp(1 - response.summary.failureRate, 0, 1);
    }

    if (objective === 'min_chaos_index') {
      return clamp(1 - response.summary.finalChaosIndex, 0, 1);
    }

    if (objective === 'maximize_stabilization') {
      return clamp(response.summary.conversionRate, 0, 1);
    }

    return clamp(
      (1 - response.summary.failureRate) * 0.4 +
        (1 - response.summary.avgChaosIndex) * 0.3 +
        response.summary.conversionRate * 0.3,
      0,
      1,
    );
  }

  private toScoreMap(
    scores: RobustPolicyScore[],
    key: keyof Pick<
      RobustPolicyScore,
      'expectedScore' | 'worstCaseScore' | 'tailRiskScore'
    >,
  ): Record<string, number> {
    return Object.fromEntries(
      scores.map((score) => [score.policyId, score[key]]),
    );
  }

  private cloneDto(dto: RunSimulationDto): RunSimulationDto {
    return structuredClone(dto);
  }
}
